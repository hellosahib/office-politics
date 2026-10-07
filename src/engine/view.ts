// Per-viewer filtered view (§56, §57, D2, D16). Everything is deep-copied; hidden data never leaves.
import { AGENDAS } from '../content';
import { LOYALTY_SCORE, MANAGEMENT_COST, influenceMaxFor } from './types';
import type { CardResult, EventPlayerResult, GameState as S, GameView, Pending, PlayerId } from './types';
import { E, deptsOf, knows, maxRounds, nPlayers, rebelCount } from './rules';

const clone = <T>(x: T): T => structuredClone(x);

export function buildView(s: S, viewer: PlayerId | null): GameView {
  const over = s.phase === 'gameOver';
  const count = (pid: PlayerId, l: 'Loyal' | 'Favorable') => s.employees.filter((e) => e.loyalty === l && e.politicalOwner === pid).length;
  const ev = s.activeEvent;
  const votesVisible = !!ev && ev.remaining.length === 0;
  const ts = s.turnSummary;
  return {
    viewer, config: clone(s.config), round: s.round, maxRounds: maxRounds(s), currentPlayer: s.currentPlayer,
    firstPlayer: s.firstPlayer, phase: s.phase, pending: maskPending(s, viewer), focus: s.focus,
    departments: s.departments.map((d) => {
      const r = rebelCount(s, d);
      return { id: d.id, name: d.name, adjacency: [...d.adjacency], slot: d.slot, employeeIds: [...d.employeeIds],
        teamLead: d.teamLead, rebelCount: r, instability: r >= 4 ? 3 : r === 3 ? 2 : r === 2 ? 1 : 0,
        protectedUntilRound: d.protectedUntilRound, leadName: d.teamLead === null ? null : s.players[d.teamLead].name };
    }),
    employees: s.employees.map((e) => {
      const m = e.mole;
      const mine = m?.creator === viewer;
      const showMole = !!m && (over || mine || m.exposed);
      return {
        id: e.id, deptId: e.deptId, name: e.name, role: e.role, visual: e.visual, permanentTrait: e.permanentTrait,
        hiddenTrait1: knows(s, viewer, e, 1) ? e.hiddenTrait1 : null, hiddenTrait1Public: e.hiddenTrait1Revealed,
        hiddenTrait2: knows(s, viewer, e, 2) ? e.hiddenTrait2 : null, hiddenTrait2Public: e.hiddenTrait2Revealed,
        loyalty: e.loyalty, loyaltyScore: LOYALTY_SCORE[e.loyalty], politicalOwner: e.politicalOwner,
        rebelInclination: over || (viewer !== null && e.rebelInclination === viewer) ? e.rebelInclination : null,
        promise: e.promise && { ...e.promise },
        // creator -1 = exposed mole whose planter is still unknown to this viewer
        mole: showMole && m ? { ...m, creator: over || mine || m.creatorRevealed ? m.creator : -1,
          visibleBecause: mine ? 'creator' as const : 'exposed' as const } : null,
      };
    }),
    players: s.players.map((p) => {
      const me = p.id === viewer;
      const ds = deptsOf(s, p.id);
      return {
        id: p.id, name: p.name, isBot: p.isBot, color: p.color, rank: p.rank, influence: p.influence,
        influenceMax: influenceMaxFor(p.rank, nPlayers(s)), managementCost: MANAGEMENT_COST[ds.length],
        controlledDepartments: ds.map((d) => d.id), hand: me ? clone(p.hand) : null, handCount: p.hand.length,
        reserve: me ? clone(p.reserve) : null, reserveCount: p.reserve.length,
        agenda: (me || over) && p.agenda ? clone(AGENDAS.find((a) => a.id === p.agenda) ?? null) : null,
        eliminated: p.eliminated, loyalists: count(p.id, 'Loyal'), favorable: count(p.id, 'Favorable'),
        rebels: ds.reduce((n, d) => n + rebelCount(s, d), 0),
        activeMoles: me || over ? s.employees.filter((e) => e.mole?.creator === p.id).length : null,
        intel: me ? [...p.intel].reverse().map((i) => ({ ...i, deptId: E(s, i.employeeId).deptId })) : null, // newest first
      };
    }),
    activeEvent: ev ? {
      ...clone(ev), results: maskResults(ev.results ?? [], viewer),
      affectedDeptIds: [...(ev.affectedDeptIds ?? [])],
      // D16: secret votes stay hidden (except your own) until everyone has locked in
      votes: votesVisible ? { ...ev.votes } : viewer !== null && ev.votes[viewer] ? { [viewer]: ev.votes[viewer] } : {},
      votesVisible,
    } : null,
    log: s.log.filter((l) => l.visibility === 'public' || l.visibility === viewer).map((l) => ({ ...l })),
    turnSummary: ts ? { ...clone(ts), moleActivity: ts.player === viewer || over ? [...ts.moleActivity] : [] } : null,
    winner: s.winner, scores: clone(s.scores), actionCount: s.actionCount,
    turn: {
      number: s.turn?.number ?? 0, eventCardId: s.turn?.eventCardId ?? null,
      // card instance ids name the template: only the dealt player sees them
      drawnThisTurn: viewer === s.currentPlayer ? [...(s.turn?.drawnThisTurn ?? [])] : [],
    },
    ...(s.lastCardResult ? { lastCardResult: cardResult(s.lastCardResult, viewer) } : {}),
    ...(s.lastEventResult ? { lastEventResult: { ...clone(s.lastEventResult), perPlayer: maskResults(s.lastEventResult.perPlayer, viewer) } } : {}),
  };
}

/** D41: a reveal's trait/weight only for its revealer, or for everyone once disclosed publicly. */
function maskResults(rs: EventPlayerResult[], viewer: PlayerId | null): EventPlayerResult[] {
  return rs.map((r) => ({ ...r, changes: r.changes.map((c) => {
    if (c.kind !== 'reveal' || c.public || c.by === viewer) return { ...c };
    const { trait: _t, weight: _w, ...rest } = c;
    return rest;
  }) }));
}

/** D30/D40: only the actor sees Blocked and the score breakdown; others see a plain Failure. */
function cardResult(r: NonNullable<S['lastCardResult']>, viewer: PlayerId | null): CardResult {
  const { publicReaction, explanation, ...rest } = clone(r);
  if (viewer === r.actor) return { ...rest, explanation };
  return { ...rest, band: r.band === 'Blocked' ? 'Failure' : r.band, reaction: publicReaction };
}

/** A pending reveal is private to its recipient: others see the employee but trait = permanent trait, weight -1. */
function maskPending(s: S, viewer: PlayerId | null): Pending {
  const pd = s.pending;
  if (pd.kind !== 'revealChoice' || pd.player === viewer) return { ...pd };
  return { ...pd, trait: E(s, pd.employeeId).permanentTrait, weight: -1 };
}
