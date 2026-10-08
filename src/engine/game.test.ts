import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { randomModifier } from './rng';
import { E, reaction } from './rules';
import { TRAIT_DIMENSIONS, dimensionOf } from './types';
import type { Action, Department, EventCard, EventEffect, GameConfig, InfluenceCard, PlayerId } from './types';
import { buildEventDeck, buildInfluenceDeck } from '../content';
import { REVEAL_LINE } from '../ui/results';

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
const res = (g: Game, viewer: PlayerId) => g.view(viewer).lastCardResult!;

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
  it('plain round-robin in seat order every round, skipping eliminated seats (D38)', () => {
    const g = Game.create(cfg());
    const order: [number, number][] = [];
    for (let t = 0; t < 6; t++) { toPlay(g); order.push([g.state.round, g.state.currentPlayer]); done(g); }
    expect(order).toEqual([[1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]]);
    expect(g.state.firstPlayer).toBe(0);

    const h = playGame({ playerCount: 4, players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, isBot: false })) });
    h.state.players[1].eliminated = true;
    own(h, 1).teamLead = null;
    const seen: [number, number][] = [];
    for (let t = 0; t < 6; t++) { toPlay(h); seen.push([h.state.round, h.state.currentPlayer]); done(h); }
    expect(seen).toEqual([[1, 0], [1, 2], [1, 3], [2, 0], [2, 2], [2, 3]]);

    const k = playGame();
    done(k); toPlay(k); done(k); toPlay(k); // P2's turn
    k.state.players[0].eliminated = true;
    own(k, 0).teamLead = null;
    const r2: [number, number][] = [];
    for (let t = 0; t < 3; t++) { toPlay(k); r2.push([k.state.round, k.state.currentPlayer]); done(k); }
    expect(r2).toEqual([[1, 2], [2, 1], [2, 2]]);
    expect(k.state.firstPlayer).toBe(1); // first non-eliminated seat
  });

  it('every turn (round 1 and later): influence SET to max (+bank) before the event, cost after, hand refilled to 4 (D25, D26, D39)', () => {
    const g = playGame();
    g.state.eventDeck = []; g.state.eventDiscard = [];
    for (let t = 0; t < 7; t++) {
      const pid = g.state.currentPlayer;
      const p = g.state.players[pid];
      // leftover influence stays visible after the turn (no zeroing)
      p.influence = 1;
      done(g);
      expect(p.influence).toBe(1);
      const q = g.state.players[g.state.currentPlayer];
      expect(g.state.pending).toMatchObject({ kind: 'play', player: q.id });
      expect(q.influence).toBe(4); // TeamLead max, cost 0 with 1 dept — not 1 + 4
      if (g.state.round > 1) {
        expect(q.hand).toHaveLength(4);
        expect(g.view(q.id).turn.drawnThisTurn).toEqual(q.hand.map((c) => c.id));
        expect(g.view((q.id + 1) % 3).turn.drawnThisTurn).toEqual([]);
      }
    }
    expect(g.state.round).toBe(3);

    // reshuffles the discard when the deck runs dry
    const h = playGame();
    h.state.eventDeck = []; h.state.eventDiscard = [];
    h.state.influenceDiscard = [...h.state.influenceDeck];
    h.state.influenceDeck = [];
    while (h.state.round < 2) { toPlay(h); done(h); }
    toPlay(h);
    expect(h.state.players[h.state.currentPlayer].hand).toHaveLength(4);

    // banked off-turn gain is added on top; management cost is paid AFTER the event
    const k = playGame();
    neutral(k).teamLead = 1;
    k.state.players[1].rank = 'Manager'; // max 5, cost 1 (2 depts)
    k.state.players[1].influenceBank = 2;
    k.state.players[1].influence = 3; // leftover display value: ignored
    let seenAtEvent = -1;
    pushEvent(k, { effectsA: [], effectsB: [] });
    done(k);
    expect(k.state.pending).toMatchObject({ kind: 'eventChoice', player: 1 });
    seenAtEvent = k.state.players[1].influence;
    k.dispatch({ type: 'eventChoice', player: 1, optionId: 'A' });
    expect(seenAtEvent).toBe(7); // 5 + 2 banked, cost not yet paid
    expect(k.state.players[1].influence).toBe(6);
    expect(k.state.players[1].influenceBank).toBe(0);
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
    const id = give(g, 0, { baseEffect: 1, primary: 'CreditHungry', secondary: 'Ambitious', adverse: 'ByTheBook', cost: 2 });
    const pred = g.predict(0, id, e.id);
    expect(pred).toMatchObject({ requiredSpend: 2, base: 1, rankBonus: 1, unknownTraitMayAffect: true, min: 2, max: 4, legal: true });
    expect(pred.traitMods).toEqual([{ trait: 'Ambitious', value: 1 }]);
    fixRandom(g, 0);
    expect(play(g, id, e.id).ok).toBe(true);
    expect(res(g, 0)).toMatchObject({ band: 'Strong Success', explanation: { score: 5, band: 'Strong Success' } });
    expect(res(g, 0).explanation!.hiddenTraitAffected).toBe(true);
    expect(res(g, 1).explanation).toBeUndefined(); // breakdown is the actor's only
    expect(e.loyalty).toBe('Favorable');
    expect(e.politicalOwner).toBe(0);
    expect(g.state.players[0].influence).toBe(8);
  });

  it('bands: failure does not move, standard moves one state, adverse subtracts', () => {
    const g = playGame();
    const [a, b] = emps(g, neutral(g));
    Object.assign(a, { permanentTrait: 'ByTheBook' });
    fixRandom(g, 0);
    play(g, give(g, 0, { baseEffect: 2, adverse: 'ByTheBook' }), a.id); // 2 − 1 = 1 → Failure
    expect(a.loyalty).toBe('Neutral');
    expect(res(g, 0).band).toBe('Failure');
    fixRandom(g, 0);
    play(g, give(g, 0, { baseEffect: 2 }), b.id);
    expect(b.loyalty).toBe('Favorable');
    expect(res(g, 0).band).toBe('Standard Success');
  });

  it('enforces required spend, once-per-turn targeting and D4 legality', () => {
    const g = playGame();
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

  it('no turn focus: play needs no focus action and the focus action is an accepted no-op (D37)', () => {
    const g = playGame();
    expect(g.state.pending).toEqual({ kind: 'play', player: 0, focus: null });
    const before = JSON.stringify({ ...g.state, actionCount: 0 });
    expect(g.dispatch({ type: 'focus', player: 0, focus: 'Expand' }).ok).toBe(true);
    expect(JSON.stringify({ ...g.state, actionCount: 0 })).toBe(before);
    expect(g.state.focus).toBeNull();
    fixRandom(g, 0);
    expect(play(g, give(g, 0, { mode: 'External' }), emps(g, own(g, 0))[0].id).ok).toBe(true); // mode is ignored (D42)
    expect(g.state.pending).toMatchObject({ kind: 'play', focus: null });
  });

  it('legal targets follow card direction, not mode (D42)', () => {
    const g = playGame();
    const mine = own(g, 0).employeeIds, rival = own(g, 1).employeeIds, free = neutral(g).employeeIds;
    const sorted = (xs: string[]) => [...xs].sort();
    for (const mode of ['Internal', 'External', 'Both'] as const) {
      const pos = give(g, 0, { mode });
      // D43: own + Neutral depts, plus rivals' employees that are still Neutral/Skeptical.
      expect(sorted(g.legalTargets(0, pos))).toEqual(sorted(g.state.employees.filter((e) => {
        const lead = g.state.departments.find((d) => d.id === e.deptId)!.teamLead;
        return lead === 0 || lead === null || e.loyalty === 'Neutral' || e.loyalty === 'Skeptical';
      }).map((e) => e.id)));
      const neg = give(g, 0, { mode, direction: 'negative' });
      expect(g.legalTargets(0, neg)).not.toContain(mine[0]);
      expect(g.legalTargets(0, neg)).toEqual(expect.arrayContaining([...rival, ...free]));
      const mole = give(g, 0, { mode, direction: 'mole', cost: 3 });
      expect(sorted(g.legalTargets(0, mole))).toEqual(sorted(g.state.departments.filter((d) => d.teamLead !== null && d.teamLead !== 0).flatMap((d) => d.employeeIds)));
    }
    expect(g.predict(0, give(g, 0), rival[0]).legal).toBe(true); // Neutral rival employee: charmable (D43)
    const r0 = g.state.employees.find((e) => e.id === rival[0])!;
    const rivalLead = g.state.departments.find((d) => d.id === r0.deptId)!.teamLead!;
    r0.loyalty = 'Favorable'; r0.politicalOwner = rivalLead;
    expect(g.predict(0, give(g, 0), rival[0]).legal).toBe(false); // committed to the rival: not charmable
    r0.loyalty = 'Neutral'; r0.politicalOwner = null;
    expect(g.predict(0, give(g, 0, { direction: 'negative' }), mine[0])).toMatchObject({ legal: false, reason: 'Hostile cards target other teams' });
    expect(g.predict(0, give(g, 0), free[0]).legal).toBe(true); // POSITIVE_CARDS_ALLOW_NEUTRAL
  });

  it('logs a narrative line naming card, employee and department, with no score anywhere (D40)', () => {
    const g = playGame();
    const e = emps(g, neutral(g))[0];
    fixRandom(g, 0);
    play(g, give(g, 0, { baseEffect: 2 }), e.id);
    const line = g.state.log.at(-1)!;
    expect(line).toMatchObject({ visibility: 'public', tag: 'card' });
    expect(line.text).toMatch(new RegExp(`^P0 used Test Card on ${e.name} of ${neutral(g).name}\\. .+\\. Status changed from Neutral to Favorable\\.$`));
    expect(g.state.log.some((l) => /Base|Random|= \d/.test(l.text))).toBe(false);
    const r = res(g, 1);
    expect(r).toMatchObject({ actor: 0, cardName: 'Test Card', employeeId: e.id, deptId: e.deptId, band: 'Standard Success', from: 'Neutral', to: 'Favorable', actionCount: g.state.actionCount });
    expect(line.text).toContain(r.reaction);
    fixRandom(g, 0);
    const f = emps(g, neutral(g))[1];
    play(g, give(g, 0, { baseEffect: 0 }), f.id);
    expect(g.state.log.at(-1)!.text).toMatch(/Status unchanged \(Neutral\)\.$/);
    // reactions are deterministic and use the roster pronoun
    const neha = g.state.employees.find((x) => x.id === 'neha-kapoor');
    if (neha) expect(reaction(g.state, neha, 'positive', 'Failure')).not.toMatch(/\{|\bthey\b|\bhe\b/i);
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
    const d = own(g, 1);
    const [a, b, c, x] = emps(g, d);
    // D42: positive cards can't reach a rival's team, so the 3rd alignment comes from elsewhere (e.g. an old capture);
    // any resolved card re-checks thresholds.
    for (const e of [a, b, c]) Object.assign(e, { loyalty: 'Favorable', politicalOwner: 0 });
    const elsewhere = emps(g, neutral(g))[0];
    Object.assign(elsewhere, { loyalty: 'Loyal', politicalOwner: 1 });
    x.mole = { creator: 1, ability: 'SilentBlock', plantedRound: 1, expiresRound: 4, used: false, exposed: false, creatorRevealed: false };
    g.state.players[1].reserve = [{ ...g.state.influenceDeck[0], id: 'r#1' }];
    fixRandom(g, 0);
    play(g, give(g, 0), emps(g, own(g, 0))[0].id);
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
    fixRandom(g, 0);
    play(g, give(g, 0, { baseEffect: 9 }), a.id);
    expect(a.loyalty).toBe('Neutral');
    expect(a.mole!.used).toBe(true);
    expect(lastPrivate(g, 2)).toMatch(/^Mole triggered successfully/);
    expect(g.state.log.filter((l) => l.visibility === 'public').at(-1)!.text).toMatch(/Status unchanged \(Neutral\)\.$/);
    expect(res(g, 1).band).toBe('Failure'); // D30: others see a plain failure
    expect(res(g, 0).band).toBe('Blocked');
    // lock still holds after the ability is spent (§42)
    a.mole!.used = true;
    g.state.players[0].targetedThisTurn = [];
    play(g, give(g, 0, { baseEffect: 9 }), a.id);
    expect(a.loyalty).toBe('Neutral');
  });

  it('Rebel Pressure turns 2 rebels into a leadership crisis (§43)', () => {
    const g = playGame();
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
      done(g); // → round 2, P0 first (D38)
      for (const pid of [0, 1, 2]) g.dispatch({ type: 'eventChoice', player: pid, optionId: 'A' });
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
      expect(g.state.pending).toMatchObject({ kind: 'play', player: 0 });
      expect(a).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------- promises, events
describe('promises and events (D7, D8, D14, D19, D21, §29, §48)', () => {
  it('promise fires on any success and costs a state on expiry', () => {
    const g = playGame();
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
    expect(g4.state.players[0].influenceBank).toBe(2); // off-turn gain banked (D25)
    expect(g4.state.players[0].influence).toBe(10); // leftover display value untouched (D39)
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
    expect(g.state.log.some((l) => l.text.includes('is protected, a negative effect was blocked'))).toBe(true);
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
    // the public "Trait disclosed" banner parses this line (src/ui/results.ts)
    expect(REVEAL_LINE.exec(g.state.log.at(-1)!.text)?.slice(1, 3)).toEqual(['P1', pub.name]);
    done(g);
    const q = g.state.pending;
    if (q.kind !== 'revealChoice') throw new Error('expected reveal');
    g.state.players[q.player].influence = 0;
    expect(g.dispatch({ type: 'revealChoice', player: q.player, mode: 'private' }).ok).toBe(false);
    expect(g.dispatch({ type: 'revealChoice', player: q.player, mode: 'public' }).ok).toBe(true);
  });
});


// ---------------------------------------------------------------- event flow (owner playtest fixes)
type Opt = EventCard['options'][number];
const gEvent = (resolution: 'individual' | 'majority', a: Partial<Opt> = {}, b: Partial<Opt> = {}): EventCard => ({
  id: `gev#${cardSeq++}`, templateId: 'gev', type: 'Global', resolution, title: 'Test Global', situation: '',
  options: [{ id: 'A', label: 'Alpha', text: '', effects: [], ...a }, { id: 'B', label: 'Beta', text: '', effects: [], ...b }],
});
/** Round 2, P0's turn, with `ev` as P0's event; cards were dealt by the draw phase. */
function round2With(ev: EventCard, o: Partial<GameConfig> = {}) {
  const g = playGame(o);
  g.state.eventDeck = []; g.state.eventDiscard = [];
  const n = g.state.players.length;
  for (let t = 0; t < n - 1; t++) { done(g); toPlay(g); }
  g.state.eventDeck.push(ev);
  done(g);
  expect(g.state).toMatchObject({ round: 2, currentPlayer: 0 });
  return g;
}
/** Answer every prompt, recording "kind:player" until P0's play phase (or 60 steps). */
function drive(g: Game, pickTarget: (c: string[]) => string = (c) => c[0], vote: (pid: number) => 'A' | 'B' = () => 'A') {
  const seen: string[] = [];
  for (let i = 0; i < 60; i++) {
    const pd = g.state.pending;
    if (pd.kind === 'gameOver') break;
    seen.push(`${pd.kind}:${pd.player}${pd.kind === 'eventTarget' ? `:${pd.choose}` : ''}`);
    if (pd.kind === 'play') break;
    if (pd.kind === 'eventChoice') g.dispatch({ type: 'eventChoice', player: pd.player, optionId: vote(pd.player) });
    else if (pd.kind === 'eventTarget') g.dispatch({ type: 'eventTarget', player: pd.player, targetId: pickTarget(pd.candidates) });
    else if (pd.kind === 'revealChoice') g.dispatch({ type: 'revealChoice', player: pd.player, mode: 'public' });
    else if (pd.kind === 'accusation') g.dispatch({ type: 'accuse', player: pd.player, accused: 2 });
    else throw new Error(`unexpected ${pd.kind}`);
  }
  return seen;
}
const expectPlayFor0 = (g: Game) => {
  expect(g.state.pending).toEqual({ kind: 'play', player: 0, focus: null });
  expect(g.state.phase).toBe('play');
  expect(g.state.activeEvent).toBeNull();
  expect(g.state.players[0].hand).toHaveLength(4);
  expect(g.state.players[0].influence).toBe(4); // TeamLead max, cost 0
};

describe('Global events never skip the active player\'s card phase (item 3)', () => {
  const variants: [string, Partial<Opt>][] = [
    ['no targets', { effects: [{ kind: 'loyalty', target: 'random', delta: 1 }] }],
    ['chooseEmployee', { chooseEmployee: true, effects: [{ kind: 'loyalty', target: 'chosen', delta: 1 }] }],
    ['chooseDept + chooseEmployee', { chooseDept: true, chooseEmployee: true, effects: [{ kind: 'loyalty', target: 'chosen', delta: -1 }] }],
    ['reveal interrupts', { effects: [{ kind: 'reveal', target: 'random' }] }],
    ['investigate → accusation', { effects: [{ kind: 'investigate' }] }],
  ];
  for (const resolution of ['individual', 'majority'] as const) {
    for (const [name, opt] of variants) {
      it(`${resolution} / ${name}`, () => {
        const g = round2With(gEvent(resolution, opt, opt));
        neutral(g).teamLead = 0; // a second dept so chooseDept really asks …
        g.state.players[0].influence = 4; // … without changing this turn's budget (cost 1 is paid after the event)
        const mole = emps(g, own(g, 0))[3];
        if (name.startsWith('investigate')) {
          for (const d of g.state.departments.filter((x) => x.teamLead === 0)) {
            E(g.state, d.employeeIds[3]).mole = { creator: 2, ability: 'SilentBlock', plantedRound: 1, expiresRound: 9, used: false, exposed: false, creatorRevealed: false };
          }
        }
        const seen = drive(g);
        expect(seen.at(-1)).toBe('play:0');
        expect(seen.filter((x) => x.startsWith('eventChoice'))).toEqual(['eventChoice:0', 'eventChoice:1', 'eventChoice:2']);
        if (name === 'reveal interrupts') expect(seen.filter((x) => x.startsWith('revealChoice'))).toHaveLength(3);
        if (name.startsWith('investigate')) expect(seen).toContain('accusation:0');
        expect(g.state.pending).toEqual({ kind: 'play', player: 0, focus: null });
        expect(g.state.players[0].hand).toHaveLength(4);
        expect(g.state.players[0].influence).toBe(3); // 4 − cost 1 (two depts)
        expect(mole).toBeDefined();
      });
    }
  }

  it('the same holds for a plain Local event', () => {
    const g = round2With({ ...gEvent('individual', { chooseEmployee: true, effects: [{ kind: 'loyalty', target: 'chosen', delta: 1 }] }), type: 'Local', resolution: undefined });
    expect(drive(g)).toEqual(['eventChoice:0', 'eventTarget:0:employee', 'play:0']);
    expectPlayFor0(g);
  });

  it('still reaches play when the event knocks out a reveal target player\'s dept (interrupt dropped)', () => {
    const g = round2With(gEvent('majority', { effects: [{ kind: 'investigate' }] }));
    const d = own(g, 1);
    E(g.state, d.employeeIds[0]).mole = { creator: 0, ability: 'SilentBlock', plantedRound: 1, expiresRound: 9, used: false, exposed: false, creatorRevealed: false };
    drive(g);
    expectPlayFor0(g);
  });
});

describe('event target prompts (item 4)', () => {
  it('individual Global: each vote is immediately followed by that player\'s target prompts', () => {
    const g = round2With(gEvent('individual', { chooseDept: true, chooseEmployee: true, effects: [{ kind: 'loyalty', target: 'chosen', delta: 1 }] },
      { effects: [{ kind: 'influence', delta: 1 }] }));
    neutral(g).teamLead = 0; // P0 leads two depts → real dept choice
    const seen = drive(g, (c) => c[0], (pid) => (pid === 2 ? 'B' : 'A'));
    expect(seen).toEqual(['eventChoice:0', 'eventTarget:0:dept', 'eventTarget:0:employee', 'eventChoice:1', 'eventTarget:1:employee',
      'eventChoice:2', 'play:0']);
    expect(g.state.players[2].influenceBank).toBe(1);
  });

  it('employee candidates are the 4 employees of the chosen department, and the pick is what moves', () => {
    const g = round2With(gEvent('individual', { chooseDept: true, chooseEmployee: true, effects: [{ kind: 'loyalty', target: 'chosen', delta: 1 }] }));
    const second = neutral(g);
    second.teamLead = 0;
    g.dispatch({ type: 'eventChoice', player: 0, optionId: 'A' });
    expect(g.state.pending).toMatchObject({ kind: 'eventTarget', player: 0, choose: 'dept' });
    g.dispatch({ type: 'eventTarget', player: 0, targetId: second.id });
    const pd = g.state.pending;
    expect(pd).toMatchObject({ kind: 'eventTarget', player: 0, choose: 'employee', candidates: second.employeeIds });
    const pickId = second.employeeIds[2];
    g.dispatch({ type: 'eventTarget', player: 0, targetId: pickId });
    drive(g);
    expect(E(g.state, pickId).loyalty).toBe('Favorable');
    expect(emps(g, second).filter((e) => e.loyalty !== 'Neutral').map((e) => e.id)).toEqual([pickId]);
    expect(g.state.log.some((l) => l.tag === 'event' && l.text.includes(`Test Global in ${second.name} — P0 chose Alpha: ${E(g.state, pickId).name} (Neutral → Favorable)`))).toBe(true);
  });

  it('majority Global: all votes first, then targets in seat order from the active player', () => {
    const g = round2With(gEvent('majority', { chooseEmployee: true, effects: [{ kind: 'loyalty', target: 'chosen', delta: 1 }] }));
    const seen = drive(g);
    expect(seen).toEqual(['eventChoice:0', 'eventChoice:1', 'eventChoice:2',
      'eventTarget:0:employee', 'eventTarget:1:employee', 'eventTarget:2:employee', 'play:0']);
  });

  it('Promotion Season — Honor Commitments: candidates are only promised employees', () => {
    const promo = buildEventDeck('full').find((c) => c.templateId === 'promotion-season')!;
    const g = round2With(promo);
    const [a, b, c] = emps(g, own(g, 0));
    a.promise = { byPlayer: 0, expiresRound: 5 };
    c.promise = { byPlayer: 0, expiresRound: 5 };
    g.dispatch({ type: 'eventChoice', player: 0, optionId: 'A' });
    expect(g.state.pending).toMatchObject({ kind: 'eventTarget', player: 0, choose: 'employee', candidates: [a.id, c.id] });
    g.dispatch({ type: 'eventTarget', player: 0, targetId: c.id });
    expect(g.state.pending).toMatchObject({ kind: 'eventChoice', player: 1 }); // next voter only after P0's pick
    drive(g, (cs) => cs[0], () => 'B');
    expect(c).toMatchObject({ loyalty: 'Favorable', promise: null });
    expect(a).toMatchObject({ loyalty: 'Skeptical', promise: null });
    expect(b.loyalty).toBe('Neutral');
    expectPlayFor0(g);
  });

  it('Promotion Season — Honor Commitments with no promises: no prompt, logged fallback', () => {
    const promo = buildEventDeck('full').find((c) => c.templateId === 'promotion-season')!;
    const g = round2With(promo);
    g.dispatch({ type: 'eventChoice', player: 0, optionId: 'A' });
    expect(g.state.pending).toMatchObject({ kind: 'eventChoice', player: 1 });
    drive(g, (cs) => cs[0], () => 'A');
    expect(g.state.log.some((l) => l.text.includes(`nobody in ${own(g, 0).name} holds a promise`))).toBe(true);
    expect(g.state.lastEventResult!.perPlayer[0].changes).toEqual([{ kind: 'text', text: `No promised employees in ${own(g, 0).name}: nothing to honour` }]);
    expectPlayFor0(g);
  });

  it('Promotion Season — Open Competition: any of the 4 can be picked and gains a state', () => {
    const promo = buildEventDeck('full').find((c) => c.templateId === 'promotion-season')!;
    const g = round2With(promo);
    g.dispatch({ type: 'eventChoice', player: 0, optionId: 'B' });
    const pd = g.state.pending;
    expect(pd).toMatchObject({ kind: 'eventTarget', player: 0, choose: 'employee', candidates: own(g, 0).employeeIds });
    const pickId = own(g, 0).employeeIds[3];
    g.dispatch({ type: 'eventTarget', player: 0, targetId: pickId });
    drive(g, (cs) => cs[0], () => 'B');
    expect(E(g.state, pickId).loyalty).toBe('Favorable');
    expectPlayFor0(g);
  });
});

describe('event outcome for the UI (D41)', () => {
  it('records votes, outcome and every player\'s changes, kept until the next event', () => {
    const g = round2With(gEvent('majority',
      { effects: [{ kind: 'influence', delta: 1 }, { kind: 'loyalty', target: 'all', delta: 1 }], minorityEffects: [{ kind: 'loyalty', target: 'random', delta: -1 }] },
      { effects: [{ kind: 'protectDept', rounds: 1 }] }));
    own(g, 2).protectedUntilRound = 5; // P2's minority hit is blocked
    drive(g, (c) => c[0], (pid) => (pid === 2 ? 'B' : 'A'));
    const r = g.view(1).lastEventResult!;
    expect(r).toMatchObject({ title: 'Test Global', type: 'Global', outcome: { optionId: 'A', label: 'Alpha' } });
    expect(r.votes).toEqual([{ player: 0, optionId: 'A', optionLabel: 'Alpha' }, { player: 1, optionId: 'A', optionLabel: 'Alpha' }, { player: 2, optionId: 'B', optionLabel: 'Beta' }]);
    expect(r.perPlayer.map((p) => [p.player, p.deptId, p.minority])).toEqual([[0, own(g, 0).id, false], [1, own(g, 1).id, false], [2, own(g, 2).id, true]]);
    expect(r.perPlayer[0].changes[0]).toEqual({ kind: 'influence', delta: 1 });
    expect(r.perPlayer[0].changes.filter((c) => c.kind === 'loyalty')).toHaveLength(4);
    expect(r.perPlayer[2].changes).toContainEqual({ kind: 'text', text: `Protected: no effect on ${own(g, 2).name}` });
    expect(r.actionCount).toBe(g.state.actionCount);
    expect(g.view(0).activeEvent).toBeNull();
    done(g); // P1's turn: no event in the deck → the old result stays
    expect(g.view(0).lastEventResult!.eventId).toBe(r.eventId);
  });

  it('records "nothing happened" as an empty list, and Local outcome = the chosen option', () => {
    const g = round2With({ ...gEvent('individual'), type: 'Local', resolution: undefined });
    drive(g);
    const r = g.state.lastEventResult!;
    expect(r.outcome).toMatchObject({ optionId: 'A' });
    expect(r.perPlayer).toEqual([{ player: 0, deptId: own(g, 0).id, minority: false, changes: [] }]);
  });

  it('reveals: trait only for the revealer until disclosed publicly; intel newest first with dept', () => {
    const g = round2With({ id: 'rv#9', templateId: 'rv', type: 'Reveal', title: 'Reveal', situation: '', options: [] });
    const pd = g.state.pending;
    if (pd.kind !== 'revealChoice') throw new Error('expected reveal');
    g.state.players[0].intel.push({ employeeId: g.state.employees[0].id, trait: g.state.employees[0].hiddenTrait2, weight: 0 });
    g.dispatch({ type: 'revealChoice', player: 0, mode: 'private' });
    const mine = g.view(0).lastEventResult!.perPlayer[0].changes[0];
    const theirs = g.view(1).lastEventResult!.perPlayer[0].changes[0];
    expect(mine).toEqual({ kind: 'reveal', employeeId: pd.employeeId, by: 0, public: false, trait: pd.trait, weight: pd.weight });
    expect(theirs).toEqual({ kind: 'reveal', employeeId: pd.employeeId, by: 0, public: false });
    const e = E(g.state, pd.employeeId);
    expect(g.state.log.at(-2)).toMatchObject({ visibility: 0, tag: 'reveal', text: expect.stringMatching(new RegExp(`^You now know: ${e.name} \\(`)) });
    expect(g.state.log.at(-1)!.text).not.toContain(e.name);
    const intel = g.view(0).players[0].intel!;
    expect(intel[0]).toMatchObject({ employeeId: pd.employeeId, deptId: e.deptId });
    expect(intel[1].employeeId).toBe(g.state.employees[0].id);

    const h = round2With({ id: 'rv#8', templateId: 'rv', type: 'Reveal', title: 'Reveal', situation: '', options: [] });
    const q = h.state.pending;
    if (q.kind !== 'revealChoice') throw new Error('expected reveal');
    h.dispatch({ type: 'revealChoice', player: 0, mode: 'public' });
    expect(h.view(2).lastEventResult!.perPlayer[0].changes[0]).toMatchObject({ public: true, trait: q.trait });
    expect(h.state.log.some((l) => l.visibility === 'public' && l.text.startsWith(`P0 disclosed publicly: ${E(h.state, q.employeeId).name}`))).toBe(true);
    expect(h.state.log.filter((l) => l.tag === 'reveal').every((l) => REVEAL_LINE.test(l.text))).toBe(true);
    expect(g.state.log.filter((l) => l.tag === 'reveal' && l.visibility === 0).every((l) => REVEAL_LINE.test(l.text))).toBe(true);
  });

  it('exposes turn info, department lead names and affected departments', () => {
    const g = round2With(gEvent('majority'));
    const v = g.view(0);
    expect(v.turn.eventCardId).toBe(g.state.activeEvent!.card.id);
    expect(v.departments.find((d) => d.id === own(g, 1).id)!.leadName).toBe('P1');
    expect(v.departments.find((d) => d.id === neutral(g).id)!.leadName).toBeNull();
    for (const pid of [0, 1, 2]) g.dispatch({ type: 'eventChoice', player: pid, optionId: 'A' });
    // event done; affected = each player's dept (checked on the stored result)
    expect(g.state.lastEventResult!.perPlayer.map((p) => p.deptId)).toEqual([0, 1, 2].map((pid) => own(g, pid).id));
    const h = round2With({ ...gEvent('individual', { chooseEmployee: true, effects: [] }), type: 'Local', resolution: undefined });
    expect(h.view(1).activeEvent!.affectedDeptIds).toEqual([own(h, 0).id]);
    const k = round2With(gEvent('individual', { chooseEmployee: true, effects: [] }));
    k.dispatch({ type: 'eventChoice', player: 0, optionId: 'A' });
    expect(k.view(2).activeEvent!.affectedDeptIds).toEqual([own(k, 0).id]);
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
          {
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

describe('D44 event draw policy', () => {
  const cfg = (mode: 'Takeover' | 'Election'): GameConfig => ({ playerCount: 3, mode, rounds: 6, seed: 99, board: 'full', players: [{ name: 'A', isBot: false }, { name: 'B', isBot: false }, { name: 'C', isBot: false }] });
  it('both modes draw through the deck; the discard is reshuffled only when the deck is exhausted', () => {
    const el = Game.create(cfg('Election'));
    el.state.eventDiscard.push(el.state.eventDeck.pop()!, el.state.eventDeck.pop()!);
    const deckBefore = el.state.eventDeck.length;
    (el as any).state.pending = { kind: 'summary', player: 0 };
    el.dispatch({ type: 'endTurn', player: 0 });
    expect(el.state.eventDiscard.length).toBe(2); // no repeats until exhausted
    expect(el.state.eventDeck.length).toBe(deckBefore - 1);
    const tk = Game.create(cfg('Takeover'));
    tk.state.eventDiscard.push(tk.state.eventDeck.pop()!, tk.state.eventDeck.pop()!);
    const tkBefore = tk.state.eventDeck.length;
    (tk as any).state.pending = { kind: 'summary', player: 0 };
    tk.dispatch({ type: 'endTurn', player: 0 });
    expect(tk.state.eventDiscard.length).toBe(2); // untouched until the deck runs out
    expect(tk.state.eventDeck.length).toBe(tkBefore - 1);
  });
});
