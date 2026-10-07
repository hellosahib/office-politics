// Office Politics rules engine. § = docs/SPEC.md, D = docs/DECISIONS.md.
// Deterministic: all randomness via ./rng on state.rng; dispatch validates before mutating.
import { AGENDAS, DEPARTMENTS, EMPLOYEES, MINI_DEPARTMENTS, buildEventDeck, buildInfluenceDeck } from '../content';
import { createRng, nextInt, pick, shuffle } from './rng';
import {
  DEFAULT_PLAYER_NAMES, HAND_SIZE, MAX_RESERVE, PLAYER_COLORS, RANK_BONUS, TRAIT_DIMENSIONS, TRAIT_LABEL, dimensionOf,
} from './types';
import type {
  Action, ActionResult, ActiveEvent, CardId, Employee, EmployeeId, EventOption, GameConfig, GameState as S, GameView,
  Pending, Player, PlayerId, Prediction, TraitDimension,
} from './types';
import {
  D, E, alive, applyEffects, checkPlay, deptsOf, draw, endGame, influenceMax, instability, isNegative, knows, log,
  managementCost, maxRounds, move, newSummary, resolvePlay, revealPrompt, settle, spendFor, traitMod, traitsOf,
} from './rules';
import { buildView } from './view';

export class Game {
  state: S;

  constructor(state: S) {
    this.state = state;
    state.interrupts ??= [];
  }

  static create(config: GameConfig): Game {
    const g = new Game(setup(config));
    startTurn(g.state);
    return g;
  }

  /** Rebuild from an action log; illegal actions are skipped exactly as live dispatch rejects them (D2). */
  static replay(config: GameConfig, actions: Action[]): Game {
    const g = Game.create(config);
    for (const a of actions) g.dispatch(a);
    return g;
  }

  dispatch(action: Action): ActionResult {
    const s = this.state;
    if (s.phase === 'gameOver') return { ok: false, error: 'The game is over' };
    const p = s.players[action.player];
    if (!p || p.eliminated) return { ok: false, error: 'Unknown or eliminated player' };
    let error: string | null;
    try {
      error = handle(s, action);
    } catch (e) {
      return { ok: false, error: `Engine error: ${(e as Error).message}` };
    }
    if (error) return { ok: false, error };
    s.actionCount++;
    return { ok: true };
  }

  view(viewer: PlayerId | null): GameView {
    return buildView(this.state, viewer);
  }

  legalTargets(player: PlayerId, cardId: CardId): EmployeeId[] {
    const s = this.state;
    return s.employees.filter((e) => !('error' in checkPlay(s, player, cardId, e.id, false))).map((e) => e.id);
  }

  /** §60 forecast using only traits the player knows. */
  predict(player: PlayerId, cardId: CardId, targetId: EmployeeId): Prediction {
    const s = this.state;
    const p = s.players[player];
    const card = p && (p.hand.find((c) => c.id === cardId) ?? p.reserve.find((c) => c.id === cardId));
    const e = s.employees.find((x) => x.id === targetId);
    if (!card || !e) {
      return { requiredSpend: 0, base: 0, rankBonus: 0, eventBonus: 0, traitMods: [], unknownTraitMayAffect: false,
        min: 0, max: 0, legal: false, reason: 'Unknown card or target' };
    }
    const v = checkPlay(s, player, cardId, targetId, true);
    const known = traitsOf(e).filter((t) => knows(s, player, e, t.slot));
    const traitMods = known.map((t) => ({ trait: t.trait, value: traitMod(card, t.trait, t.w) })).filter((t) => t.value);
    const rankBonus = RANK_BONUS[p.rank];
    const total = card.baseEffect + rankBonus + p.actionBonus + traitMods.reduce((n, t) => n + t.value, 0);
    return {
      requiredSpend: spendFor(card, e), base: card.baseEffect, rankBonus, eventBonus: p.actionBonus, traitMods,
      unknownTraitMayAffect: known.length < 3, min: total - 1, max: total + 1,
      legal: !('error' in v), ...('error' in v ? { reason: v.error } : {}),
    };
  }
}

// ---------------------------------------------------------------- setup (§5, §77, D10)
function setup(config: GameConfig): S {
  const mini = config.board === 'mini';
  const cfg: GameConfig = { ...config, players: config.players.map((p) => ({ ...p })), playerCount: mini ? 3 : config.playerCount };
  const rng = createRng(config.seed);
  const defs = mini ? MINI_DEPARTMENTS : DEPARTMENTS;
  const ids = new Set(defs.map((d) => d.id));
  const employees: Employee[] = EMPLOYEES.filter((e) => ids.has(e.deptId)).map((def) => {
    // §77: two different dimensions other than the permanent one, random pole each; first +2, second 0.
    const dims = shuffle(rng, (Object.keys(TRAIT_DIMENSIONS) as TraitDimension[]).filter((d) => d !== dimensionOf(def.permanentTrait)));
    const [h1, h2] = dims.slice(0, 2).map((d) => TRAIT_DIMENSIONS[d][nextInt(rng, 2)]);
    return { ...def, hiddenTrait1: h1, hiddenTrait1Revealed: false, hiddenTrait2: h2, hiddenTrait2Revealed: false,
      loyalty: 'Neutral', politicalOwner: null, rebelInclination: null, hostileContributions: {}, promise: null, mole: null };
  });
  const departments = defs.map((d) => ({ ...d, adjacency: [...d.adjacency],
    employeeIds: employees.filter((e) => e.deptId === d.id).map((e) => e.id), teamLead: null as PlayerId | null, protectedUntilRound: 0 }));
  const n = cfg.playerCount;
  const starts = shuffle(rng, departments.map((d) => d.id)).slice(0, n); // §5 without replacement
  const agendas = cfg.mode === 'Election' && !mini ? shuffle(rng, AGENDAS.map((a) => a.id)) : [];
  const players: Player[] = Array.from({ length: n }, (_, i) => ({
    id: i, name: cfg.players[i]?.name || DEFAULT_PLAYER_NAMES[i], isBot: cfg.players[i]?.isBot ?? false,
    color: PLAYER_COLORS[i], rank: 'TeamLead', promotionPoints: 0, influence: 0, hand: [], reserve: [],
    agenda: agendas[i] ?? null, eliminated: false, intel: [], targetedThisTurn: [], severity: 0, actionBonus: 0,
    stats: { rebelsCreated: 0, capturedNeutral: false, lostStartingDept: false, startingDept: starts[i],
      negativeEventsResolved: 0, privateReveals: 0, molesPlanted: 0, maxActiveMoles: 0, reachedVPRound: null,
      influenceSpent: 0, cardsPlayed: 0 },
  }));
  starts.forEach((id, i) => { departments.find((d) => d.id === id)!.teamLead = i; });
  const s: S = {
    config: cfg, rng, round: 1, currentPlayer: 0, firstPlayer: 0, phase: 'event',
    pending: { kind: 'play', player: 0, focus: null }, focus: null, departments, employees, players,
    influenceDeck: shuffle(rng, buildInfluenceDeck(cfg.board)), influenceDiscard: [],
    eventDeck: shuffle(rng, buildEventDeck(cfg.board)), eventDiscard: [], activeEvent: null, log: [],
    turnSummary: null, winner: null, scores: null, actionCount: 0, interrupts: [],
  };
  for (const p of players) draw(s, p, HAND_SIZE); // §5: 4 cards in hand at start (D26: no extra draw in round 1)
  log(s, `New ${cfg.mode} game on the ${cfg.board} board: ${players.map((p) => `${p.name} leads ${D(s, p.stats.startingDept).name}`).join(', ')}.`);
  return s;
}

// ---------------------------------------------------------------- turn flow (§53, §54)
/** Re-reads phase (defeats TS narrowing after calls that may end the game). */
const isOver = (s: S) => s.phase === 'gameOver';
function setPending(s: S, p: Pending) {
  s.pending = p;
  s.phase = p.kind === 'eventChoice' || p.kind === 'eventTarget' || p.kind === 'revealChoice' ? 'event' : p.kind;
}

function startTurn(s: S) {
  const p = s.players[s.currentPlayer];
  s.turnSummary = newSummary(p.id);
  s.focus = null;
  p.influence += influenceMax(s, p); // D25: refresh before the event; off-turn gains carry in
  log(s, `Round ${s.round}: ${p.name}'s turn.`, 'public', 'turn');
  if (!s.eventDeck.length) { s.eventDeck = shuffle(s.rng, s.eventDiscard); s.eventDiscard = []; }
  const card = s.eventDeck.pop();
  if (!card) return afterEvent(s, false);
  const ev: ActiveEvent = { card, deptId: null, votes: {}, targets: {}, remaining: [], outcome: null, queue: [] };
  s.activeEvent = ev;
  log(s, `Event — ${card.title} (${card.type}): ${card.situation}`, 'public', 'event');
  if (card.type === 'Reveal') {
    const q = revealPrompt(s, p.id, s.employees); // D21
    if (q) s.interrupts!.push(q);
    else log(s, 'Nothing left to reveal; the event is discarded.', 'public', 'event');
  } else if (card.type === 'Local') {
    const d = pick(s.rng, deptsOf(s, p.id)); // §47
    ev.deptId = d.id;
    ev.targets[`dept:${p.id}`] = d.id;
    ev.remaining = [p.id];
  } else {
    ev.remaining = turnOrder(s, p.id); // §46 every active player votes
  }
  advance(s);
}

/** Alive players in seat order starting at `from`. */
function turnOrder(s: S, from: PlayerId): PlayerId[] {
  const n = s.players.length;
  return Array.from({ length: n }, (_, k) => (from + k) % n).filter((id) => !s.players[id].eliminated);
}
function nextAlive(s: S, from: PlayerId): PlayerId | null {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) if (!s.players[(from + k) % n].eliminated) return (from + k) % n;
  return null;
}

/** Drive the event phase until the engine needs input. */
function advance(s: S) {
  for (let guard = 0; guard < 1000; guard++) {
    if (s.phase === 'gameOver') return;
    const q = s.interrupts!.shift();
    if (q) {
      if (interruptValid(s, q)) return setPending(s, q);
      continue;
    }
    const ev = s.activeEvent;
    if (!ev) return;
    const r = stepEvent(s, ev);
    if (r === 'wait') return;
    if (r === 'done') return finishEvent(s, ev);
  }
  throw new Error('advance did not converge');
}

function interruptValid(s: S, q: Pending): boolean {
  if (q.kind === 'revealChoice') return !s.players[q.player].eliminated;
  if (q.kind !== 'accusation') return true;
  const e = E(s, q.employeeId);
  const ok = !!e.mole && !s.players[q.player].eliminated && D(s, e.deptId).teamLead === q.player;
  if (!ok && e.mole?.exposed) { e.mole = null; log(s, `The exposed mole on ${e.name} slips away unaccused.`, 'public', 'mole'); }
  return ok;
}

function optionFor(ev: ActiveEvent, pid: PlayerId): { opt: EventOption; minority: boolean } {
  const majority = ev.card.type === 'Global' && ev.card.resolution !== 'individual';
  const id = majority ? ev.outcome! : ev.votes[pid];
  return { opt: ev.card.options.find((o) => o.id === id)!, minority: majority && ev.votes[pid] !== id };
}
const effectsFor = (ev: ActiveEvent, pid: PlayerId) => {
  const { opt, minority } = optionFor(ev, pid);
  return [...opt.effects, ...(minority ? opt.minorityEffects ?? [] : [])];
};

/** Apply one player's share of the event (or ask them for a target). */
function stepEvent(s: S, ev: ActiveEvent): 'wait' | 'continue' | 'done' {
  if (ev.remaining.length) {
    setPending(s, { kind: 'eventChoice', player: ev.remaining[0], eventId: ev.card.id, deptId: ev.deptId });
    return 'wait';
  }
  const queue = ev.queue ?? [];
  const pid = queue[0];
  if (pid === undefined) return 'done';
  const owned = deptsOf(s, pid);
  if (s.players[pid].eliminated || (!owned.length && !ev.targets[`dept:${pid}`])) { queue.shift(); return 'continue'; }
  const { opt } = optionFor(ev, pid);
  let deptId = ev.targets[`dept:${pid}`];
  if (!deptId) {
    if (opt.chooseDept && owned.length > 1) {
      setPending(s, { kind: 'eventTarget', player: pid, eventId: ev.card.id, optionId: opt.id, choose: 'dept', candidates: owned.map((d) => d.id) });
      return 'wait';
    }
    deptId = ev.targets[`dept:${pid}`] = pick(s.rng, owned).id;
  }
  const d = D(s, deptId);
  const chosen = ev.targets[`employee:${pid}`] ?? null;
  if (opt.chooseEmployee && chosen === null) {
    setPending(s, { kind: 'eventTarget', player: pid, eventId: ev.card.id, optionId: opt.id, choose: 'employee', candidates: [...d.employeeIds] });
    return 'wait';
  }
  queue.shift();
  applyEffects(s, pid, effectsFor(ev, pid), d, chosen, ev.card.type === 'Local', ev.votes[pid] === opt.id ? pid : null);
  return 'continue';
}

function finishEvent(s: S, ev: ActiveEvent) {
  s.eventDiscard.push(ev.card);
  s.activeEvent = null;
  // D23 Corporate Fixer: off-turn players have no management check, so a negative event counts at once.
  const neg = Object.keys(ev.votes).map(Number).filter((pid) => !s.players[pid].eliminated && effectsFor(ev, pid).some(isNegative));
  for (const pid of neg) if (pid !== s.currentPlayer) s.players[pid].stats.negativeEventsResolved++;
  afterEvent(s, neg.includes(s.currentPlayer));
}

/** Phases 3–4: management cost (§8, §9), draw (§30), then play. */
function afterEvent(s: S, negativeEvent: boolean) {
  const p = s.players[s.currentPlayer];
  if (p.eliminated) return nextTurn(s);
  const cost = managementCost(s, p.id);
  if (p.influence >= cost) {
    p.influence -= cost;
    if (cost) log(s, `${p.name} pays ${cost} Influence in management cost.`);
  } else {
    p.influence = 0;
    instability(s, p);
  }
  if (negativeEvent && !s.turnSummary?.managementPenalty) p.stats.negativeEventsResolved++;
  if (s.phase === 'gameOver') return;
  if (p.eliminated) return nextTurn(s);
  if (s.round > 1) draw(s, p, HAND_SIZE); // D26: round-1 hands were dealt at setup
  setPending(s, { kind: 'play', player: p.id, focus: null });
}

/** Phase 10 → next alive player; on wrap start a new round (§54, D22). */
function nextTurn(s: S) {
  const p = s.players[s.currentPlayer];
  s.influenceDiscard.push(...p.hand);
  p.hand = [];
  p.influence = 0; // §7 unused Influence does not carry over (D25)
  p.targetedThisTurn = [];
  p.actionBonus = 0;
  s.focus = null;
  if (s.phase === 'gameOver') return;
  const n = s.players.length;
  const dist = (x: PlayerId) => (x - s.firstPlayer + n) % n;
  let nxt = nextAlive(s, p.id);
  if (nxt === null) return;
  if (dist(nxt) <= dist(p.id)) {
    s.round++;
    startRound(s);
    if (isOver(s)) return;
    s.firstPlayer = nextAlive(s, s.firstPlayer)!; // marker rotates one alive seat
    nxt = s.firstPlayer;
  }
  s.currentPlayer = nxt;
  startTurn(s);
}

function startRound(s: S) {
  const max = maxRounds(s);
  if (max !== null && s.round > max) return endGame(s, null); // D22: after the final round
  log(s, `Round ${s.round} begins.`, 'public', 'round');
  for (const e of s.employees) {
    if (e.mole && s.round >= e.mole.expiresRound) {
      log(s, `Your mole on ${e.name} has expired.`, e.mole.creator, 'mole');
      e.mole = null;
    }
    if (e.promise && s.round >= e.promise.expiresRound) {
      // D14: an unresolved promise costs one loyalty state
      e.promise = null;
      log(s, `${e.name}'s promotion promise expired unfulfilled.`, 'public', 'event');
      move(s, e, -1, { actor: null, credit: null });
    }
  }
  settle(s);
}

// ---------------------------------------------------------------- actions
function handle(s: S, a: Action): string | null {
  const pd = s.pending;
  const p = s.players[a.player];
  const mine = 'player' in pd && pd.player === a.player;
  switch (a.type) {
    case 'eventChoice': {
      const ev = s.activeEvent;
      if (pd.kind !== 'eventChoice' || !mine || !ev) return 'Not waiting for your event choice';
      if (!ev.card.options.some((o) => o.id === a.optionId)) return 'Unknown option';
      ev.votes[a.player] = a.optionId;
      ev.remaining.shift();
      if (!ev.remaining.length) closeVoting(s, ev);
      advance(s);
      return null;
    }
    case 'eventTarget': {
      const ev = s.activeEvent;
      if (pd.kind !== 'eventTarget' || !mine || !ev) return 'Not waiting for your event target';
      if (!pd.candidates.includes(a.targetId)) return 'Invalid target';
      ev.targets[`${pd.choose}:${a.player}`] = a.targetId;
      advance(s);
      return null;
    }
    case 'revealChoice': {
      if (pd.kind !== 'revealChoice' || !mine) return 'Not waiting for your reveal choice';
      const e = E(s, pd.employeeId);
      if (a.mode === 'private') {
        if (p.influence < 1) return 'A private reveal costs 1 Influence'; // §29
        p.influence--;
        p.intel.push({ employeeId: e.id, trait: pd.trait, weight: pd.weight });
        p.stats.privateReveals++;
        log(s, `Intel: ${e.name} is ${TRAIT_LABEL[pd.trait]} (${pd.weight ? '+2' : '0'}).`, p.id, 'reveal');
        log(s, `${p.name} kept a revealed trait about ${e.name} private.`, 'public', 'reveal');
      } else {
        if (pd.weight === 2) e.hiddenTrait1Revealed = true;
        else e.hiddenTrait2Revealed = true;
        log(s, `Revealed: ${e.name} is ${TRAIT_LABEL[pd.trait]} (${pd.weight ? '+2' : '0'}).`, 'public', 'reveal');
      }
      advance(s);
      return null;
    }
    case 'focus': {
      if (pd.kind !== 'play' || !mine) return 'Not your play phase';
      if (s.focus && p.targetedThisTurn.length) return 'Focus is locked once a card has been played';
      s.focus = a.focus;
      setPending(s, { kind: 'play', player: a.player, focus: a.focus });
      log(s, `${p.name} chose to ${a.focus}.`);
      return null;
    }
    case 'playCard': {
      const v = checkPlay(s, a.player, a.cardId, a.targetId, true);
      if ('error' in v) return v.error;
      resolvePlay(s, a.player, v.card, v.e, v.spend);
      if (s.phase !== 'gameOver' && p.eliminated) nextTurn(s); // knocked themselves out
      return null;
    }
    case 'donePlaying':
      if (pd.kind !== 'play' || !mine) return 'Not your play phase';
      setPending(s, { kind: 'save', player: a.player });
      return null;
    case 'save': {
      if (pd.kind !== 'save' || !mine) return 'Not your save phase';
      const ids = new Set(a.cardIds);
      if (ids.size !== a.cardIds.length || a.cardIds.some((id) => !p.hand.some((c) => c.id === id))) return 'Can only save cards from this turn\'s hand';
      if (ids.size > p.influence) return 'Saving costs 1 Influence per card'; // §34
      if (p.reserve.length + ids.size > MAX_RESERVE) return `Reserve holds at most ${MAX_RESERVE} cards`;
      const kept = p.hand.filter((c) => ids.has(c.id));
      p.reserve.push(...kept);
      s.influenceDiscard.push(...p.hand.filter((c) => !ids.has(c.id)));
      p.hand = [];
      p.influence -= ids.size;
      if (s.turnSummary) { s.turnSummary.cardsSaved = kept.map((c) => c.name); s.turnSummary.influenceSpent += ids.size; }
      setPending(s, { kind: 'summary', player: a.player });
      return null;
    }
    case 'endTurn':
      if (pd.kind !== 'summary' || !mine) return 'Not waiting for you to end the turn';
      nextTurn(s);
      return null;
    case 'giveCard': {
      // D13: any alive player may gift a RESERVE card during the play phase.
      if (pd.kind !== 'play') return 'Cards can only be traded during the play phase';
      const card = p.reserve.find((c) => c.id === a.cardId);
      const to = s.players[a.toPlayer];
      if (!card) return 'Only saved (reserve) cards can be traded'; // §34
      if (!to || to.eliminated || to.id === p.id) return 'Invalid recipient';
      if (to.reserve.length >= MAX_RESERVE) return `${to.name}'s reserve is full`;
      p.reserve = p.reserve.filter((c) => c.id !== card.id);
      to.reserve.push(card);
      log(s, `${p.name} gave ${card.name} to ${to.name}.`);
      return null;
    }
    case 'exposeIntel': {
      if (pd.kind !== 'play') return 'Intel can only be exposed during the play phase';
      const e = s.employees.find((x) => x.id === a.employeeId);
      if (!e || !p.intel.some((i) => i.employeeId === e.id && i.trait === a.trait)) return 'You have no such intel';
      if (e.hiddenTrait1 === a.trait) e.hiddenTrait1Revealed = true;
      else e.hiddenTrait2Revealed = true;
      log(s, `${p.name} exposes: ${e.name} is ${TRAIT_LABEL[a.trait]} (${e.hiddenTrait1 === a.trait ? '+2' : '0'}).`, 'public', 'reveal');
      return null;
    }
    case 'accuse': {
      if (pd.kind !== 'accusation' || !mine) return 'Not waiting for your accusation';
      const accused = s.players[a.accused];
      if (!accused || accused.eliminated || accused.id === p.id) return 'Accuse another active player';
      const e = E(s, pd.employeeId);
      const m = e.mole!;
      if (a.accused === m.creator) {
        m.creatorRevealed = true;
        log(s, `Accusation correct: ${accused.name} planted the mole on ${e.name}.`, 'public', 'mole');
      } else {
        log(s, `Accusation incorrect: ${p.name} accused ${accused.name}; the planter stays hidden.`, 'public', 'mole');
        if (e.loyalty !== 'Rebel') e.loyalty = 'Skeptical'; // §44
      }
      // §44 says the mole then "expires normally"; once exposed it can no longer act secretly, so we
      // expire it now — keeping a known, inert mole around adds nothing but UI noise.
      e.mole = null;
      settle(s);
      advance(s);
      return null;
    }
  }
}

/** §62 / D7: majority, tie → active player's vote. */
function closeVoting(s: S, ev: ActiveEvent) {
  const voters = turnOrder(s, s.currentPlayer).filter((id) => ev.votes[id]);
  ev.queue = voters;
  const label = (id: 'A' | 'B') => ev.card.options.find((o) => o.id === id)?.label ?? id;
  if (ev.card.type === 'Global' && ev.card.resolution !== 'individual') {
    const a = voters.filter((id) => ev.votes[id] === 'A').length;
    const b = voters.length - a;
    ev.outcome = a > b ? 'A' : b > a ? 'B' : ev.votes[s.currentPlayer];
  }
  const votes = voters.map((id) => `${s.players[id].name}: ${label(ev.votes[id])}`).join(', ');
  log(s, `${ev.card.title} — ${votes}${ev.outcome ? `. Outcome: ${label(ev.outcome)}` : ''}.`, 'public', 'event');
}
