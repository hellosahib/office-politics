import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { randomModifier } from './rng';
import { E } from './rules';
import { TRAIT_DIMENSIONS, dimensionOf } from './types';
import type { Action, Department, EventCard, EventEffect, GameConfig, InfluenceCard, PlayerId } from './types';
import { buildInfluenceDeck } from '../content';

// ---------------------------------------------------------------- helpers
const cfg = (o: Partial<GameConfig> = {}): GameConfig => {
  const n = o.playerCount ?? 3;
  return { playerCount: n, mode: 'Takeover', board: 'full', seed: 7, rounds: 8,
    players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isBot: false })), ...o };
};

/** Answer prompts mechanically until the current player is in the play phase. */
function toPlay(g: Game) {
  for (let i = 0; i < 100 && g.state.pending.kind !== 'play' && g.state.phase !== 'gameOver'; i++) {
    const pd = g.state.pending;
    if (pd.kind === 'eventChoice') g.dispatch({ type: 'eventChoice', player: pd.player, optionId: 'A' });
    else if (pd.kind === 'eventTarget') g.dispatch({ type: 'eventTarget', player: pd.player, targetId: pd.candidates[0] });
    else if (pd.kind === 'revealChoice') g.dispatch({ type: 'revealChoice', player: pd.player, mode: 'public' });
    else if (pd.kind === 'accusation') g.dispatch({ type: 'accuse', player: pd.player, accused: g.state.players.find((p) => p.id !== pd.player && !p.eliminated)!.id });
    else if (pd.kind === 'save') g.dispatch({ type: 'save', player: pd.player, cardIds: [] });
    else if (pd.kind === 'summary') g.dispatch({ type: 'endTurn', player: pd.player });
  }
}

/** Fresh game in player 0's play phase with every employee reset to Neutral and nothing in hand. */
function playGame(o: Partial<GameConfig> = {}) {
  const g = Game.create(cfg(o));
  toPlay(g);
  const s = g.state;
  for (const e of s.employees) Object.assign(e, { loyalty: 'Neutral', politicalOwner: null, rebelInclination: null, hostileContributions: {}, promise: null, mole: null });
  for (const p of s.players) { p.hand = []; p.reserve = []; p.influence = p.id === s.currentPlayer ? 10 : 0; p.actionBonus = 0; }
  return g;
}
const done = (g: Game) => { // finish the current turn
  const pid = g.state.currentPlayer;
  g.dispatch({ type: 'donePlaying', player: pid });
  g.dispatch({ type: 'save', player: pid, cardIds: [] });
  g.dispatch({ type: 'endTurn', player: pid });
};

let cardSeq = 0;
function give(g: Game, pid: PlayerId, c: Partial<InfluenceCard> = {}): string {
  const card: InfluenceCard = { id: `t#${cardSeq++}`, templateId: 't', name: 'Test Card', cost: 1, direction: 'positive', mode: 'Both',
    category: 'Social', baseEffect: 2, primary: null, secondary: null, adverse: null, secondaryEffect: 'none', backfire: 'none', text: '', ...c };
  g.state.players[pid].hand.push(card);
  return card.id;
}
/** Make the next randomModifier() return v. */
function fixRandom(g: Game, v: -1 | 0 | 1) {
  for (let k = 0; ; k++) if (randomModifier({ state: k }) === v) { g.state.rng.state = k; return; }
}
const own = (g: Game, pid: PlayerId) => g.state.departments.find((d) => d.teamLead === pid)!;
const neutral = (g: Game) => g.state.departments.find((d) => d.teamLead === null)!;
const emps = (g: Game, d: Department) => d.employeeIds.map((id) => E(g.state, id));
const play = (g: Game, cardId: string, targetId: string, player = g.state.currentPlayer) =>
  g.dispatch({ type: 'playCard', player, cardId, targetId });
const lastPrivate = (g: Game, pid: PlayerId) => [...g.state.log].reverse().find((l) => l.visibility === pid)!.text;

function pushEvent(g: Game, c: Partial<EventCard> & { effectsA?: EventEffect[]; effectsB?: EventEffect[] }) {
  const { effectsA = [], effectsB = [], ...rest } = c;
  g.state.eventDeck.push({ id: `ev#${cardSeq++}`, templateId: 'ev', type: 'Local', title: 'Test Event', situation: '',
    options: [{ id: 'A', label: 'A', text: '', effects: effectsA }, { id: 'B', label: 'B', text: '', effects: effectsB }], ...rest });
}

// ---------------------------------------------------------------- setup
describe('setup (§5, §77, D10)', () => {
  it.each([[3, 'full', 3, 28], [4, 'full', 4, 28], [4, 'mini', 3, 16]] as const)('%dp %s board', (pc, board, players, emps) => {
    const g = Game.create(cfg({ playerCount: pc, board, players: Array.from({ length: pc }, (_, i) => ({ name: `P${i}`, isBot: false })) }));
    const s = g.state;
    expect(s.players).toHaveLength(players);
    expect(s.employees).toHaveLength(emps);
    expect(s.departments).toHaveLength(board === 'mini' ? 4 : 7);
    const leads = s.departments.map((d) => d.teamLead).filter((x) => x !== null);
    expect(new Set(leads).size).toBe(players);
    expect(leads).toHaveLength(players);
    for (const p of s.players) expect(s.departments.find((d) => d.teamLead === p.id)!.id).toBe(p.stats.startingDept);
    for (const e of s.employees) {
      const dims = [e.permanentTrait, e.hiddenTrait1, e.hiddenTrait2].map(dimensionOf);
      expect(new Set(dims).size).toBe(3); // §77 three distinct dimensions
    }
    expect(s.players.every((p) => p.agenda === null)).toBe(true);
  });

  it('starts everyone Neutral with 4 cards, shuffled decks, seeded traits', () => {
    const g = Game.create(cfg());
    // before any event resolves, inspect a second fresh game to avoid event side effects
    const s = Game.create(cfg({ seed: 99 })).state;
    expect(s.players.map((p) => p.hand.length)).toEqual([4, 4, 4]);
    expect(Game.create(cfg({ seed: 99 })).state.employees.every((e) => e.politicalOwner === null)).toBe(true);
    const deckIds = [...s.influenceDeck, ...s.players.flatMap((p) => p.hand)].map((c) => c.id);
    expect(deckIds).not.toEqual(buildInfluenceDeck('full').map((c) => c.id));
    expect(g.state.employees.map((e) => e.hiddenTrait1)).not.toEqual(s.employees.map((e) => e.hiddenTrait1));
    const fresh = Game.create(cfg({ seed: 5 })).state;
    expect(fresh.employees.filter((e) => e.loyalty !== 'Neutral').length).toBeLessThanOrEqual(2); // only the first event can touch them
    expect(Object.values(TRAIT_DIMENSIONS).flat()).toContain(fresh.employees[0].hiddenTrait2);
  });

  it('deals unique agendas in Election mode only', () => {
    const s = Game.create(cfg({ playerCount: 4, mode: 'Election', players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, isBot: false })) })).state;
    expect(new Set(s.players.map((p) => p.agenda)).size).toBe(4);
    expect(s.players.every((p) => p.agenda)).toBe(true);
  });
});

// ---------------------------------------------------------------- turn sequence
describe('turn sequence (§53, §54, D22, D25)', () => {
  it('rotates the first-player marker and skips eliminated players', () => {
    const g = Game.create(cfg());
    const order: [number, number][] = [];
    for (let t = 0; t < 6; t++) { toPlay(g); order.push([g.state.round, g.state.currentPlayer]); done(g); }
    expect(order).toEqual([[1, 0], [1, 1], [1, 2], [2, 1], [2, 2], [2, 0]]);

    const h = playGame({ playerCount: 4, players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, isBot: false })) });
    h.state.players[1].eliminated = true;
    own(h, 1).teamLead = null;
    const seen: number[] = [];
    for (let t = 0; t < 4; t++) { toPlay(h); seen.push(h.state.currentPlayer); done(h); }
    expect(seen).toEqual([0, 2, 3, 2]); // round 2 starts at seat 2: marker skipped eliminated seat 1
  });

  it('refreshes influence to rank max and draws 4 from round 2', () => {
    const g = Game.create(cfg());
    toPlay(g);
    expect(g.state.players[0].influence).toBeGreaterThanOrEqual(4);
    done(g); toPlay(g); done(g); toPlay(g); done(g); toPlay(g); // round 2, player 1
    expect(g.state.round).toBe(2);
    expect(g.state.players[1].hand.length).toBeGreaterThanOrEqual(4);
    expect(g.state.players[0].influence).toBe(0); // unused influence does not carry over
  });
});

// ---------------------------------------------------------------- management
describe('management cost and Internal Instability (§8, §9)', () => {
  it('pays the cost, or triggers instability when an event drained influence', () => {
    const g = playGame();
    const [, , d3] = g.state.departments.filter((d) => d.teamLead === null);
    const free = g.state.departments.filter((d) => d.teamLead === null);
    free[0].teamLead = 1; free[1].teamLead = 1; // P1 now leads 3 depts: cost 2
    g.state.players[1].rank = 'VP';
    pushEvent(g, { effectsA: [{ kind: 'influence', delta: -20 }], effectsB: [{ kind: 'influence', delta: -20 }] });
    done(g);
    g.dispatch({ type: 'eventChoice', player: 1, optionId: 'A' });
    const s = g.state;
    expect(s.pending.kind).toBe('play');
    expect(s.turnSummary!.managementPenalty).toBe(true);
    expect(s.players[1].influence).toBe(0);
    const dropped = s.departments.filter((d) => d.teamLead === 1).flatMap((d) => emps(g, d)).filter((e) => e.loyalty === 'Skeptical');
    expect(dropped).toHaveLength(2);
    expect(s.log.some((l) => l.tag === 'instability')).toBe(true);
    expect(d3).toBeDefined();

    const h = playGame();
    neutral(h).teamLead = 1;
    h.state.players[1].rank = 'Manager';
    pushEvent(h, {});
    done(h);
    h.dispatch({ type: 'eventChoice', player: 1, optionId: 'A' });
    expect(h.state.players[1].influence).toBe(4); // 5 − cost 1
    expect(h.state.turnSummary!.managementPenalty).toBe(false);
  });
});

// ---------------------------------------------------------------- influence resolution
describe('influence resolution (§35–§37, §13, D4)', () => {
  it('applies trait modifiers, rank bonus and the hidden-trait explanation', () => {
    const g = playGame();
    const e = emps(g, neutral(g))[0];
    Object.assign(e, { permanentTrait: 'Ambitious', hiddenTrait1: 'CreditHungry', hiddenTrait2: 'Cautious' });
    g.state.players[0].rank = 'Manager';
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    const id = give(g, 0, { baseEffect: 1, primary: 'CreditHungry', secondary: 'Ambitious', adverse: 'ByTheBook', cost: 2 });
    const pred = g.predict(0, id, e.id);
    expect(pred).toMatchObject({ requiredSpend: 2, base: 1, rankBonus: 1, unknownTraitMayAffect: true, min: 2, max: 4, legal: true });
    expect(pred.traitMods).toEqual([{ trait: 'Ambitious', value: 1 }]);
    fixRandom(g, 0);
    expect(play(g, id, e.id).ok).toBe(true);
    expect(lastPrivate(g, 0)).toContain('= 5 → Strong Success');
    expect(lastPrivate(g, 0)).toContain('A hidden trait affected this decision.');
    expect(e.loyalty).toBe('Favorable');
    expect(e.politicalOwner).toBe(0);
    expect(g.state.players[0].influence).toBe(8);
  });

  it('bands: failure does not move, standard moves one state, adverse subtracts', () => {
    const g = playGame();
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    const [a, b] = emps(g, neutral(g));
    Object.assign(a, { permanentTrait: 'ByTheBook' });
    fixRandom(g, 0);
    play(g, give(g, 0, { baseEffect: 2, adverse: 'ByTheBook' }), a.id); // 2 − 1 = 1 → Failure
    expect(a.loyalty).toBe('Neutral');
    expect(lastPrivate(g, 0)).toContain('Failure');
    fixRandom(g, 0);
    play(g, give(g, 0, { baseEffect: 2 }), b.id);
    expect(b.loyalty).toBe('Favorable');
    expect(lastPrivate(g, 0)).toContain('Standard Success');
  });

  it('enforces required spend, once-per-turn targeting and D4 legality', () => {
    const g = playGame();
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    const [a, b, c] = emps(g, neutral(g));
    a.loyalty = 'Loyal'; a.politicalOwner = 1;
    b.loyalty = 'Rebel';
    c.loyalty = 'Favorable'; c.politicalOwner = 2;
    g.state.players[0].influence = 1;
    expect(play(g, give(g, 0, { direction: 'negative' }), a.id).error).toMatch(/Needs 2/); // §37
    expect(play(g, give(g, 0), b.id).error).toMatch(/Needs 2/); // §16
    expect(play(g, give(g, 0), c.id).error).toMatch(/rival/); // D4
    expect(play(g, give(g, 0, { direction: 'negative' }), b.id).error).toMatch(/already a Rebel/);
    g.state.players[0].influence = 10;
    fixRandom(g, 0);
    const neg = give(g, 0, { direction: 'negative', baseEffect: 5 });
    expect(play(g, neg, a.id).ok).toBe(true);
    expect(g.state.players[0].influence).toBe(8);
    expect(play(g, give(g, 0, { direction: 'negative' }), a.id).error).toMatch(/already targeted/); // §13
  });

  it('enforces Manage/Expand focus and card modes (§31, §32)', () => {
    const g = playGame();
    const mine = emps(g, own(g, 0))[0];
    const other = emps(g, neutral(g))[0];
    const id = give(g, 0, { mode: 'Internal' });
    expect(play(g, id, mine.id).error).toMatch(/Choose Manage or Expand/);
    expect(g.legalTargets(0, id)).toEqual(own(g, 0).employeeIds); // before focus: implied by card mode
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    expect(play(g, id, mine.id).error).toMatch(/Internal/);
    expect(play(g, give(g, 0), mine.id).error).toMatch(/outside your departments/);
    const h = playGame();
    h.dispatch({ type: 'focus', player: 0, focus: 'Manage' });
    expect(play(h, give(h, 0, { mode: 'External' }), emps(h, own(h, 0))[0].id).error).toMatch(/External/);
    expect(play(h, give(h, 0), emps(h, neutral(h))[0].id).error).toMatch(/own department/);
    expect(h.legalTargets(0, give(h, 0))).toEqual(own(h, 0).employeeIds);
    expect(other).toBeDefined();
  });

  it('is side-effect free on illegal actions', () => {
    const g = playGame();
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'playCard', player: 0, cardId: 'nope', targetId: 'x' }).ok).toBe(false);
    expect(g.dispatch({ type: 'endTurn', player: 1 }).ok).toBe(false);
    expect(g.dispatch({ type: 'save', player: 0, cardIds: [] }).ok).toBe(false);
    expect(JSON.stringify(g.state)).toBe(before);
  });
});

// ---------------------------------------------------------------- capture, promotion, CEO
describe('capture, promotion and CEO (§20–§22, D18)', () => {
  it('captures a Neutral dept at 3/4 and promotes', () => {
    const g = playGame();
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    const d = neutral(g);
    const [a, b, c] = emps(g, d);
    for (const e of [a, b]) Object.assign(e, { loyalty: 'Favorable', politicalOwner: 0 });
    fixRandom(g, 0);
    play(g, give(g, 0), c.id);
    expect(d.teamLead).toBe(0);
    const p = g.state.players[0];
    expect(p).toMatchObject({ promotionPoints: 1, rank: 'Manager' });
    expect(p.stats.capturedNeutral).toBe(true);
    expect(g.state.turnSummary!.departmentsCaptured).toEqual([d.id]);
    expect(p.influence).toBe(9); // no mid-turn refund
  });

  it('captures a rival dept, eliminates them, cleans up (D18) and checks CEO', () => {
    const g = playGame();
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    const d = own(g, 1);
    const [a, b, c, x] = emps(g, d);
    for (const e of [a, b]) Object.assign(e, { loyalty: 'Favorable', politicalOwner: 0 });
    const elsewhere = emps(g, neutral(g))[0];
    Object.assign(elsewhere, { loyalty: 'Loyal', politicalOwner: 1 });
    x.mole = { creator: 1, ability: 'SilentBlock', plantedRound: 1, expiresRound: 4, used: false, exposed: false, creatorRevealed: false };
    g.state.players[1].reserve = [{ ...g.state.influenceDeck[0], id: 'r#1' }];
    fixRandom(g, 0);
    play(g, give(g, 0), c.id);
    const p1 = g.state.players[1];
    expect(d.teamLead).toBe(0);
    expect(p1.eliminated).toBe(true);
    expect(p1.stats.lostStartingDept).toBe(true);
    expect(elsewhere).toMatchObject({ loyalty: 'Neutral', politicalOwner: null });
    expect(x.mole).toBeNull();
    expect(p1.reserve).toHaveLength(0);

    const h = playGame();
    const free = h.state.departments.filter((dd) => dd.teamLead === null);
    free.slice(0, 3).forEach((dd) => { dd.teamLead = 0; });
    const target = free[3];
    h.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    for (const e of emps(h, target).slice(0, 2)) Object.assign(e, { loyalty: 'Favorable', politicalOwner: 0 });
    fixRandom(h, 0);
    play(h, give(h, 0, { baseEffect: 3 }), emps(h, target)[2].id);
    expect(h.state.phase).toBe('gameOver');
    expect(h.state.winner).toBe(0);
    expect(h.state.players[0].rank).toBe('CEO');
    expect(h.state.scores).not.toBeNull();
  });
});

// ---------------------------------------------------------------- rebels
describe('rebels and department thresholds (§14, §17, §18, D15, D17)', () => {
  it('influence-created rebel inclines to the biggest hostile contributor; tie → actor', () => {
    const g = playGame();
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    const [a, b] = emps(g, own(g, 1));
    Object.assign(a, { loyalty: 'Skeptical', hostileContributions: { 2: 5 } });
    Object.assign(b, { loyalty: 'Skeptical', hostileContributions: { 2: 2 } });
    fixRandom(g, 0);
    play(g, give(g, 0, { direction: 'negative', cost: 2 }), a.id);
    expect(a).toMatchObject({ loyalty: 'Rebel', rebelInclination: 2, politicalOwner: null });
    fixRandom(g, 0);
    play(g, give(g, 0, { direction: 'negative', cost: 2 }), b.id);
    expect(b.rebelInclination).toBe(0);
    expect(g.state.players[0].stats.rebelsCreated).toBe(2);
    expect(g.view(1).employees.find((e) => e.id === b.id)!.rebelInclination).toBeNull();
    expect(g.view(0).employees.find((e) => e.id === b.id)!.rebelInclination).toBe(0);
  });

  it('event-created rebel inclines to the smallest adjacent lead, never the own lead (§14A, D15)', () => {
    const g = playGame();
    g.state.eventDeck.push({ id: 'mk', templateId: 'mk', type: 'Local', title: 'Mk', situation: '', options: [
      { id: 'A', label: 'A', text: '', chooseEmployee: true, effects: [{ kind: 'makeRebel', target: 'chosen' }] },
      { id: 'B', label: 'B', text: '', effects: [] }] });
    done(g); // P1's turn: the event hits P1's own dept
    g.dispatch({ type: 'eventChoice', player: 1, optionId: 'A' });
    const target = (g.state.pending as { candidates: string[] }).candidates[0];
    g.dispatch({ type: 'eventTarget', player: 1, targetId: target });
    const rebel = E(g.state, target);
    expect(rebel.loyalty).toBe('Rebel');
    const home = own(g, 1);
    const leads = [0, 2];
    const adjacent = leads.filter((pid) => home.adjacency.includes(own(g, pid).id));
    expect(adjacent.length ? adjacent : leads).toContain(rebel.rebelInclination);
    expect(g.state.players[1].stats.rebelsCreated).toBe(1); // the event P1 chose (D23)
  });

  it('2 rebels = Unstable, 3 = leadership crisis, 4 = settlement', () => {
    const g = playGame();
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    const d = own(g, 1);
    const [a, b, c, x] = emps(g, d);
    for (const e of [a, b]) Object.assign(e, { loyalty: 'Rebel', rebelInclination: 2 });
    expect(g.view(0).departments.find((v) => v.id === d.id)!.instability).toBe(1);
    Object.assign(c, { loyalty: 'Skeptical', hostileContributions: { 0: 1 } });
    fixRandom(g, 0);
    play(g, give(g, 0, { direction: 'negative' }), c.id);
    expect(d.teamLead).toBeNull(); // D17 crisis → Neutral, rebels intact
    expect(g.state.players[1].eliminated).toBe(true);
    expect(a.loyalty).toBe('Rebel');
    c.rebelInclination = 2;
    Object.assign(x, { loyalty: 'Skeptical' });
    fixRandom(g, 0);
    play(g, give(g, 0, { direction: 'negative' }), x.id); // 4th rebel → inclined to P0 (actor); 3× P2 → settlement to P2
    expect(d.teamLead).toBe(2);
    expect([a, b, c].map((e) => e.loyalty)).toEqual(['Loyal', 'Loyal', 'Loyal']);
    expect(x).toMatchObject({ loyalty: 'Neutral', rebelInclination: null });
  });
});

// ---------------------------------------------------------------- moles
describe('moles (§40–§44, D5, D6, D22)', () => {
  it('plants secretly, refuses Loyal targets, and expires at plantedRound + 3', () => {
    const g = playGame();
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    const [a, b] = emps(g, own(g, 1));
    a.loyalty = 'Loyal'; a.politicalOwner = 1;
    const mole = { direction: 'mole' as const, cost: 3, moleAbility: 'SilentBlock' as const };
    expect(play(g, give(g, 0, mole), a.id).error).toMatch(/Loyal/);
    expect(play(g, give(g, 0, mole), b.id).ok).toBe(true);
    expect(b.mole).toMatchObject({ creator: 0, plantedRound: 1, expiresRound: 4, used: false });
    const pub = g.state.log.filter((l) => l.visibility === 'public').at(-1)!.text;
    expect(pub).toBe('P0 played a card face-down.');
    expect(g.view(1).employees.find((e) => e.id === b.id)!.mole).toBeNull();
    expect(g.view(0).employees.find((e) => e.id === b.id)!.mole!.visibleBecause).toBe('creator');
    expect(g.view(1).log.some((l) => l.text.includes(b.name) && l.tag === 'mole')).toBe(false);
    expect(g.state.players[0].stats).toMatchObject({ molesPlanted: 1, maxActiveMoles: 1 });
    while (g.state.round < 4) { toPlay(g); done(g); }
    expect(b.mole).toBeNull();
  });

  it('Silent Block auto-triggers once; loyalty lock blocks positive moves', () => {
    const g = playGame();
    const [a] = emps(g, own(g, 0));
    a.mole = { creator: 2, ability: 'SilentBlock', plantedRound: 1, expiresRound: 4, used: false, exposed: false, creatorRevealed: false };
    g.dispatch({ type: 'focus', player: 0, focus: 'Manage' });
    fixRandom(g, 0);
    play(g, give(g, 0, { baseEffect: 9 }), a.id);
    expect(a.loyalty).toBe('Neutral');
    expect(a.mole!.used).toBe(true);
    expect(lastPrivate(g, 2)).toMatch(/^Mole triggered successfully/);
    expect(g.state.log.filter((l) => l.visibility === 'public').at(-1)!.text).toMatch(/: Failure\.$/);
    // lock still holds after the ability is spent (§42)
    a.mole!.used = true;
    g.state.players[0].targetedThisTurn = [];
    play(g, give(g, 0, { baseEffect: 9 }), a.id);
    expect(a.loyalty).toBe('Neutral');
  });

  it('Rebel Pressure turns 2 rebels into a leadership crisis (§43)', () => {
    const g = playGame();
    g.dispatch({ type: 'focus', player: 0, focus: 'Expand' });
    const d = neutral(g);
    d.teamLead = 1; // P1 has 2 depts now
    const [a, b, c] = emps(g, d);
    a.loyalty = 'Rebel';
    c.mole = { creator: 2, ability: 'RebelPressure', plantedRound: 1, expiresRound: 4, used: false, exposed: false, creatorRevealed: false };
    b.loyalty = 'Skeptical';
    fixRandom(g, 0);
    play(g, give(g, 0, { direction: 'negative' }), b.id);
    expect(d.teamLead).toBeNull();
    expect(c.mole!.used).toBe(true);
    expect(c.loyalty).toBe('Neutral'); // no permanent third rebel
    expect(lastPrivate(g, 2)).toMatch(/Rebel Pressure/);
  });

  it('investigation exposes a mole and the team lead accuses (correct / wrong)', () => {
    for (const accused of [2, 1] as const) {
      const g = playGame();
      const d = own(g, 0);
      const [a] = emps(g, d);
      a.loyalty = 'Favorable'; a.politicalOwner = 0;
      done(g); toPlay(g); done(g); toPlay(g); // now P2's turn
      g.state.players[0].influence = 0;
      const victimDept = own(g, 0);
      emps(g, victimDept)[0].mole = { creator: 2, ability: 'SilentBlock', plantedRound: 1, expiresRound: 9, used: false, exposed: false, creatorRevealed: false };
      Object.assign(emps(g, victimDept)[0], { loyalty: 'Favorable', politicalOwner: 0 });
      g.state.eventDeck.push({ id: 'aud', templateId: 'aud', type: 'Global', resolution: 'majority', title: 'Audit', situation: '', options: [
        { id: 'A', label: 'A', text: '', effects: [{ kind: 'investigate' }] }, { id: 'B', label: 'B', text: '', effects: [] }] });
      done(g); // → round 2, P1 first
      for (const pid of [1, 2, 0]) g.dispatch({ type: 'eventChoice', player: pid, optionId: 'A' });
      for (let i = 0; i < 5 && g.state.pending.kind === 'revealChoice'; i++) g.dispatch({ type: 'revealChoice', player: (g.state.pending as { player: number }).player, mode: 'public' });
      expect(g.state.pending).toMatchObject({ kind: 'accusation', player: 0 });
      const ev = emps(g, victimDept)[0];
      expect(g.view(1).employees.find((e) => e.id === ev.id)!.mole).toMatchObject({ visibleBecause: 'exposed', creator: -1 });
      expect(g.dispatch({ type: 'accuse', player: 0, accused: 0 }).ok).toBe(false);
      g.dispatch({ type: 'accuse', player: 0, accused });
      expect(ev.mole).toBeNull();
      const line = g.state.log.filter((l) => l.tag === 'mole' && l.visibility === 'public').at(-1)!.text;
      if (accused === 2) { expect(line).toMatch(/correct: P2/); expect(ev.loyalty).toBe('Favorable'); }
      else { expect(line).toMatch(/incorrect/); expect(ev.loyalty).toBe('Skeptical'); }
      toPlay(g);
      expect(g.state.pending).toMatchObject({ kind: 'play', player: 1 });
      expect(a).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------- promises, events
describe('promises and events (D7, D8, D14, D19, D21, §29, §48)', () => {
  it('promise fires on any success and costs a state on expiry', () => {
    const g = playGame();
    g.dispatch({ type: 'focus', player: 0, focus: 'Manage' });
    const e = emps(g, own(g, 0))[0];
    fixRandom(g, 0);
    play(g, give(g, 0, { secondaryEffect: 'promise' }), e.id); // standard success
    expect(e.promise).toEqual({ byPlayer: 0, expiresRound: 4 });
    expect(e.loyalty).toBe('Favorable');
    // isolate the expiry: no events in the way
    g.state.eventDeck = []; g.state.eventDiscard = [];
    while (g.state.round < 4) { toPlay(g); done(g); }
    expect(e.promise).toBeNull();
    expect(e.loyalty).toBe('Neutral');
  });

  it('global vote: majority wins, tie goes to the active player', () => {
    const g4 = playGame({ playerCount: 4, players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, isBot: false })) });
    g4.state.eventDeck.push({ id: 'gl', templateId: 'gl', type: 'Global', resolution: 'majority', title: 'Vote', situation: '', options: [
      { id: 'A', label: 'Yes', text: '', effects: [{ kind: 'influence', delta: 1 }] },
      { id: 'B', label: 'No', text: '', effects: [{ kind: 'influence', delta: 2 }], minorityEffects: [{ kind: 'draw', count: 1 }] }] });
    done(g4); // P1's turn, global vote order 1,2,3,0
    const votes: Record<number, 'A' | 'B'> = { 1: 'B', 2: 'A', 3: 'A', 0: 'B' };
    for (const pid of [1, 2, 3]) {
      g4.dispatch({ type: 'eventChoice', player: pid, optionId: votes[pid] });
      expect(g4.view(0).activeEvent!.votesVisible).toBe(false);
      expect(Object.keys(g4.view(0).activeEvent!.votes)).toEqual([]);
    }
    expect(g4.dispatch({ type: 'eventChoice', player: 2, optionId: 'A' }).ok).toBe(false);
    const handBefore = g4.state.players[2].hand.length;
    g4.dispatch({ type: 'eventChoice', player: 0, optionId: 'B' });
    expect(g4.state.log.some((l) => l.text.includes('Outcome: No'))).toBe(true); // 2–2 → P1 (active) voted B
    expect(g4.state.players[2].hand.length).toBe(handBefore + 1); // minority effect
    expect(g4.state.players[0].influence).toBe(2); // off-turn gain banked (D25)
  });

  it('local event hits a random owned dept; Unstable adds an extra non-rebel target (D8)', () => {
    for (const rebels of [0, 2]) {
      const g = playGame();
      const d = own(g, 1);
      emps(g, d).slice(0, rebels).forEach((e) => { e.loyalty = 'Rebel'; });
      pushEvent(g, { effectsA: [{ kind: 'loyalty', target: 'randomRebel', delta: -1 }] });
      done(g);
      expect(g.state.pending).toMatchObject({ kind: 'eventChoice', player: 1, deptId: d.id });
      g.dispatch({ type: 'eventChoice', player: 1, optionId: 'A' });
      // the rebel itself cannot drop; only the Unstable extra target moves
      expect(emps(g, d).filter((e) => e.loyalty === 'Skeptical')).toHaveLength(rebels === 2 ? 1 : 0);
    }
  });

  it('protectDept blocks negative loyalty effects', () => {
    const g = playGame();
    pushEvent(g, { effectsA: [{ kind: 'protectDept', rounds: 2 }, { kind: 'loyalty', target: 'all', delta: -1 }] });
    done(g);
    g.dispatch({ type: 'eventChoice', player: 1, optionId: 'A' });
    expect(emps(g, own(g, 1)).every((e) => e.loyalty === 'Neutral')).toBe(true);
    expect(g.state.log.some((l) => l.text.includes('protected: a negative effect was blocked'))).toBe(true);
  });

  it('reveal choice: public marks the trait, private costs 1 and is hidden from others', () => {
    const g = playGame();
    g.state.eventDeck.push({ id: 'rv', templateId: 'rv', type: 'Reveal', title: 'Reveal', situation: '', options: [] });
    g.state.eventDeck.push({ id: 'rv2', templateId: 'rv', type: 'Reveal', title: 'Reveal', situation: '', options: [] });
    done(g);
    const pd = g.state.pending;
    if (pd.kind !== 'revealChoice') throw new Error('expected reveal');
    expect((g.view(0).pending as { weight: number }).weight).toBe(-1); // masked for others
    g.dispatch({ type: 'revealChoice', player: 1, mode: 'private' });
    const p1 = g.state.players[1];
    expect(p1.intel).toHaveLength(1);
    expect(p1.stats.privateReveals).toBe(1);
    expect(p1.influence).toBe(3);
    const ev = g.view(0).employees.find((e) => e.id === pd.employeeId)!;
    const mine = g.view(1).employees.find((e) => e.id === pd.employeeId)!;
    expect(pd.weight === 2 ? ev.hiddenTrait1 : ev.hiddenTrait2).toBeNull();
    expect(pd.weight === 2 ? mine.hiddenTrait1 : mine.hiddenTrait2).toBe(pd.trait);
    // expose later (D13)
    toPlay(g);
    expect(g.dispatch({ type: 'exposeIntel', player: 1, employeeId: pd.employeeId, trait: pd.trait }).ok).toBe(true);
    const pub = g.view(0).employees.find((e) => e.id === pd.employeeId)!;
    expect(pd.weight === 2 ? pub.hiddenTrait1 : pub.hiddenTrait2).toBe(pd.trait);
    done(g);
    const q = g.state.pending;
    if (q.kind !== 'revealChoice') throw new Error('expected reveal');
    g.state.players[q.player].influence = 0;
    expect(g.dispatch({ type: 'revealChoice', player: q.player, mode: 'private' }).ok).toBe(false);
    expect(g.dispatch({ type: 'revealChoice', player: q.player, mode: 'public' }).ok).toBe(true);
  });
});


// ---------------------------------------------------------------- save / trade
describe('save cards and trading (§34, D13)', () => {
  it('saves at 1 Influence each into a 3-slot reserve; the rest is discarded; reserve cards can be given', () => {
    const g = playGame();
    const ids = [give(g, 0), give(g, 0), give(g, 0), give(g, 0)];
    g.state.players[0].influence = 3;
    g.dispatch({ type: 'donePlaying', player: 0 });
    expect(g.dispatch({ type: 'save', player: 0, cardIds: ids }).error).toMatch(/Influence|Reserve/);
    g.state.players[0].reserve = [{ ...g.state.influenceDeck[0], id: 'keep#1' }];
    expect(g.dispatch({ type: 'save', player: 0, cardIds: ids.slice(0, 3) }).error).toMatch(/at most 3/);
    expect(g.dispatch({ type: 'save', player: 0, cardIds: ids.slice(0, 2) }).ok).toBe(true);
    const p = g.state.players[0];
    expect(p.reserve).toHaveLength(3);
    expect(p.hand).toHaveLength(0);
    expect(p.influence).toBe(1);
    expect(g.state.influenceDiscard.map((c) => c.id)).toEqual(expect.arrayContaining(ids.slice(2)));
    g.dispatch({ type: 'endTurn', player: 0 });
    toPlay(g);
    expect(g.dispatch({ type: 'giveCard', player: 0, cardId: 'keep#1', toPlayer: 2 }).ok).toBe(true);
    expect(g.state.players[2].reserve.map((c) => c.id)).toContain('keep#1');
    expect(g.dispatch({ type: 'giveCard', player: 1, cardId: g.state.players[1].hand[0]?.id ?? 'x', toPlayer: 2 }).ok).toBe(false); // unsaved
  });
});

// ---------------------------------------------------------------- election
describe('election scoring (§24, D23, D24)', () => {
  it('scores departments, loyalty, rebels, moles planted ×3 and agendas', () => {
    const g = playGame({ mode: 'Election' });
    const s = g.state;
    const d = own(g, 0);
    const [a, b, c] = emps(g, d);
    Object.assign(a, { loyalty: 'Loyal', politicalOwner: 0 });
    Object.assign(b, { loyalty: 'Favorable', politicalOwner: 0 });
    c.loyalty = 'Rebel';
    s.players[0].stats.molesPlanted = 2; // expired/exposed moles still count (D24)
    s.players[0].agenda = 'Survivor';
    s.players[1].agenda = 'EmpireBuilder';
    s.eventDeck = []; s.eventDiscard = [];
    while (s.phase !== 'gameOver') { toPlay(g); done(g); }
    expect(s.round).toBe(9);
    const sc = s.scores![0];
    expect(sc).toMatchObject({ departments: 10, loyalists: 2, favorable: 1, rebels: -2, molesPlanted: 6, agenda: 8, agendaCompleted: true, total: 25 });
    expect(s.scores![1].agendaCompleted).toBe(false);
    expect(s.winner).toBe(0);
    expect(g.view(1).players[0].agenda!.id).toBe('Survivor'); // revealed at game over
    expect(g.view(1).employees.every((e) => e.hiddenTrait1 !== null)).toBe(true);
  });

  it('mini board ends after round 6 with no CEO victory', () => {
    const g = playGame({ board: 'mini' });
    g.state.eventDeck = []; g.state.eventDiscard = [];
    while (g.state.phase !== 'gameOver') { toPlay(g); done(g); }
    expect(g.state.round).toBe(7);
    expect(g.state.winner).not.toBeNull();
  });
});

// ---------------------------------------------------------------- views
describe('view filtering (§56, §57, D2)', () => {
  it('hides traits, agendas, hands, moles, intel and rng', () => {
    const g = Game.create(cfg({ mode: 'Election' }));
    toPlay(g);
    const v = g.view(1);
    expect(v.employees.every((e) => (e.hiddenTrait1 === null) === !e.hiddenTrait1Public)).toBe(true);
    expect(v.players[0]).toMatchObject({ hand: null, reserve: null, agenda: null, intel: null, activeMoles: null });
    expect(v.players[1].agenda).not.toBeNull();
    expect(v.players[1].hand).not.toBeNull();
    expect(JSON.stringify(v)).not.toMatch(/influenceDeck|eventDeck|"rng"|hostileContributions/);
    const spectator = g.view(null);
    expect(spectator.players.every((p) => p.hand === null)).toBe(true);
    expect(spectator.log.every((l) => l.visibility === 'public')).toBe(true);
    v.employees[0].loyalty = 'Rebel'; // views are copies
    expect(g.state.employees[0].loyalty).not.toBe('Rebel');
    expect(g.view(0).players[0].influenceMax).toBe(4);
  });
});

// ---------------------------------------------------------------- determinism
describe('determinism (D2)', () => {
  it('same seed + same actions → identical state; replay equals live', () => {
    const run = () => {
      const g = Game.create(cfg({ seed: 4242, playerCount: 4, players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, isBot: false })) }));
      const log: Action[] = [];
      for (let step = 0; step < 400 && g.state.phase !== 'gameOver'; step++) {
        const pd = g.state.pending;
        let a: Action;
        if (pd.kind === 'eventChoice') a = { type: 'eventChoice', player: pd.player, optionId: step % 2 ? 'A' : 'B' };
        else if (pd.kind === 'eventTarget') a = { type: 'eventTarget', player: pd.player, targetId: pd.candidates[0] };
        else if (pd.kind === 'revealChoice') a = { type: 'revealChoice', player: pd.player, mode: 'public' };
        else if (pd.kind === 'accusation') a = { type: 'accuse', player: pd.player, accused: (pd.player + 1) % 4 };
        else if (pd.kind === 'play') {
          const p = g.state.players[pd.player];
          if (!pd.focus) a = { type: 'focus', player: pd.player, focus: step % 3 ? 'Expand' : 'Manage' };
          else {
            const c = p.hand.find((x) => g.legalTargets(p.id, x.id).length);
            a = c ? { type: 'playCard', player: p.id, cardId: c.id, targetId: g.legalTargets(p.id, c.id)[0] } : { type: 'donePlaying', player: p.id };
          }
        } else if (pd.kind === 'save') a = { type: 'save', player: pd.player, cardIds: [] };
        else if (pd.kind === 'summary') a = { type: 'endTurn', player: pd.player };
        else break;
        log.push(a);
        log.push({ type: 'endTurn', player: (pd.player + 1) % 4 }); // junk: must be skipped
        g.dispatch(a);
        g.dispatch(log[log.length - 1]);
      }
      return { g, log };
    };
    const a = run(), b = run();
    expect(JSON.stringify(a.g.state)).toBe(JSON.stringify(b.g.state));
    const replayed = Game.replay(a.g.state.config, a.log);
    expect(JSON.stringify(replayed.state)).toBe(JSON.stringify(a.g.state));
    expect(a.g.state.round).toBeGreaterThan(2);
  });
});
