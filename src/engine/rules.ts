// Rule helpers operating on a mutable GameState. § = docs/SPEC.md, D = docs/DECISIONS.md.
// All randomness goes through ./rng with state.rng (determinism, D2).
import { pick, randomModifier, shuffle } from './rng';
import {
  LOYALTY_LADDER, MANAGEMENT_COST, PROMISE_ROUNDS, RANK_BONUS, MOLE_ROUNDS, TRAIT_LABEL, ELECTION_POINTS,
  ceoThreshold, influenceMaxFor, rankFor,
} from './types';
import type {
  Department, DeptId, Employee, EmployeeId, EventEffect, EffectTarget, Explanation, GameState as S,
  InfluenceCard, LoyaltyState, Pending, Player, PlayerId, Rank, ScoreBreakdown, TraitPole, TurnSummary,
} from './types';

// ---------------------------------------------------------------- lookups
export function E(s: S, id: EmployeeId): Employee {
  const e = s.employees.find((x) => x.id === id);
  if (!e) throw new Error(`unknown employee ${id}`);
  return e;
}
export function D(s: S, id: DeptId): Department {
  const d = s.departments.find((x) => x.id === id);
  if (!d) throw new Error(`unknown department ${id}`);
  return d;
}
export const deptsOf = (s: S, pid: PlayerId) => s.departments.filter((d) => d.teamLead === pid);
export const rebelCount = (s: S, d: Department) => d.employeeIds.filter((id) => E(s, id).loyalty === 'Rebel').length;
export const alive = (s: S) => s.players.filter((p) => !p.eliminated);
export const nPlayers = (s: S) => s.players.length as 3 | 4;
export const lvl = (l: LoyaltyState) => LOYALTY_LADDER.indexOf(l);
export const aligned = (e: Employee, pid: PlayerId) =>
  (e.loyalty === 'Favorable' || e.loyalty === 'Loyal') && e.politicalOwner === pid;
export const influenceMax = (s: S, p: Player) => influenceMaxFor(p.rank, nPlayers(s));
export const managementCost = (s: S, pid: PlayerId) => MANAGEMENT_COST[deptsOf(s, pid).length];
/** Mini board forces 6 rounds; Election uses config.rounds; Takeover has no limit (§23, §82). */
export const maxRounds = (s: S): number | null =>
  s.config.board === 'mini' ? 6 : s.config.mode === 'Election' ? (s.config.rounds ?? 10) : null;
export const activeMolesOf = (s: S, pid: PlayerId) => s.employees.filter((e) => e.mole?.creator === pid).length;

export function log(s: S, text: string, visibility: 'public' | PlayerId = 'public', tag?: string) {
  s.log.push({ round: s.round, turn: s.currentPlayer, text, visibility, ...(tag ? { tag } : {}) });
}

// ---------------------------------------------------------------- traits (§27, §28)
export function traitsOf(e: Employee) {
  return [
    { trait: e.permanentTrait, w: 1, slot: 0 as const },
    { trait: e.hiddenTrait1, w: 2, slot: 1 as const },
    { trait: e.hiddenTrait2, w: 0, slot: 2 as const },
  ];
}
export const traitMod = (c: InfluenceCard, t: TraitPole, w: number) =>
  (t === c.primary || t === c.secondary ? w : 0) - (t === c.adverse ? w : 0);

/** Does `viewer` know trait `slot` of e? Permanent always; hidden if public, in intel, or game over. */
export function knows(s: S, viewer: PlayerId | null, e: Employee, slot: 0 | 1 | 2): boolean {
  if (slot === 0 || s.phase === 'gameOver') return true;
  const [trait, pub] = slot === 1 ? [e.hiddenTrait1, e.hiddenTrait1Revealed] : [e.hiddenTrait2, e.hiddenTrait2Revealed];
  return pub || (viewer !== null && s.players[viewer].intel.some((i) => i.employeeId === e.id && i.trait === trait));
}
const unknownSlots = (s: S, pid: PlayerId, e: Employee) => ([1, 2] as const).filter((sl) => !knows(s, pid, e, sl));

/** Build a revealChoice prompt for a random hidden trait `pid` doesn't know (D21). */
export function revealPrompt(s: S, pid: PlayerId, pool: Employee[]): Pending | null {
  const cands = pool.filter((e) => unknownSlots(s, pid, e).length);
  if (!cands.length) return null;
  const e = pick(s.rng, cands);
  const slot = pick(s.rng, unknownSlots(s, pid, e));
  return { kind: 'revealChoice', player: pid, employeeId: e.id,
    trait: slot === 1 ? e.hiddenTrait1 : e.hiddenTrait2, weight: slot === 1 ? 2 : 0 };
}

// ---------------------------------------------------------------- turn summary (§67)
export function newSummary(pid: PlayerId): TurnSummary {
  return { player: pid, influenceSpent: 0, cardsPlayed: [], cardsSaved: [], employeesChanged: [], newRebels: [],
    departmentsCaptured: [], departmentsLost: [], managementPenalty: false, promisesCreated: [], promisesResolved: [],
    moleActivity: [], promotion: null };
}
const summaryFor = (s: S, pid: PlayerId) => (s.turnSummary?.player === pid ? s.turnSummary : null);
function noteChange(s: S, e: Employee, from: LoyaltyState) {
  const ts = s.turnSummary;
  if (!ts || from === e.loyalty) return;
  const c = ts.employeesChanged.find((x) => x.employeeId === e.id);
  if (c) c.to = e.loyalty;
  else ts.employeesChanged.push({ employeeId: e.id, from, to: e.loyalty });
}

// ---------------------------------------------------------------- loyalty movement (§10–§16, D4)
export interface MoveOpts {
  /** Player responsible. Positive: becomes political owner. Negative: hostile contribution (§14B). null = event/system. */
  actor: PlayerId | null;
  spend?: number;
  /** Who gets stats.rebelsCreated if this creates a Rebel (D23). Defaults to actor. */
  credit?: PlayerId | null;
}

/** Move one state. Returns false if the move is impossible (edge of ladder, §42 loyalty lock, D4 rival-aligned). */
export function move(s: S, e: Employee, dir: 1 | -1, o: MoveOpts): boolean {
  const i = lvl(e.loyalty);
  const from = e.loyalty;
  if (dir > 0) {
    if (i === 4 || e.mole) return false; // top of ladder / §42 Loyalty Lock
    if (i >= 3 && o.actor !== null && e.politicalOwner !== null && e.politicalOwner !== o.actor) return false; // D4
    e.loyalty = LOYALTY_LADDER[i + 1];
    if (o.actor !== null) e.politicalOwner = o.actor;
    if (from === 'Rebel') e.rebelInclination = null;
    if (i + 1 >= 2) e.hostileContributions = {}; // back at Neutral+: the loyalty conflict is over (§14B)
  } else {
    if (i === 0) return false;
    e.loyalty = LOYALTY_LADDER[i - 1];
    if (o.actor !== null && o.spend) e.hostileContributions[o.actor] = (e.hostileContributions[o.actor] ?? 0) + o.spend;
    if (e.loyalty === 'Neutral') e.politicalOwner = null; // D4
    if (e.loyalty === 'Rebel') becameRebel(s, e, o.actor, o.credit === undefined ? o.actor : o.credit);
  }
  noteChange(s, e, from);
  return true;
}

/** Set Rebel outright (makeRebel event effect, §14A). */
export function forceRebel(s: S, e: Employee, credit: PlayerId | null) {
  if (e.loyalty === 'Rebel') return;
  const from = e.loyalty;
  e.loyalty = 'Rebel';
  becameRebel(s, e, null, credit);
  noteChange(s, e, from);
}

function becameRebel(s: S, e: Employee, actor: PlayerId | null, credit: PlayerId | null) {
  e.politicalOwner = null; // §15 a Rebel belongs to nobody
  const contrib = Object.entries(e.hostileContributions)
    .map(([k, v]) => [Number(k), v] as const)
    .filter(([k]) => !s.players[k].eliminated);
  if (actor !== null) {
    // §14B: most hostile influence this conflict; tie → the player who made the final push.
    const best = Math.max(0, ...contrib.map(([, v]) => v));
    const top = contrib.filter(([, v]) => v === best).map(([k]) => k);
    e.rebelInclination = !top.length || top.includes(actor) ? actor : pick(s.rng, top);
  } else {
    e.rebelInclination = smallestLead(s, D(s, e.deptId), false); // §14A / D15
  }
  if (credit !== null && !s.players[credit].eliminated) s.players[credit].stats.rebelsCreated++;
  s.turnSummary?.newRebels.push(e.id);
  log(s, `${e.name} has turned Rebel.`, 'public', 'rebel');
  if (e.rebelInclination !== null) log(s, `${e.name}'s rebellion leans toward you.`, e.rebelInclination, 'rebel');
}

/** D15: smallest organisation among leads adjacent to d (excluding d's own lead); optional fallback to anyone. */
function smallestLead(s: S, d: Department, adjacentOnly: boolean): PlayerId | null {
  const size = (pid: PlayerId) => deptsOf(s, pid).length;
  const leads = alive(s).filter((p) => p.id !== d.teamLead && size(p.id) > 0);
  let cands = leads.filter((p) => deptsOf(s, p.id).some((x) => d.adjacency.includes(x.id)));
  if (!cands.length && !adjacentOnly) cands = leads;
  if (!cands.length) return null;
  const min = Math.min(...cands.map((p) => size(p.id)));
  return pick(s.rng, cands.filter((p) => size(p.id) === min)).id;
}

// ---------------------------------------------------------------- cascade (§17–§22, D17, D18)
/** Re-check every department threshold, capture, elimination and end condition until stable. */
export function settle(s: S) {
  for (let guard = 0; guard < 100 && s.phase !== 'gameOver'; guard++) if (!settleOnce(s)) return;
}

function settleOnce(s: S): boolean {
  for (const d of s.departments) {
    const r = rebelCount(s, d);
    if (d.teamLead !== null && r >= 3) return crisis(s, d), true; // §17 3 rebels
    if (d.teamLead !== null && r === 2) {
      // D5: Rebel Pressure mole fires automatically → temporary 3rd rebel (§43)
      const host = d.employeeIds.map((id) => E(s, id)).find((e) =>
        e.mole && e.mole.ability === 'RebelPressure' && !e.mole.used && e.mole.creator !== d.teamLead);
      if (host?.mole) {
        host.mole.used = true;
        log(s, `Mole triggered successfully: Rebel Pressure in ${d.name}.`, host.mole.creator, 'mole');
        summaryFor(s, host.mole.creator)?.moleActivity.push(`Rebel Pressure triggered in ${d.name}`);
        return crisis(s, d), true;
      }
    }
    if (r === 4 && settleRebellion(s, d)) return true; // §18
    for (const p of alive(s)) {
      if (d.teamLead !== p.id && d.employeeIds.filter((id) => aligned(E(s, id), p.id)).length >= 3) {
        return capture(s, d, p.id), true; // §20
      }
    }
  }
  for (const p of alive(s)) if (!deptsOf(s, p.id).length) return eliminate(s, p), true; // §6
  return checkEnd(s);
}

function crisis(s: S, d: Department) {
  const old = d.teamLead as PlayerId;
  d.teamLead = null; // D17: dept turns Neutral, rebels intact
  log(s, `Leadership crisis in ${d.name}: ${s.players[old].name} is downsized.`, 'public', 'crisis');
  lostDept(s, old, d);
}

function lostDept(s: S, pid: PlayerId, d: Department) {
  const p = s.players[pid];
  if (d.id === p.stats.startingDept) p.stats.lostStartingDept = true;
  summaryFor(s, pid)?.departmentsLost.push(d.id);
  updateRank(s, pid);
}

function capture(s: S, d: Department, pid: PlayerId) {
  const old = d.teamLead;
  const p = s.players[pid];
  d.teamLead = pid;
  p.promotionPoints++;
  if (old === null) p.stats.capturedNeutral = true;
  log(s, `${p.name} captured ${d.name}${old !== null ? ` — ${s.players[old].name} resigns` : ''}.`, 'public', 'capture');
  if (old !== null) lostDept(s, old, d);
  summaryFor(s, pid)?.departmentsCaptured.push(d.id);
  updateRank(s, pid);
}

/** §18 settlement. Returns true if a new lead was installed. */
function settleRebellion(s: S, d: Department): boolean {
  const emps = d.employeeIds.map((id) => E(s, id));
  const counts = new Map<PlayerId, number>();
  for (const e of emps) {
    if (e.rebelInclination !== null && !s.players[e.rebelInclination].eliminated) {
      counts.set(e.rebelInclination, (counts.get(e.rebelInclination) ?? 0) + 1);
    }
  }
  const majority = [...counts].find(([, n]) => n >= 3)?.[0];
  const lead = majority ?? smallestLead(s, d, true);
  if (lead === null) return false; // no valid lead: rebels and inclinations stay
  for (const e of emps) {
    const from = e.loyalty;
    const toLead = e.rebelInclination === lead;
    e.loyalty = toLead ? 'Loyal' : 'Neutral';
    e.politicalOwner = toLead ? lead : null;
    e.rebelInclination = null;
    e.hostileContributions = {};
    noteChange(s, e, from);
  }
  log(s, `Full rebellion in ${d.name} settles: ${s.players[lead].name} takes over.`, 'public', 'crisis');
  capture(s, d, lead);
  return true;
}

function eliminate(s: S, p: Player) {
  p.eliminated = true;
  for (const e of s.employees) {
    if (aligned(e, p.id)) { const from = e.loyalty; e.loyalty = 'Neutral'; e.politicalOwner = null; noteChange(s, e, from); }
    if (e.mole?.creator === p.id) e.mole = null;
  }
  s.influenceDiscard.push(...p.hand, ...p.reserve);
  p.hand = [];
  p.reserve = [];
  log(s, `${p.name} has no department left and is eliminated.`, 'public', 'elimination'); // D18
}

const RANKS: Rank[] = ['TeamLead', 'Manager', 'AVP', 'VP', 'CEO'];
function updateRank(s: S, pid: PlayerId) {
  const p = s.players[pid];
  let r = rankFor(deptsOf(s, pid).length, nPlayers(s));
  if (r === 'CEO' && (s.config.mode !== 'Takeover' || s.config.board === 'mini')) r = 'VP';
  if (r === p.rank) return;
  const up = RANKS.indexOf(r) > RANKS.indexOf(p.rank);
  p.rank = r;
  if (r === 'VP' && p.stats.reachedVPRound === null) p.stats.reachedVPRound = s.round;
  log(s, `${p.name} is ${up ? 'promoted' : 'demoted'} to ${r === 'TeamLead' ? 'Team Lead' : r}.`, 'public', 'promotion');
  const ts = summaryFor(s, pid);
  if (ts && up) ts.promotion = r;
}

/** CEO (§22, Takeover full board only) or last player standing (D25). */
function checkEnd(s: S): boolean {
  if (s.config.mode === 'Takeover' && s.config.board === 'full') {
    const ceo = alive(s).find((p) => deptsOf(s, p.id).length >= ceoThreshold(nPlayers(s)));
    if (ceo) { ceo.rank = 'CEO'; endGame(s, ceo.id); return true; }
  }
  const left = alive(s);
  if (left.length <= 1) { endGame(s, left[0]?.id ?? null); return true; }
  return false;
}

// ---------------------------------------------------------------- scoring (§24, D23, D24)
export function computeScores(s: S): Record<string, ScoreBreakdown> {
  const count = (pid: PlayerId, l: LoyaltyState) => s.employees.filter((e) => e.loyalty === l && e.politicalOwner === pid).length;
  const maxLoyal = Math.max(...s.players.map((p) => count(p.id, 'Loyal')));
  const max = maxRounds(s) ?? Infinity;
  const out: Record<string, ScoreBreakdown> = {};
  for (const p of s.players) {
    const ds = deptsOf(s, p.id);
    const loyal = count(p.id, 'Loyal');
    const rebels = ds.reduce((n, d) => n + rebelCount(s, d), 0);
    const st = p.stats;
    const done = !!p.agenda && ({
      EmpireBuilder: ds.length >= 4,
      Stabilizer: ds.length > 0 && ds.every((d) => rebelCount(s, d) <= 1),
      PuppetMaster: st.maxActiveMoles >= 2,
      Opportunist: st.capturedNeutral,
      Saboteur: st.rebelsCreated >= 5,
      PeopleManager: loyal > 0 && loyal === maxLoyal,
      Survivor: !st.lostStartingDept,
      Climber: st.reachedVPRound !== null && st.reachedVPRound < max,
      InformationBroker: st.privateReveals >= 4,
      CorporateFixer: st.negativeEventsResolved >= 3,
    } as const)[p.agenda];
    const b: ScoreBreakdown = {
      departments: ds.length * ELECTION_POINTS.department,
      loyalists: loyal * ELECTION_POINTS.loyal,
      favorable: count(p.id, 'Favorable') * ELECTION_POINTS.favorable,
      rebels: rebels * ELECTION_POINTS.rebel,
      molesPlanted: st.molesPlanted * ELECTION_POINTS.molePlanted, // D24
      agenda: done ? ELECTION_POINTS.agenda : 0,
      agendaCompleted: done,
      total: 0,
    };
    b.total = b.departments + b.loyalists + b.favorable + b.rebels + b.molesPlanted + b.agenda;
    out[p.id] = b;
  }
  return out;
}

export function endGame(s: S, winner: PlayerId | null) {
  const sc = computeScores(s);
  s.scores = sc;
  if (winner === null) {
    // §24 tie-breakers: total, departments, loyal, fewest rebels, agenda; then survivors, then seat.
    const key = (p: Player) => {
      const b = sc[p.id];
      return [b.total, b.departments, b.loyalists, b.rebels, b.agendaCompleted ? 1 : 0, p.eliminated ? 0 : 1, -p.id];
    };
    winner = [...s.players].sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
      return 0;
    })[0].id;
  }
  s.winner = winner;
  s.phase = 'gameOver';
  s.pending = { kind: 'gameOver' };
  s.interrupts = [];
  log(s, `${s.players[winner].name} becomes CEO!`, 'public', 'gameOver');
}

// ---------------------------------------------------------------- cards (§30–§44)
export function draw(s: S, p: Player, n: number) {
  for (let i = 0; i < n; i++) {
    if (!s.influenceDeck.length) { s.influenceDeck = shuffle(s.rng, s.influenceDiscard); s.influenceDiscard = []; }
    const c = s.influenceDeck.pop();
    if (!c) return; // nothing left anywhere: draw fewer
    p.hand.push(c);
  }
}

/** §37 / §16: max(card cost, loyalty resistance). */
export const spendFor = (c: InfluenceCard, e: Employee) =>
  Math.max(c.cost, (c.direction === 'negative' && e.loyalty === 'Loyal') || (c.direction === 'positive' && e.loyalty === 'Rebel') ? 2 : 0);

export type PlayCheck = { error: string } | { card: InfluenceCard; e: Employee; spend: number };

/** Full playCard validation (no mutation). requireFocus=false lets legalTargets work before focus is picked. */
export function checkPlay(s: S, pid: PlayerId, cardId: string, targetId: string, requireFocus: boolean): PlayCheck {
  const pd = s.pending;
  if (pd.kind !== 'play' || pd.player !== pid) return { error: 'Not your play phase' };
  const p = s.players[pid];
  const card = p.hand.find((c) => c.id === cardId) ?? p.reserve.find((c) => c.id === cardId);
  if (!card) return { error: 'Card not in your hand or reserve' };
  if (requireFocus && !s.focus) return { error: 'Choose Manage or Expand first' };
  if (s.focus && card.mode === 'Internal' && s.focus !== 'Manage') return { error: 'Internal cards can only be played when Managing' };
  if (s.focus && card.mode === 'External' && s.focus !== 'Expand') return { error: 'External cards can only be played when Expanding' };
  const e = s.employees.find((x) => x.id === targetId);
  if (!e) return { error: 'Unknown employee' };
  const own = D(s, e.deptId).teamLead === pid;
  const focus = s.focus ?? (card.mode === 'Internal' ? 'Manage' : card.mode === 'External' ? 'Expand' : own ? 'Manage' : 'Expand');
  if (focus === 'Manage' && !own) return { error: 'Manage: target must be in your own department' };
  if (focus === 'Expand' && own) return { error: 'Expand: target must be outside your departments' };
  if (p.targetedThisTurn.includes(e.id)) return { error: 'You already targeted this employee this turn' }; // §13
  if (card.direction === 'positive') {
    if (e.loyalty === 'Loyal') return { error: `${e.name} is already Loyal` };
    if (e.loyalty === 'Favorable' && e.politicalOwner !== null && e.politicalOwner !== pid) {
      return { error: `${e.name} is aligned with a rival; push them down first` }; // D4
    }
  } else if (card.direction === 'negative') {
    if (e.loyalty === 'Rebel') return { error: `${e.name} is already a Rebel` };
  } else {
    if (e.loyalty === 'Loyal') return { error: 'Moles cannot be planted on Loyal employees' }; // §41
    if (e.mole?.creator === pid) return { error: 'You already have a mole there' };
  }
  const spend = spendFor(card, e);
  if (p.influence < spend) return { error: `Needs ${spend} Influence` };
  return { card, e, spend };
}

/** Resolve a validated card (§73). */
export function resolvePlay(s: S, pid: PlayerId, card: InfluenceCard, e: Employee, spend: number) {
  const p = s.players[pid];
  p.hand = p.hand.filter((c) => c.id !== card.id);
  p.reserve = p.reserve.filter((c) => c.id !== card.id);
  s.influenceDiscard.push(card);
  p.influence -= spend;
  p.stats.cardsPlayed++;
  p.stats.influenceSpent += spend;
  p.targetedThisTurn.push(e.id);
  const ts = summaryFor(s, pid);
  if (ts) { ts.influenceSpent += spend; ts.cardsPlayed.push(card.direction === 'mole' ? 'Face-down card' : card.name); }

  if (card.direction === 'mole') {
    // §57: only the creator learns anything; the table just sees a face-down play.
    log(s, `${p.name} played a card face-down.`);
    if (e.mole) {
      log(s, `Your mole on ${e.name} failed to take hold — someone got there first.`, pid, 'mole');
      ts?.moleActivity.push(`Mole on ${e.name} failed`);
      return;
    }
    const ability = card.moleAbility ?? 'SilentBlock';
    e.mole = { creator: pid, ability, plantedRound: s.round, expiresRound: s.round + MOLE_ROUNDS + 1,
      used: false, exposed: false, creatorRevealed: false }; // D22
    p.stats.molesPlanted++;
    p.stats.maxActiveMoles = Math.max(p.stats.maxActiveMoles, activeMolesOf(s, pid));
    log(s, `You planted a ${ability} mole on ${e.name} (expires start of round ${e.mole.expiresRound}).`, pid, 'mole');
    ts?.moleActivity.push(`Planted ${ability} on ${e.name}`);
    return;
  }

  // §35 Action Score
  const lines: Explanation['lines'] = [{ label: 'Base', value: card.baseEffect }];
  let score = card.baseEffect;
  let hidden = false;
  for (const t of traitsOf(e)) {
    const v = traitMod(card, t.trait, t.w);
    score += v;
    if (!v) continue;
    if (knows(s, pid, e, t.slot)) lines.push({ label: TRAIT_LABEL[t.trait], value: v });
    else hidden = true;
  }
  const rank = RANK_BONUS[p.rank];
  if (rank) lines.push({ label: 'Rank', value: rank });
  if (p.actionBonus) { lines.push({ label: 'Event', value: p.actionBonus }); score += p.actionBonus; p.actionBonus = 0; }
  const rnd = randomModifier(s.rng);
  lines.push({ label: 'Random', value: rnd });
  score += rank + rnd;
  let band: Explanation['band'] = score <= 1 ? 'Failure' : score <= 3 ? 'Standard Success' : 'Strong Success';

  const dir: 1 | -1 = card.direction === 'positive' ? 1 : -1;
  const from = e.loyalty;
  if (dir > 0 && e.mole) {
    // D5 Silent Block (auto-trigger) / §42 Loyalty Lock: no upward movement; victim sees a plain failure.
    const m = e.mole;
    if (m.ability === 'SilentBlock' && !m.used && m.creator !== pid) {
      m.used = true;
      log(s, `Mole triggered successfully: blocked ${p.name}'s ${card.name} on ${e.name}.`, m.creator, 'mole');
      summaryFor(s, m.creator)?.moleActivity.push(`Silent Block on ${e.name}`);
    }
    band = 'Blocked';
  } else if (band !== 'Failure') {
    move(s, e, dir, { actor: pid, spend });
    if (card.secondaryEffect === 'promise') makePromise(s, pid, e); // D14: any success
    if (band === 'Strong Success') secondary(s, p, card, e, dir);
  } else {
    backfire(s, p, card, e, dir);
  }

  const ex: Explanation = { cardName: card.name, targetName: e.name, lines, hiddenTraitAffected: hidden, score, band, from, to: e.loyalty };
  const shown = band === 'Blocked' ? 'Failure' : band;
  const moved = from !== e.loyalty ? ` (${from} → ${e.loyalty})` : '';
  log(s, `${p.name} played ${card.name} on ${e.name}: ${shown}${moved}.`);
  log(s, explain(ex), pid, 'explanation');
  settle(s);
}

/** §89 explanation, only known information. */
export function explain(x: Explanation): string {
  const parts = x.lines.map((l) => `${l.label} ${l.value >= 0 ? '+' : ''}${l.value}`).join(', ');
  const res = x.band === 'Blocked' ? 'no effect' : x.band;
  return `${x.cardName} on ${x.targetName}: ${parts} = ${x.score} → ${res} (${x.from} → ${x.to}).` +
    (x.hiddenTraitAffected ? ' A hidden trait affected this decision.' : '');
}

function makePromise(s: S, pid: PlayerId, e: Employee) {
  e.promise = { byPlayer: pid, expiresRound: s.round + PROMISE_ROUNDS }; // §52 / D22
  summaryFor(s, pid)?.promisesCreated.push(e.id);
  log(s, `${s.players[pid].name} promised ${e.name} a promotion.`);
}

/** Another employee in the same dept that can legally move in `dir`. */
function rippleTarget(s: S, e: Employee, dir: 1 | -1, actor: PlayerId | null): Employee | null {
  const cands = D(s, e.deptId).employeeIds.map((id) => E(s, id)).filter((o) => o.id !== e.id && (dir < 0
    ? o.loyalty !== 'Rebel'
    : o.loyalty !== 'Loyal' && !o.mole && !(o.loyalty === 'Favorable' && actor !== null && o.politicalOwner !== null && o.politicalOwner !== actor)));
  return cands.length ? pick(s.rng, cands) : null;
}

function secondary(s: S, p: Player, card: InfluenceCard, e: Employee, dir: 1 | -1) {
  switch (card.secondaryEffect) {
    case 'ripple': {
      const o = rippleTarget(s, e, dir, p.id);
      const from = o?.loyalty;
      if (o && move(s, o, dir, { actor: p.id })) log(s, `Ripple: ${o.name} ${from} → ${o.loyalty}.`);
      break;
    }
    case 'refund': p.influence += 1; break;
    case 'reveal': {
      const sl = unknownSlots(s, p.id, e);
      if (!sl.length) break;
      const slot = pick(s.rng, sl);
      const trait = slot === 1 ? e.hiddenTrait1 : e.hiddenTrait2;
      p.intel.push({ employeeId: e.id, trait, weight: slot === 1 ? 2 : 0 });
      log(s, `Intel: ${e.name} is ${TRAIT_LABEL[trait]} (${slot === 1 ? '+2' : '0'}).`, p.id, 'reveal');
      break;
    }
    case 'draw': draw(s, p, 1); break;
    case 'extraStep': move(s, e, dir, { actor: p.id }); break; // the only >1-state move (§36)
    default: break; // 'none', 'promise' (handled on any success)
  }
}

function backfire(s: S, p: Player, card: InfluenceCard, e: Employee, dir: 1 | -1) {
  switch (card.backfire) {
    case 'reverse': {
      const from = e.loyalty;
      if (move(s, e, (-dir) as 1 | -1, { actor: null, credit: null })) log(s, `Backfire: ${e.name} ${from} → ${e.loyalty}.`);
      break;
    }
    case 'ripple': {
      const o = rippleTarget(s, e, (-dir) as 1 | -1, null);
      const from = o?.loyalty;
      if (o && move(s, o, (-dir) as 1 | -1, { actor: null, credit: null })) log(s, `Backfire: ${o.name} ${from} → ${o.loyalty}.`);
      break;
    }
    case 'loseInfluence': p.influence = Math.max(0, p.influence - 1); break;
    case 'exposeSelf': log(s, `${e.name} (${TRAIT_LABEL[e.permanentTrait]}) openly resents ${p.name}'s ${card.name}.`); break;
    default: break;
  }
}

// ---------------------------------------------------------------- event effects (§45–§52, D6, D8)
export const isNegative = (fx: EventEffect) =>
  (fx.kind === 'loyalty' && fx.delta < 0) || (fx.kind === 'influence' && fx.delta < 0) || (fx.kind === 'severity' && fx.delta > 0) ||
  fx.kind === 'makeRebel' || fx.kind === 'rebelPressure' || fx.kind === 'breakPromises';

function targets(s: S, d: Department, t: EffectTarget, chosen: EmployeeId | null, traits?: TraitPole[]): EmployeeId[] {
  const ids = d.employeeIds;
  const rnd = (pool: EmployeeId[]) => (pool.length ? [pick(s.rng, pool)] : []);
  switch (t) {
    case 'chosen': return chosen ? [chosen] : rnd(ids);
    case 'random': return rnd(ids);
    case 'randomOther': return rnd(ids.filter((id) => id !== chosen));
    case 'randomWithTrait': {
      const w = ids.filter((id) => traitsOf(E(s, id)).some((x) => traits?.includes(x.trait)));
      return rnd(w.length ? w : ids);
    }
    case 'promised': return ids.filter((id) => E(s, id).promise);
    case 'all': return [...ids];
    case 'twoRandom': return shuffle(s.rng, [...ids]).slice(0, 2);
    case 'randomRebel': return rnd(ids.filter((id) => E(s, id).loyalty === 'Rebel'));
  }
}

function protectedFrom(s: S, d: Department): boolean {
  if (s.round >= d.protectedUntilRound) return false;
  log(s, `${d.name} is protected: a negative effect was blocked.`, 'public', 'event');
  return true;
}

function evMove(s: S, e: Employee, dir: 1 | -1, o: MoveOpts) {
  const from = e.loyalty;
  if (move(s, e, dir, o)) log(s, `${e.name}: ${from} → ${e.loyalty}.`, 'public', 'event');
}

/** Apply one player's event effects to department d. `credit` = player who chose this (D23 rebelsCreated). */
export function applyEffects(s: S, pid: PlayerId, effects: EventEffect[], d: Department, chosen: EmployeeId | null,
  local: boolean, credit: PlayerId | null) {
  const p = s.players[pid];
  for (const fx of effects) {
    if (s.phase === 'gameOver' || p.eliminated) return;
    switch (fx.kind) {
      case 'loyalty': {
        if (fx.delta < 0 && protectedFrom(s, d)) break;
        const ts = targets(s, d, fx.target, chosen, fx.traits);
        if (fx.delta < 0) {
          // D8: Unstable dept and accumulated severity each add an extra random non-rebel target.
          let extra = rebelCount(s, d) >= 2 ? 1 : 0;
          if (local && p.severity > 0) { extra += p.severity; p.severity--; }
          const pool = shuffle(s.rng, d.employeeIds.filter((id) => !ts.includes(id) && E(s, id).loyalty !== 'Rebel'));
          ts.push(...pool.slice(0, extra));
        }
        for (const id of ts) evMove(s, E(s, id), fx.delta, fx.delta > 0 ? { actor: pid } : { actor: null, credit });
        break;
      }
      case 'influence': p.influence = Math.max(0, p.influence + fx.delta); break;
      case 'draw': draw(s, p, fx.count); break;
      case 'protectDept':
        d.protectedUntilRound = Math.max(d.protectedUntilRound, s.round + fx.rounds);
        log(s, `${d.name} is protected from negative events until round ${d.protectedUntilRound}.`, 'public', 'event');
        break;
      case 'severity': p.severity = Math.max(0, p.severity + fx.delta); break;
      case 'reveal': {
        const [t] = targets(s, d, fx.target, chosen);
        const first = t ? [E(s, t)] : [];
        const q = revealPrompt(s, pid, first) ?? revealPrompt(s, pid, d.employeeIds.map((id) => E(s, id)));
        if (q) s.interrupts!.push(q);
        break;
      }
      case 'investigate': investigate(s, pid, d); break;
      case 'honorPromise': {
        for (const id of targets(s, d, 'promised', null)) {
          const e = E(s, id);
          if (id !== chosen && protectedFrom(s, d)) continue;
          e.promise = null;
          s.turnSummary?.promisesResolved.push(id);
          evMove(s, e, id === chosen ? 1 : -1, id === chosen ? { actor: pid } : { actor: null, credit });
        }
        break;
      }
      case 'breakPromises': {
        if (protectedFrom(s, d)) break;
        const promised = targets(s, d, 'promised', null);
        for (const id of promised) { E(s, id).promise = null; s.turnSummary?.promisesResolved.push(id); }
        const hit = promised.length ? promised : targets(s, d, 'randomWithTrait', null, ['Ambitious', 'CreditHungry']);
        for (const id of hit) evMove(s, E(s, id), -1, { actor: null, credit });
        break;
      }
      case 'rebelPressure':
        if (protectedFrom(s, d)) break;
        if (d.teamLead !== null && rebelCount(s, d) === 2) { // §43: temporary +1 → crisis
          log(s, `Rebel pressure boils over in ${d.name}.`, 'public', 'event');
          crisis(s, d);
        }
        break;
      case 'makeRebel': {
        if (protectedFrom(s, d)) break;
        for (const id of targets(s, d, fx.target, chosen)) forceRebel(s, E(s, id), credit);
        break;
      }
      case 'actionBonus': p.actionBonus += fx.delta; break;
    }
    settle(s);
  }
}

/** D6: expose one active unexposed mole in d → accusation (§44); otherwise reveal a trait instead. */
function investigate(s: S, pid: PlayerId, d: Department) {
  const moled = d.employeeIds.map((id) => E(s, id)).filter((e) => e.mole && !e.mole.exposed);
  if (!moled.length) {
    const q = revealPrompt(s, pid, d.employeeIds.map((id) => E(s, id)));
    if (q) s.interrupts!.push(q);
    return;
  }
  const e = pick(s.rng, moled);
  const m = e.mole!;
  m.exposed = true;
  log(s, `Investigation: ${e.name} in ${d.name} is a mole!`, 'public', 'mole');
  summaryFor(s, m.creator)?.moleActivity.push(`Mole on ${e.name} exposed`);
  if (d.teamLead === null) {
    log(s, `${d.name} has no Team Lead to accuse anyone; the mole is dismissed.`, 'public', 'mole');
    e.mole = null;
  } else {
    s.interrupts!.push({ kind: 'accusation', player: d.teamLead, employeeId: e.id });
  }
}

/** §9 Internal Instability: random owned dept, two random non-Rebel employees drop one state. */
export function instability(s: S, p: Player) {
  const owned = deptsOf(s, p.id);
  if (!owned.length) return;
  const d = pick(s.rng, owned);
  log(s, `${p.name} cannot pay management cost: Internal Instability in ${d.name}.`, 'public', 'instability');
  const ts = summaryFor(s, p.id);
  if (ts) ts.managementPenalty = true;
  const hit = shuffle(s.rng, d.employeeIds.filter((id) => E(s, id).loyalty !== 'Rebel')).slice(0, 2);
  for (const id of hit) evMove(s, E(s, id), -1, { actor: null, credit: null });
  settle(s);
}

