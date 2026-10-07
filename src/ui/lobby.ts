// Lobby: Local (pass & play) setup, Online create/join + waiting room.
import type { GameConfig, GameMode } from '../engine/types';
import { DEFAULT_PLAYER_NAMES, PLAYER_COLORS } from '../engine/types';
import type { GameClient, Lobby, RoomHandle } from '../client';
import { createLocalClient, createRoom, isOnlineAvailable, joinRoom } from '../net';
import { esc } from './helpers';
import { openHelp } from './howToPlay';

const NAME_KEY = 'officePolitics.name';
const loadName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ } };
const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

const s = {
  tab: 'local' as 'local' | 'online',
  count: 3 as 3 | 4,
  names: [...DEFAULT_PLAYER_NAMES],
  bots: [false, false, false, false],
  mode: 'Takeover' as GameMode,
  rounds: 10 as 8 | 10 | 12 | 15,
  board: 'full' as 'full' | 'mini',
  seed: randomSeed(),
  myName: loadName(),
  joinCode: '',
  error: '',
  busy: false,
  room: null as RoomHandle | null,
  lobby: null as Lobby | null,
};

const playerCount = () => (s.board === 'mini' ? 3 : s.count);

function configControls(): string {
  const opt = (v: string | number, cur: string | number, label = String(v)) =>
    `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
  return `<div class="form-grid">
    <label>Board <select data-field="board">${opt('full', s.board, 'Full (7 departments)')}${opt('mini', s.board, 'Mini prototype (4 departments)')}</select></label>
    <label>Players <select data-field="count" ${s.board === 'mini' ? 'disabled' : ''}>${opt(3, playerCount())}${opt(4, playerCount())}</select></label>
    <label>Mode <select data-field="mode">${opt('Takeover', s.mode)}${opt('Election', s.mode)}</select></label>
    ${s.mode === 'Election' ? `<label>Rounds <select data-field="rounds">${[8, 10, 12, 15].map(r => opt(r, s.rounds)).join('')}</select></label>` : ''}
  </div>`;
}

function localHtml(): string {
  const seats = Array.from({ length: playerCount() }, (_, i) => `<div class="seat" style="--pc:${PLAYER_COLORS[i]}">
      <span class="seat-dot"></span>
      <input type="text" aria-label="Seat ${i + 1} name" data-field="name" data-i="${i}" value="${esc(s.names[i])}" maxlength="20">
      <label class="check"><input type="checkbox" data-field="bot" data-i="${i}" ${s.bots[i] ? 'checked' : ''}> Bot</label>
    </div>`).join('');
  return `${configControls()}
    <div class="sec-title">Seats</div><div class="seats">${seats}</div>
    <label class="seed">Seed <input type="number" data-field="seed" value="${s.seed}"></label>
    <div class="row"><button type="button" class="primary big-btn" data-act="start-local">Start game</button>
      <button type="button" data-act="help">How to play</button></div>`;
}

function onlineHtml(): string {
  if (!isOnlineAvailable()) return '<p class="muted">Online play isn\'t configured for this build (Firebase settings missing). Use Local.</p>';
  return `<label class="wide">Your name <input type="text" data-field="myName" value="${esc(s.myName)}" maxlength="20"></label>
    <div class="online-cols">
      <div class="box"><h3>Create room</h3>${configControls()}
        <button type="button" class="primary" data-act="create-room" ${s.busy ? 'disabled' : ''}>Create room</button></div>
      <div class="box"><h3>Join room</h3>
        <label>Room code <input type="text" data-field="joinCode" value="${esc(s.joinCode)}" maxlength="6" autocapitalize="characters"></label>
        <button type="button" class="primary" data-act="join-room" ${s.busy ? 'disabled' : ''}>Join</button></div>
    </div>`;
}

function roomHtml(): string {
  const room = s.room!, l = s.lobby;
  if (!l) return `<div class="lobby-card"><p>Connecting to room ${esc(room.code)}…</p></div>`;
  const seats = Array.from({ length: l.config.playerCount }, (_, i) => {
    const p = l.players.find(x => x.seat === i);
    return `<li class="seat" style="--pc:${PLAYER_COLORS[i]}"><span class="seat-dot"></span>${p ? `${esc(p.name)}${p.uid === l.hostUid ? ' <span class="tag">host</span>' : ''}${p.uid === room.myUid ? ' <span class="tag">you</span>' : ''}` : '<span class="muted">empty — a bot will play</span>'}</li>`;
  }).join('');
  return `<div class="lobby-card">
    <h2>Room <span class="code">${esc(room.code)}</span></h2>
    <p class="muted">Share this code. ${esc(l.config.mode)}${l.config.rounds && l.config.mode === 'Election' ? ` · ${l.config.rounds} rounds` : ''} · ${l.config.board} board · ${l.config.playerCount} players</p>
    <ul class="seats">${seats}</ul>
    ${s.error ? `<p class="bad">${esc(s.error)}</p>` : ''}
    <div class="row">
      ${room.isHost ? `<button type="button" class="primary big-btn" data-act="room-start" ${s.busy || l.status === 'started' ? 'disabled' : ''}>Start</button>` : '<span class="muted">Waiting for the host to start…</span>'}
      <button type="button" data-act="room-leave">Leave</button>
    </div></div>`;
}

function lobbyHtml(): string {
  if (s.room) return roomHtml();
  return `<div class="lobby-card">
    <button type="button" class="link lobby-help" data-act="help">? How to play</button>
    <h1 class="title">Office Politics</h1>
    <p class="muted tagline">Win the office. Lose your friends.</p>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${s.tab === 'local'}" data-act="tab" data-tab="local">Local (pass &amp; play)</button>
      <button type="button" role="tab" aria-selected="${s.tab === 'online'}" data-act="tab" data-tab="online">Online</button>
    </div>
    ${s.tab === 'local' ? localHtml() : onlineHtml()}
    ${s.error ? `<p class="bad">${esc(s.error)}</p>` : ''}
  </div>`;
}

function buildConfig(players: GameConfig['players']): GameConfig {
  return {
    playerCount: playerCount(), mode: s.mode, seed: s.seed, players, board: s.board,
    ...(s.mode === 'Election' ? { rounds: s.rounds } : {}),
  };
}

/** Mounts the lobby. `onGame` receives a ready client. Returns dispose. */
export function mountLobby(root: HTMLElement, onGame: (c: GameClient) => void): () => void {
  root.innerHTML = '<div class="lobby"></div>';
  const el = root.querySelector<HTMLElement>('.lobby')!;
  let unsubRoom: (() => void) | null = null;
  let disposed = false;
  const render = () => { if (!disposed) el.innerHTML = lobbyHtml(); };

  async function enterRoom(p: Promise<RoomHandle>) {
    s.busy = true; s.error = ''; render();
    try {
      const room = await p;
      s.room = room; s.lobby = null;
      unsubRoom = room.subscribe(l => { s.lobby = l; render(); });
      room.client().then(c => { if (s.room === room && !disposed) { dispose(); onGame(c); } },
        e => { s.error = String(e?.message ?? e); render(); });
    } catch (e) { s.error = String((e as Error)?.message ?? e); }
    s.busy = false; render();
  }
  function leaveRoom() {
    unsubRoom?.(); unsubRoom = null;
    s.room?.leave(); s.room = null; s.lobby = null; s.error = '';
    render();
  }

  const act: Record<string, (t: HTMLElement) => void> = {
    'tab': t => { s.tab = t.dataset.tab as 'local' | 'online'; s.error = ''; render(); },
    'start-local': () => {
      const n = playerCount();
      const players = s.names.slice(0, n).map((name, i) => ({ name: name.trim() || DEFAULT_PLAYER_NAMES[i], isBot: s.bots[i] }));
      if (players.every(p => p.isBot)) { s.error = 'At least one seat must be human.'; render(); return; }
      let client: GameClient;
      try { client = createLocalClient(buildConfig(players)); }
      catch (e) { s.error = String((e as Error)?.message ?? e); render(); return; }
      dispose(); onGame(client);
    },
    'create-room': () => {
      if (!s.myName.trim()) { s.error = 'Enter your name first.'; render(); return; }
      saveName(s.myName.trim());
      void enterRoom(createRoom(s.myName.trim(), buildConfig([{ name: s.myName.trim(), isBot: false }])));
    },
    'join-room': () => {
      if (!s.myName.trim() || !s.joinCode.trim()) { s.error = 'Enter your name and the room code.'; render(); return; }
      saveName(s.myName.trim());
      void enterRoom(joinRoom(s.joinCode.trim().toUpperCase(), s.myName.trim()));
    },
    'room-start': async () => {
      s.busy = true; render();
      try { await s.room!.start(); } catch (e) { s.error = String((e as Error)?.message ?? e); }
      s.busy = false; render();
    },
    'room-leave': () => leaveRoom(),
    'help': () => openHelp(),
  };

  const onClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (t && !(t as HTMLButtonElement).disabled) act[t.dataset.act!]?.(t);
  };
  // Text fields update state silently; selects/checkboxes re-render (their layout depends on them).
  const onInput = (e: Event) => {
    const t = e.target as HTMLInputElement;
    const i = Number(t.dataset.i);
    switch (t.dataset.field) {
      case 'name': s.names[i] = t.value; break;
      case 'myName': s.myName = t.value; break;
      case 'joinCode': s.joinCode = t.value; break;
      case 'seed': s.seed = Number(t.value) || 0; break;
    }
  };
  const onChange = (e: Event) => {
    const t = e.target as HTMLInputElement;
    switch (t.dataset.field) {
      case 'count': s.count = Number(t.value) as 3 | 4; break;
      case 'mode': s.mode = t.value as GameMode; break;
      case 'rounds': s.rounds = Number(t.value) as 8 | 10 | 12 | 15; break;
      case 'board': s.board = t.value as 'full' | 'mini'; break;
      case 'bot': s.bots[Number(t.dataset.i)] = t.checked; break;
      default: return;
    }
    render();
  };
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('change', onChange);
  // A room that was open when we left to a game is not resumed; start fresh each mount.
  s.room = null; s.lobby = null; s.error = ''; s.busy = false; s.seed = randomSeed();
  render();

  function dispose() {
    disposed = true;
    unsubRoom?.(); unsubRoom = null;
  }
  return dispose;
}
