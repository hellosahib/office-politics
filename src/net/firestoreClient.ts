// Online play (D2): rooms/{code} holds the lobby, rooms/{code}/actions/{seq} the action log.
// Every client replays the log through the deterministic engine; nobody is authoritative.
import {
  collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp,
  type DocumentReference, type FieldValue, type Timestamp,
} from 'firebase/firestore';
import { Game, createRng, next } from '../engine';
import type { Action, ActionResult, GameConfig, PlayerId } from '../engine/types';
import type { GameClient, Lobby, LobbyPlayer, RoomHandle } from '../client';
import { getDb, getUid } from './firebase';
import { BOT_DELAY_MS, MAX_BOT_RUN, botAction, botSeat } from './bots';

type LobbyConfig = Omit<GameConfig, 'seed' | 'players'>;

/** rooms/{code} */
interface RoomDoc {
  code: string;
  hostUid: string;
  status: 'waiting' | 'started';
  config: LobbyConfig;
  players: LobbyPlayer[];
  /** Mirror of players[].uid — security rules can test `uid in uids`, not membership in a list of maps. */
  uids: string[];
  /** Number of action docs written; bumped in the same transaction as each action (gap-free seq). */
  actionCount: number;
  createdAt: Timestamp | FieldValue;
  seed?: number;
  startedPlayers?: { name: string; isBot: boolean }[];
}

/** rooms/{code}/actions/{seq padded to 6} */
interface ActionDoc { seq: number; action: Action; uid: string; at: Timestamp | FieldValue }

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const pad = (n: number) => String(n).padStart(6, '0');
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const roomRef = (code: string) => doc(getDb(), 'rooms', code) as DocumentReference<RoomDoc>;

function randomCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join(''); // 256 % 32 == 0, so unbiased
}

const cleanName = (name: string) => name.trim().slice(0, 24) || 'Player';

export async function createRoom(name: string, config: LobbyConfig): Promise<RoomHandle> {
  const uid = await getUid();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const ref = roomRef(code);
    const created = await runTransaction(getDb(), async (tx) => {
      if ((await tx.get(ref)).exists()) return false; // collision: try another code
      tx.set(ref, {
        code, hostUid: uid, status: 'waiting', config,
        players: [{ uid, name: cleanName(name), seat: 0 }], uids: [uid],
        actionCount: 0, createdAt: serverTimestamp(),
      });
      return true;
    });
    if (created) return roomHandle(code, uid, uid);
  }
  throw new Error('Could not allocate a room code, try again.');
}

export async function joinRoom(rawCode: string, name: string): Promise<RoomHandle> {
  const uid = await getUid();
  const code = rawCode.trim().toUpperCase();
  const ref = roomRef(code);
  const hostUid = await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (!room) throw new Error(`Room ${code} not found.`);
    // Rejoin keeps the seat; joining a started game makes you a spectator (client().me === null).
    if (room.uids.includes(uid) || room.status !== 'waiting') return room.hostUid;
    if (room.players.length >= room.config.playerCount) throw new Error('Room is full.');
    tx.update(ref, {
      players: [...room.players, { uid, name: cleanName(name), seat: room.players.length }],
      uids: [...room.uids, uid],
    });
    return room.hostUid;
  });
  return roomHandle(code, uid, hostUid);
}

function toLobby(r: RoomDoc): Lobby {
  return { code: r.code, hostUid: r.hostUid, players: r.players, config: r.config, status: r.status };
}

function roomHandle(code: string, myUid: string, hostUid: string): RoomHandle {
  const ref = roomRef(code);
  const unsubs: (() => void)[] = [];
  let clientP: Promise<GameClient> | undefined;

  return {
    code, myUid, isHost: myUid === hostUid,
    subscribe(listener) {
      const u = onSnapshot(ref, (s) => { const r = s.data(); if (r) listener(toLobby(r)); },
        (e) => console.error('room listener', e));
      unsubs.push(u);
      return u;
    },
    async start() {
      if (myUid !== hostUid) throw new Error('Only the host can start.');
      await runTransaction(getDb(), async (tx) => {
        const r = (await tx.get(ref)).data();
        if (!r || r.status !== 'waiting') return;
        const startedPlayers = Array.from({ length: r.config.playerCount }, (_, seat) => {
          const human = r.players.find((p) => p.seat === seat);
          return human ? { name: human.name, isBot: false } : { name: `Bot ${seat + 1}`, isBot: true };
        });
        tx.update(ref, { status: 'started', seed: crypto.getRandomValues(new Uint32Array(1))[0], startedPlayers });
      });
    },
    client() {
      return (clientP ??= new Promise<GameClient>((resolve, reject) => {
        const u = onSnapshot(ref, (s) => {
          const r = s.data();
          if (r?.status !== 'started' || r.seed === undefined || !r.startedPlayers) return;
          u();
          resolve(onlineClient(code, r, myUid));
        }, reject);
        unsubs.push(u);
      }));
    },
    leave() { unsubs.splice(0).forEach((u) => u()); },
  };
}

function onlineClient(code: string, room: RoomDoc, uid: string): GameClient {
  const config: GameConfig = { ...room.config, seed: room.seed!, players: room.startedPlayers! };
  const me: PlayerId | null = room.players.find((p) => p.uid === uid)?.seat ?? null;
  const isHost = uid === room.hostUid;
  const seatOf = new Map(room.players.map((p) => [p.uid, p.seat]));
  const ref = roomRef(code);
  const actionsCol = collection(ref, 'actions');
  const game = Game.create(config);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const botRng = createRng((config.seed ^ 0x5eed_b07) >>> 0);

  /** Number of log entries applied == next seq to write. */
  let applied = 0;
  let closed = false;
  let driving = false;
  let botRun = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // A log entry only counts if its writer owns the seat (or is the host acting for a bot).
  // Every client applies the same filter, so a forged action is ignored everywhere.
  const authorised = (a: Action, by: string) =>
    seatOf.get(by) === a.player || (by === room.hostUid && config.players[a.player]?.isBot === true);

  const unsubActions = onSnapshot(query(actionsCol, orderBy('seq')), (snap) => {
    // The log is append-only and gap-free (enforced by rules), so the docs we've applied are
    // a stable prefix: apply only the tail. Stop at any gap (e.g. a partial cached snapshot).
    const docs = snap.docs;
    let changed = false;
    while (applied < docs.length) {
      const d = docs[applied].data() as ActionDoc;
      if (d.seq !== applied) break;
      // Illegal entries (double-clicks racing) are rejected identically by every engine.
      if (authorised(d.action, d.uid)) game.dispatch(d.action);
      applied++;
      changed = true;
    }
    if (changed) { botRun = botSeat(game) === null ? 0 : botRun; notify(); driveBots(); }
  }, (e) => console.error('actions listener', e));

  async function write(action: Action): Promise<ActionResult> {
    if (closed) return { ok: false, error: 'Left the game.' };
    const probe = new Game(structuredClone(game.state)).dispatch(action);
    if (!probe.ok) return probe;
    const seen = applied;
    try {
      await runTransaction(getDb(), async (tx) => {
        const n = (await tx.get(ref)).data()?.actionCount;
        // Someone wrote since our last snapshot: our validation is stale; let the UI retry.
        if (n !== seen) throw new Error('Game moved on, try again.');
        tx.update(ref, { actionCount: n + 1 });
        tx.set(doc(actionsCol, pad(n)), { seq: n, action, uid, at: serverTimestamp() } satisfies ActionDoc);
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  }

  // Only the host drives bots, one write at a time; the next step waits for our own write
  // to come back through the snapshot so each decision sees the latest state.
  function driveBots() {
    if (!isHost || driving || closed) return;
    const seat = botSeat(game);
    if (seat === null) return;
    if (botRun >= MAX_BOT_RUN) return console.error(`bot loop stopped after ${MAX_BOT_RUN} actions`);
    driving = true;
    const at = applied;
    timer = setTimeout(async () => {
      let retry = false;
      if (applied === at && botSeat(game) === seat) {
        botRun++;
        const r = await write(botAction(game, seat, () => next(botRng)));
        if (!r.ok) { console.warn('bot write failed', r.error); retry = applied === at; }
      }
      driving = false;
      if (applied !== at) driveBots();               // snapshot landed while we were writing
      else if (retry) timer = setTimeout(driveBots, 2000); // offline/contention: try again later
    }, BOT_DELAY_MS);
  }

  return {
    kind: 'online',
    me,
    // Spectators get the public view (viewer null).
    getView: () => game.view(me as PlayerId),
    dispatch: (action) => (me === null ? Promise.resolve({ ok: false, error: 'Spectating.' }) : write(action)),
    legalTargets: (cardId) => (me === null ? [] : game.legalTargets(me, cardId)),
    predict: (cardId, targetId) => game.predict(me ?? 0, cardId, targetId),
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    leave() { closed = true; clearTimeout(timer); unsubActions(); listeners.clear(); },
  };
}
