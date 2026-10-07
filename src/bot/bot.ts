// Heuristic bot (D9). Sees only its own GameView, so it cannot cheat. No lookahead.
import {
  LOYALTY_SCORE, MAX_RESERVE,
  type Action, type CardId, type EmployeeId, type EmployeeView, type EventEffect,
  type GameView, type InfluenceCard, type Prediction, type TraitPole,
} from '../engine/types';

export interface BotHelpers {
  legalTargets(cardId: CardId): EmployeeId[];
  predict(cardId: CardId, targetId: EmployeeId): Prediction;
}

const MAX_CARDS_PER_TURN = 3;
const PLAY_THRESHOLD = 2;
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function decide(view: GameView, helpers: BotHelpers, rng: () => number = Math.random): Action {
  const me = view.viewer;
  const p = view.pending;
  if (me === null || p.kind === 'gameOver' || p.player !== me) throw new Error('bot: not my decision');
  const player = me;
  const self = view.players[me];

  switch (p.kind) {
    case 'play': // D37: no turn focus; legalTargets already follows each card's direction (D42)
      return choosePlay(view, helpers, rng) ?? { type: 'donePlaying', player };

    case 'save': {
      const room = Math.max(0, MAX_RESERVE - self.reserveCount);
      const keep = [...(self.hand ?? [])].sort((a, b) => a.cost - b.cost || byId(a, b))
        .slice(0, Math.min(self.influence, room));
      return { type: 'save', player, cardIds: keep.map((c) => c.id) };
    }

    case 'summary':
      return { type: 'endTurn', player };

    case 'revealChoice':
      return { type: 'revealChoice', player, mode: view.currentPlayer === me && self.influence >= 2 ? 'private' : 'public' }; // off-turn: bank not in view, play safe

    case 'accusation': {
      // Crude: the richest rival is the likeliest mole-planter.
      const rivals = view.players.filter((x) => x.id !== me && !x.eliminated)
        .sort((a, b) => b.influence - a.influence || a.id - b.id);
      return { type: 'accuse', player, accused: (rivals[0] ?? view.players.find((x) => x.id !== me)!).id };
    }

    case 'eventChoice': {
      const opts = view.activeEvent?.card.options ?? [];
      const val = (id: 'A' | 'B') => (opts.find((o) => o.id === id)?.effects ?? []).reduce((s, e) => s + effectValue(e), 0);
      return { type: 'eventChoice', player, optionId: val('B') > val('A') ? 'B' : 'A' };
    }

    case 'eventTarget':
      return { type: 'eventTarget', player, targetId: chooseEventTarget(view, p.optionId, p.choose, p.candidates) };
  }
}

function knownTraits(view: GameView, e: EmployeeView): Set<TraitPole> {
  const t = new Set<TraitPole>([e.permanentTrait]);
  if (e.hiddenTrait1) t.add(e.hiddenTrait1);
  if (e.hiddenTrait2) t.add(e.hiddenTrait2);
  for (const i of view.players[view.viewer!].intel ?? []) if (i.employeeId === e.id) t.add(i.trait);
  return t;
}

function choosePlay(view: GameView, h: BotHelpers, rng: () => number): Action | null {
  const me = view.viewer!;
  const self = view.players[me];
  const played = view.turnSummary?.player === me ? view.turnSummary.cardsPlayed.length : 0;
  if (played >= MAX_CARDS_PER_TURN) return null;

  const hand = [...(self.hand ?? [])].sort(byId);
  // Keep 1 influence back when there is something worth saving and room to save it.
  const reserveOne = hand.length > 1 && self.reserveCount < MAX_RESERVE ? 1 : 0;
  const budget = self.influence - reserveOne;
  const emp = new Map(view.employees.map((e) => [e.id, e]));
  const dept = new Map(view.departments.map((d) => [d.id, d]));
  const myDepts = new Set(self.controlledDepartments);
  const aligned = (deptId: string) => view.employees.filter((e) =>
    e.deptId === deptId && e.politicalOwner === me && (e.loyalty === 'Favorable' || e.loyalty === 'Loyal')).length;
  const reachable = (deptId: string) => myDepts.has(deptId) || [...myDepts].some((m) => dept.get(m)?.adjacency.includes(deptId));

  let best: { card: InfluenceCard; target: EmployeeId; score: number } | null = null;
  for (const card of hand) {
    if (card.cost > budget) continue;
    for (const tid of [...h.legalTargets(card.id)].sort()) {
      const e = emp.get(tid);
      const d = e && dept.get(e.deptId);
      if (!e || !d) continue;
      const rival = d.teamLead !== null && d.teamLead !== me;
      const ownedByMe = d.teamLead === me || e.politicalOwner === me;
      if (card.direction === 'negative' && ownedByMe) continue;
      if (card.direction === 'positive' && e.politicalOwner === me && e.loyalty === 'Loyal') continue;
      if (card.direction === 'mole' && !(rival && (e.loyalty === 'Favorable' || e.loyalty === 'Neutral') && !reachable(d.id))) continue;

      const pr = h.predict(card.id, tid);
      if (!pr.legal || pr.requiredSpend > budget) continue;
      let score = (pr.min + pr.max) / 2;
      const traits = knownTraits(view, e);
      if ((card.primary && traits.has(card.primary)) || (card.secondary && traits.has(card.secondary))) score += 1;
      if (card.direction === 'positive' && d.teamLead !== me && aligned(d.id) >= 2) score += 1.5;       // capture threat
      if (card.direction === 'negative' && rival && d.rebelCount === 2 && e.loyalty !== 'Rebel') score += 1.5; // tip into crisis
      score += rng() * 0.1; // small jitter so seeded sims vary; 0 in tests
      if (!best || score > best.score) best = { card, target: tid, score };
    }
  }
  if (!best || best.score < PLAY_THRESHOLD) return null;
  return { type: 'playCard', player: me, cardId: best.card.id, targetId: best.target };
}

/** Immediate value of an event effect for the actor (event depts are always the actor's own). */
function effectValue(e: EventEffect): number {
  switch (e.kind) {
    case 'influence': return e.delta;
    case 'draw': return e.count;
    case 'loyalty': return e.delta * 2;
    case 'protectDept': return 1;
    case 'severity': return -2 * e.delta;
    case 'investigate': return 1;
    case 'rebelPressure': return -3;
    case 'makeRebel': return -4;
    case 'actionBonus': return e.delta;
    case 'reveal': return 0.5;
    default: return 0;
  }
}

function chooseEventTarget(view: GameView, optionId: 'A' | 'B', choose: 'employee' | 'dept', candidates: string[]): string {
  const opt = view.activeEvent?.card.options.find((o) => o.id === optionId);
  const effects = opt?.effects ?? [];
  const sorted = [...candidates].sort();
  if (choose === 'dept') {
    // Shield the most fragile dept with good effects; send bad effects to the sturdiest.
    const good = effects.reduce((s, e) => s + effectValue(e), 0) >= 0;
    const rebels = (id: string) => view.departments.find((d) => d.id === id)?.rebelCount ?? 0;
    return sorted.reduce((a, b) => (good ? rebels(b) > rebels(a) : rebels(b) < rebels(a)) ? b : a);
  }
  const me = view.viewer!;
  const emps = sorted.map((id) => view.employees.find((e) => e.id === id)).filter((e): e is EmployeeView => !!e);
  if (emps.length === 0) return sorted[0];
  const loy = (e: EmployeeView) => LOYALTY_SCORE[e.loyalty];
  const chosenDelta = effects.find((e): e is Extract<EventEffect, { kind: 'loyalty' }> => e.kind === 'loyalty' && e.target === 'chosen')?.delta;
  if (chosenDelta === -1) {
    // Hurt the one we lose least on: not ours first, then lowest loyalty.
    const cost = (e: EmployeeView) => (e.politicalOwner === me ? 100 : 0) + loy(e);
    return emps.reduce((a, b) => (cost(b) < cost(a) ? b : a)).id;
  }
  if (chosenDelta === 1) {
    // Push a Favorable one to Loyal; otherwise the best non-Loyal.
    const fav = emps.find((e) => e.loyalty === 'Favorable');
    if (fav) return fav.id;
    const up = emps.filter((e) => e.loyalty !== 'Loyal');
    if (up.length) return up.reduce((a, b) => (loy(b) > loy(a) ? b : a)).id;
  }
  return emps.reduce((a, b) => (loy(b) > loy(a) ? b : a)).id;
}
