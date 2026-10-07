// ============================================================================
// OFFICE POLITICS — shared contract between engine, content, board, UI, net, bots.
// Everything here is plain JSON-serialisable data (no classes, no functions),
// so a GameState can be stored, diffed, replayed and sent over Firestore.
// Section numbers (§) refer to docs/SPEC.md.
// ============================================================================

// ---------------------------------------------------------------- Traits (§26)
export type TraitPole =
  | 'Ambitious' | 'Lazy'
  | 'Loyal' | 'Disloyal'
  | 'Gossip' | 'Private'
  | 'CreditHungry' | 'ByTheBook'
  | 'RiskTaking' | 'Cautious';

export type TraitDimension = 'Drive' | 'Loyalty' | 'Social' | 'Recognition' | 'Risk';

export const TRAIT_DIMENSIONS: Record<TraitDimension, readonly [TraitPole, TraitPole]> = {
  Drive: ['Ambitious', 'Lazy'],
  Loyalty: ['Loyal', 'Disloyal'],
  Social: ['Gossip', 'Private'],
  Recognition: ['CreditHungry', 'ByTheBook'],
  Risk: ['RiskTaking', 'Cautious'],
};

export const TRAIT_LABEL: Record<TraitPole, string> = {
  Ambitious: 'Ambitious', Lazy: 'Lazy',
  Loyal: 'Loyal', Disloyal: 'Disloyal',
  Gossip: 'Gossip', Private: 'Private',
  CreditHungry: 'Credit-hungry', ByTheBook: 'By-the-book',
  RiskTaking: 'Risk-taking', Cautious: 'Cautious',
};

export function dimensionOf(t: TraitPole): TraitDimension {
  for (const d of Object.keys(TRAIT_DIMENSIONS) as TraitDimension[]) {
    if (TRAIT_DIMENSIONS[d].includes(t)) return d;
  }
  throw new Error(`unknown trait ${t}`);
}

// ---------------------------------------------------------------- Loyalty (§10)
/** Ordered ladder, index 0 = Rebel … 4 = Loyal. Movement is ±1 index. */
export const LOYALTY_LADDER = ['Rebel', 'Skeptical', 'Neutral', 'Favorable', 'Loyal'] as const;
export type LoyaltyState = (typeof LOYALTY_LADDER)[number];
/** Display-only score (§10). Decision D3 in docs/DECISIONS.md. */
export const LOYALTY_SCORE: Record<LoyaltyState, number> = {
  Rebel: -4, Skeptical: -2, Neutral: 0, Favorable: 2, Loyal: 4,
};

// ---------------------------------------------------------------- Ids
export type PlayerId = number;      // 0..3
export type DeptId = string;        // e.g. 'engineering'
export type EmployeeId = string;    // e.g. 'arjun-mehta'
export type CardId = string;        // unique card INSTANCE id, e.g. 'public-praise#2'
export type EventId = string;       // event card instance id

export type Rank = 'TeamLead' | 'Manager' | 'AVP' | 'VP' | 'CEO';
export const RANK_LABEL: Record<Rank, string> = {
  TeamLead: 'Team Lead', Manager: 'Manager', AVP: 'AVP', VP: 'VP', CEO: 'CEO',
};

export type Focus = 'Manage' | 'Expand';
export type GameMode = 'Takeover' | 'Election';

// ---------------------------------------------------------------- Content definitions (static)
export interface EmployeeDef {
  id: EmployeeId;
  deptId: DeptId;
  name: string;
  role: string;
  permanentTrait: TraitPole;
  visual: string;
  /** Used by narrative log lines (D40). Defaults to 'they'. */
  pronoun?: 'she' | 'he' | 'they';
}

export interface DepartmentDef {
  id: DeptId;
  name: string;
  /** Adjacent department ids (§3). Central dept is adjacent to all six. */
  adjacency: DeptId[];
  /** Position hint for the board: 'center' or 0..5 clockwise from top. */
  slot: 'center' | 0 | 1 | 2 | 3 | 4 | 5;
}

// ---------------------------------------------------------------- Influence cards (§30–§40)
export type CardMode = 'Internal' | 'External' | 'Both';
export type CardDirection = 'positive' | 'negative' | 'mole';
export type CardCategory = 'Social' | 'Recognition' | 'Support' | 'Authority' | 'Pressure' | 'Mole';
export type MoleAbility = 'SilentBlock' | 'RebelPressure';

/**
 * Triggered on Strong Success (score 4+). Engine implements exactly these:
 *  none      – nothing
 *  ripple    – one other random employee in the same department moves 1 state in the same direction
 *  refund    – acting player regains 1 Influence
 *  reveal    – acting player privately learns one unrevealed hidden trait of the target (free)
 *  promise   – creates a Promotion Promise flag on the target (expires in 3 rounds) — §52
 *  draw      – acting player draws 1 extra card into hand
 *  extraStep – target moves one additional state in the same direction (the only >1 move)
 */
export type SecondaryEffect = 'none' | 'ripple' | 'refund' | 'reveal' | 'promise' | 'draw' | 'extraStep';

/**
 * Triggered on Failure (score 0–1). Engine implements exactly these:
 *  none          – nothing
 *  reverse       – target moves 1 state in the OPPOSITE direction
 *  ripple        – one other random employee in the same department moves 1 state against the actor
 *  loseInfluence – acting player loses 1 additional Influence (if any)
 *  exposeSelf    – a public log line names the actor's failed attempt (already public) AND the
 *                  target's permanent trait reaction; cosmetic, no state change
 */
export type Backfire = 'none' | 'reverse' | 'ripple' | 'loseInfluence' | 'exposeSelf';

export interface InfluenceCard {
  id: CardId;              // instance id
  templateId: string;      // e.g. 'public-praise'
  name: string;
  cost: number;
  direction: CardDirection;
  mode: CardMode;
  category: CardCategory;
  baseEffect: number;      // usually 1
  primary: TraitPole | null;   // +weight
  secondary: TraitPole | null; // +weight
  adverse: TraitPole | null;   // -weight
  secondaryEffect: SecondaryEffect;
  backfire: Backfire;
  moleAbility?: MoleAbility;   // only when direction === 'mole'
  text: string;                // flavour / explanation shown on the card
}

// ---------------------------------------------------------------- Event cards (§45–§52)
export type EventType = 'Global' | 'Local' | 'Reveal';

/**
 * Who an effect applies to, always resolved within the event's department
 * (Local: the randomly selected owned dept; Global: each player's randomly
 * selected owned dept, or the dept chosen via `chooseDept`).
 *  chosen         – the employee the player picked (option.chooseEmployee must be true)
 *  random         – one random employee in the dept
 *  randomOther    – one random employee in the dept other than `chosen`
 *  randomWithTrait– one random employee in the dept having any of `traits` (any weight, revealed
 *                   or not); falls back to `random` if none
 *  promised       – every employee in the dept with an active Promotion Promise
 *  all            – every employee in the dept
 *  twoRandom      – two distinct random employees in the dept
 *  randomRebel    – one random Rebel in the dept (no-op if none)
 */
export type EffectTarget =
  | 'chosen' | 'random' | 'randomOther' | 'randomWithTrait'
  | 'promised' | 'all' | 'twoRandom' | 'randomRebel';

export type EventEffect =
  /** Move target(s) ±1 loyalty state. Negative deltas are "negative event effects"
   *  (blocked by protectDept, worsened by Unstable depts — see D8). */
  | { kind: 'loyalty'; target: EffectTarget; delta: 1 | -1; traits?: TraitPole[] }
  /** Acting player gains/loses Influence now (clamped at 0). */
  | { kind: 'influence'; delta: number }
  /** Acting player draws N extra cards into hand. */
  | { kind: 'draw'; count: number }
  /** The event dept cannot receive negative event effects for N rounds. */
  | { kind: 'protectDept'; rounds: number }
  /** Acting player's future Local events get +delta severity (extra random -1 target). Decays by 1 each time it is applied. */
  | { kind: 'severity'; delta: number }
  /** Acting player learns an unrevealed hidden trait of target (goes through revealChoice: public/private). */
  | { kind: 'reveal'; target: EffectTarget }
  /** Investigation: if the dept contains an active unexposed Mole, expose it → accusation flow (§44). */
  | { kind: 'investigate' }
  /** Promotion Season honour: `chosen` promised employee +1 and promise cleared; all other promised in dept -1. */
  | { kind: 'honorPromise' }
  /** All promised employees in dept -1 and promises cleared. If none promised: one random Ambitious/CreditHungry employee -1. */
  | { kind: 'breakPromises' }
  /** Temporary +1 rebel pressure crisis check on the dept (§43 semantics, no permanent rebel). */
  | { kind: 'rebelPressure' }
  /** Target employee becomes Rebel outright (event-created rebel, §14A). */
  | { kind: 'makeRebel'; target: EffectTarget }
  /** Acting player's next Influence card this turn gets +delta to its Action Score (event modifier §35). */
  | { kind: 'actionBonus'; delta: number };

export interface EventOption {
  id: 'A' | 'B';
  label: string;          // short button text
  text: string;           // consequence description shown to the player
  effects: EventEffect[];
  /** UI must prompt the player to choose an employee in the event dept before resolving. */
  chooseEmployee?: boolean;
  /** Global only: player chooses one of their own departments as the event dept. */
  chooseDept?: boolean;
  /** Global 'majority' only: applied to players who voted for the LOSING option, in addition to nothing else. */
  minorityEffects?: EventEffect[];
}

export interface EventCard {
  id: EventId;            // instance id e.g. 'promotion-season#1'
  templateId: string;
  type: EventType;
  title: string;
  situation: string;
  /** Global/Local: exactly 2 options. Reveal: []. */
  options: EventOption[];
  /**
   * Global only.
   *  majority   – every player votes; winning option's `effects` apply to every player
   *               (each on their own random owned dept); losers additionally get the
   *               winning option's `minorityEffects`. Tie → active player's vote wins (D9).
   *  individual – each player's own choice applies to them.
   */
  resolution?: 'majority' | 'individual';
}

// ---------------------------------------------------------------- Agendas (§25)
export type AgendaId =
  | 'EmpireBuilder' | 'Stabilizer' | 'PuppetMaster' | 'Opportunist' | 'Saboteur'
  | 'PeopleManager' | 'Survivor' | 'Climber' | 'InformationBroker' | 'CorporateFixer';

export interface Agenda {
  id: AgendaId;
  name: string;
  objective: string;
}

// ---------------------------------------------------------------- Runtime state
export interface Mole {
  creator: PlayerId;
  ability: MoleAbility;
  plantedRound: number;
  /** Mole is active while round < expiresRound (planted R → expires start of R+3). */
  expiresRound: number;
  used: boolean;
  /** Set by an Investigation; triggers the accusation flow. */
  exposed: boolean;
  /** Creator publicly known (correct accusation). */
  creatorRevealed: boolean;
}

export interface Employee extends EmployeeDef {
  hiddenTrait1: TraitPole;          // weight +2
  hiddenTrait1Revealed: boolean;    // publicly
  hiddenTrait2: TraitPole;          // weight 0
  hiddenTrait2Revealed: boolean;    // publicly
  loyalty: LoyaltyState;
  /** Player this employee's positive loyalty points to. Counts for ownership only when Favorable/Loyal. */
  politicalOwner: PlayerId | null;
  /** Hidden; set when becoming Rebel (§14). */
  rebelInclination: PlayerId | null;
  /** Hostile influence spent per player since the employee was last at Neutral-or-above (§14B). */
  hostileContributions: Record<string, number>;
  promise: { byPlayer: PlayerId; expiresRound: number } | null;
  mole: Mole | null;
}

export interface Department extends DepartmentDef {
  employeeIds: EmployeeId[];
  teamLead: PlayerId | null;
  /** Negative event effects are blocked while round < protectedUntilRound. */
  protectedUntilRound: number;
}

export interface PlayerStats {
  rebelsCreated: number;
  capturedNeutral: boolean;
  lostStartingDept: boolean;
  startingDept: DeptId;
  negativeEventsResolved: number;   // resolved a Local/Global event with a negative effect without instability that turn
  privateReveals: number;
  molesPlanted: number;
  maxActiveMoles: number;
  reachedVPRound: number | null;
  influenceSpent: number;
  cardsPlayed: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  isBot: boolean;
  color: string;           // hex, used by board + UI
  rank: Rank;
  promotionPoints: number;
  influence: number;
  hand: InfluenceCard[];
  reserve: InfluenceCard[];     // max 3
  agenda: AgendaId | null;
  eliminated: boolean;
  /** Private intel: traits learned via Private Reveal or card 'reveal' effect. */
  intel: { employeeId: EmployeeId; trait: TraitPole; weight: number }[];
  /** Employees targeted by this player during the current turn (§13). */
  targetedThisTurn: EmployeeId[];
  /** Future Local-event worsening (Company Audit "Protect My Team"). */
  severity: number;
  /** Event modifier added to the next card this turn (consumed on use). */
  actionBonus: number;
  stats: PlayerStats;
  /** Influence gained/lost while it is not this player's turn; added at their next refresh (D25, D39). */
  influenceBank?: number;
}

export type Phase =
  | 'event'        // resolving the turn's event (vote / choice / target / reveal)
  | 'play'         // influence refreshed, management paid, cards drawn; negotiation + playing (no focus, D37)
  | 'save'         // choose cards to keep
  | 'summary'      // end-turn summary, waiting for confirm
  | 'accusation'   // a mole was exposed; team lead must accuse
  | 'gameOver';

export interface LogEntry {
  round: number;
  turn: PlayerId;
  text: string;
  /** 'public' or the only player allowed to see it. */
  visibility: 'public' | PlayerId;
  /** Optional structured tag for the UI (e.g. 'capture', 'rebel', 'mole', 'event'). */
  tag?: string;
}

/** What the engine is waiting for. Exactly one pending at a time. */
export type Pending =
  /** A Global/Local event wants an option from `player` (Global: each non-eliminated player in turn order votes; votes are secret until all are in). */
  | { kind: 'eventChoice'; player: PlayerId; eventId: EventId; deptId: DeptId | null }
  /** Option needs an employee/department choice from `player`. */
  | { kind: 'eventTarget'; player: PlayerId; eventId: EventId; optionId: 'A' | 'B'; choose: 'employee' | 'dept'; candidates: string[] }
  /** Player learned a hidden trait; decide public (0) or private (1 Influence). */
  | { kind: 'revealChoice'; player: PlayerId; employeeId: EmployeeId; trait: TraitPole; weight: number }
  /** Player plays cards (legal targets come from each card's mode, D37); `focus` is always null. Also where giveCard happens. */
  | { kind: 'play'; player: PlayerId; focus: Focus | null }
  /** Choose which hand cards to save (1 Influence each, max 3 in reserve). */
  | { kind: 'save'; player: PlayerId }
  /** Confirm end of turn. */
  | { kind: 'summary'; player: PlayerId }
  /** Team lead of the dept must accuse someone of planting the exposed mole. */
  | { kind: 'accusation'; player: PlayerId; employeeId: EmployeeId }
  | { kind: 'gameOver' };

export type Action =
  | { type: 'eventChoice'; player: PlayerId; optionId: 'A' | 'B' }
  | { type: 'eventTarget'; player: PlayerId; targetId: string }
  | { type: 'revealChoice'; player: PlayerId; mode: 'public' | 'private' }
  | { type: 'focus'; player: PlayerId; focus: Focus }
  | { type: 'playCard'; player: PlayerId; cardId: CardId; targetId: EmployeeId }
  | { type: 'donePlaying'; player: PlayerId }
  | { type: 'save'; player: PlayerId; cardIds: CardId[] }
  /** Give one RESERVE card to another player (their reserve must have room). Allowed in 'play'. */
  | { type: 'giveCard'; player: PlayerId; cardId: CardId; toPlayer: PlayerId }
  | { type: 'endTurn'; player: PlayerId }
  | { type: 'accuse'; player: PlayerId; accused: PlayerId }
  /** Publicly expose a privately known trait from intel (free). Allowed in 'play'. */
  | { type: 'exposeIntel'; player: PlayerId; employeeId: EmployeeId; trait: TraitPole };

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface TurnSummary {
  player: PlayerId;
  influenceSpent: number;
  cardsPlayed: string[];
  cardsSaved: string[];
  employeesChanged: { employeeId: EmployeeId; from: LoyaltyState; to: LoyaltyState }[];
  newRebels: EmployeeId[];
  departmentsCaptured: DeptId[];
  departmentsLost: DeptId[];
  managementPenalty: boolean;
  promisesCreated: EmployeeId[];
  promisesResolved: EmployeeId[];
  moleActivity: string[];      // private to the player (their own moles)
  promotion: Rank | null;
}

export interface ActiveEvent {
  card: EventCard;
  /** Local: the selected dept. Global: null (per-player dept chosen at resolution). */
  deptId: DeptId | null;
  /** Global votes so far. Revealed to everyone once all votes are in. */
  votes: Record<string, 'A' | 'B'>;
  /** Pending per-player target choices for Global events. */
  targets: Record<string, string>;
  /** Players still to act (Global). */
  remaining: PlayerId[];
  /** Winning option after majority resolution. */
  outcome: 'A' | 'B' | null;
  /** Engine bookkeeping: players whose option effects are still to be applied (after voting). */
  queue?: PlayerId[];
  /** Departments this event touches. Local: the one dept. Global: every player's resolved dept (filled as they resolve). */
  affectedDeptIds: DeptId[];
  /** Engine bookkeeping: per-player results recorded while effects apply (becomes EventResult.perPlayer). */
  results?: EventPlayerResult[];
}

/** One recorded consequence of an event for one player (D41). Private details (trait values) stay out. */
export type EventChange =
  | { kind: 'loyalty'; employeeId: EmployeeId; from: LoyaltyState; to: LoyaltyState }
  | { kind: 'influence'; delta: number }
  | { kind: 'protected'; deptId: DeptId; untilRound: number }
  | { kind: 'severity'; delta: number }
  /** trait/weight: stored always; in views only when `public` or the viewer is `by`. `public` is settled by the revealChoice. */
  | { kind: 'reveal'; employeeId: EmployeeId; by: PlayerId; public: boolean; trait?: TraitPole; weight?: number }
  | { kind: 'investigate'; found: boolean }
  | { kind: 'promise'; employeeId: EmployeeId; honored: boolean }
  | { kind: 'rebel'; employeeId: EmployeeId }
  | { kind: 'text'; text: string };

export interface EventPlayerResult {
  player: PlayerId;
  deptId: DeptId | null;
  /** Majority Global: voted for the losing option (minority effects applied). */
  minority: boolean;
  /** Empty = nothing happened to this player. */
  changes: EventChange[];
}

/** Structured outcome of the last fully resolved event (D41), for the UI's "what happened" modal. */
export interface EventResult {
  eventId: EventId;
  templateId: string;
  title: string;
  type: EventType;
  situation: string;
  votes: { player: PlayerId; optionId: 'A' | 'B'; optionLabel: string }[];
  /** Majority Global: the winning option. Local: the chosen option. Individual Global / Reveal: null. */
  outcome: { optionId: 'A' | 'B'; label: string; text: string } | null;
  perPlayer: EventPlayerResult[];
  /** state.actionCount when it resolved. */
  actionCount: number;
}

/** Current turn bookkeeping for UI animation (deal / event card). */
export interface TurnInfo {
  /** 1-based count of turns started this game. */
  number: number;
  /** Cards dealt to the active player in this turn's draw phase (views: only the active player sees ids). */
  drawnThisTurn: CardId[];
  /** Event card drawn at the start of this turn, if any. */
  eventCardId: EventId | null;
}

/** Last resolved influence card, for the UI's centre banner (D40). */
export interface CardResult {
  actor: PlayerId;
  cardName: string;
  employeeId: EmployeeId;
  deptId: DeptId;
  band: 'Failure' | 'Standard Success' | 'Strong Success' | 'Blocked';
  from: LoyaltyState;
  to: LoyaltyState;
  reaction: string;
  /** Only in the actor's view. */
  explanation?: Explanation;
  /** state.actionCount when it resolved (lets the UI detect a new result). */
  actionCount: number;
}

export interface GameConfig {
  playerCount: 3 | 4;
  mode: GameMode;
  /** Election only. */
  rounds?: 8 | 10 | 12 | 15;
  seed: number;
  players: { name: string; isBot: boolean }[];
  /** 'full' = 7 depts/28 employees. 'mini' = §82 prototype (4 depts, 16 employees, 3 players, 6 rounds, no agendas, no CEO). */
  board: 'full' | 'mini';
}

export interface GameState {
  config: GameConfig;
  rng: { state: number };
  round: number;
  /** Index into turnOrder. */
  currentPlayer: PlayerId;
  firstPlayer: PlayerId;
  phase: Phase;
  pending: Pending;
  focus: Focus | null;
  departments: Department[];
  employees: Employee[];
  players: Player[];
  influenceDeck: InfluenceCard[];
  influenceDiscard: InfluenceCard[];
  eventDeck: EventCard[];
  eventDiscard: EventCard[];
  activeEvent: ActiveEvent | null;
  log: LogEntry[];
  /** Summary of the turn in progress / just finished. */
  turnSummary: TurnSummary | null;
  winner: PlayerId | null;
  /** Election scoring table once game is over. */
  scores: Record<string, ScoreBreakdown> | null;
  /** Monotonic count of successfully applied actions (used by net layer). */
  actionCount: number;
  /** Engine bookkeeping: prompts (reveal choices, accusations) raised while an event resolves,
   *  handled one at a time before the turn continues. */
  interrupts?: Pending[];
  /** See TurnInfo. Optional so pre-D39 saved states still load. */
  turn?: TurnInfo;
  /** See CardResult; stored as the actor sees it. Others see a Blocked play as Failure with `publicReaction` (D30). */
  lastCardResult?: CardResult & { publicReaction: string };
  /** Kept until the next event resolves (D41). */
  lastEventResult?: EventResult;
}

export interface ScoreBreakdown {
  departments: number;
  loyalists: number;
  favorable: number;
  rebels: number;
  molesPlanted: number;
  agenda: number;
  agendaCompleted: boolean;
  total: number;
}

// ---------------------------------------------------------------- Views (filtered per player)
export interface EmployeeView {
  id: EmployeeId;
  deptId: DeptId;
  name: string;
  role: string;
  visual: string;
  permanentTrait: TraitPole;
  /** null when unknown to viewer. weight 2 */
  hiddenTrait1: TraitPole | null;
  hiddenTrait1Public: boolean;
  /** null when unknown to viewer. weight 0 */
  hiddenTrait2: TraitPole | null;
  hiddenTrait2Public: boolean;
  loyalty: LoyaltyState;
  loyaltyScore: number;
  politicalOwner: PlayerId | null;
  /** Only shown to the inclined player; null otherwise. */
  rebelInclination: PlayerId | null;
  promise: { byPlayer: PlayerId; expiresRound: number } | null;
  /** Only to the creator, or to everyone once exposed. */
  mole: (Mole & { visibleBecause: 'creator' | 'exposed' }) | null;
}

export interface DepartmentView extends DepartmentDef {
  employeeIds: EmployeeId[];
  teamLead: PlayerId | null;
  rebelCount: number;
  /** 0 normal, 1 unstable (2 rebels), 2 crisis (3), 3 full rebellion (4). */
  instability: 0 | 1 | 2 | 3;
  protectedUntilRound: number;
  /** Team lead's player name, or null for a Neutral department. */
  leadName: string | null;
}

export interface PlayerView {
  id: PlayerId;
  name: string;
  isBot: boolean;
  color: string;
  rank: Rank;
  influence: number;
  influenceMax: number;
  managementCost: number;
  controlledDepartments: DeptId[];
  /** Full cards only for the viewer; others get counts. */
  hand: InfluenceCard[] | null;
  handCount: number;
  reserve: InfluenceCard[] | null;
  reserveCount: number;
  agenda: Agenda | null;      // viewer only (or everyone at game over)
  eliminated: boolean;
  loyalists: number;
  favorable: number;
  rebels: number;             // rebels inside their departments
  activeMoles: number | null; // viewer only
  /** Viewer only, most recent first. */
  intel: { employeeId: EmployeeId; deptId: DeptId; trait: TraitPole; weight: number }[] | null;
}

export interface GameView {
  viewer: PlayerId | null;
  config: GameConfig;
  round: number;
  maxRounds: number | null;
  currentPlayer: PlayerId;
  firstPlayer: PlayerId;
  phase: Phase;
  pending: Pending;
  focus: Focus | null;
  departments: DepartmentView[];
  employees: EmployeeView[];
  players: PlayerView[];
  activeEvent: (ActiveEvent & { votesVisible: boolean }) | null;
  /** Public entries plus the viewer's private ones. */
  log: LogEntry[];
  turnSummary: TurnSummary | null;
  winner: PlayerId | null;
  scores: Record<string, ScoreBreakdown> | null;
  actionCount: number;
  turn: TurnInfo;
  /** Last resolved influence card (D40); `explanation` only for the actor. */
  lastCardResult?: CardResult;
  /** Last fully resolved event (D41). */
  lastEventResult?: EventResult;
}

/** Pre-play forecast for the hand UI (§60). */
export interface Prediction {
  requiredSpend: number;
  base: number;
  rankBonus: number;
  eventBonus: number;
  /** Known trait contributions (label + value). */
  traitMods: { trait: TraitPole; value: number }[];
  unknownTraitMayAffect: boolean;
  /** Known range excluding unknown traits: [min, max] including random -1/+1. */
  min: number;
  max: number;
  legal: boolean;
  reason?: string;
}

/** Explanation attached to a resolved card (§89). Stored in the log text and returned to UI. */
export interface Explanation {
  cardName: string;
  targetName: string;
  lines: { label: string; value: number }[];
  hiddenTraitAffected: boolean;
  score: number;
  band: 'Failure' | 'Standard Success' | 'Strong Success' | 'Blocked';
  from: LoyaltyState;
  to: LoyaltyState;
}

// ---------------------------------------------------------------- Rules tables
export const MANAGEMENT_COST = [0, 0, 1, 2, 3, 4, 5, 6]; // index = departments controlled

export const INFLUENCE_BY_RANK: Record<Rank, number> = { TeamLead: 4, Manager: 5, AVP: 6, VP: 7, CEO: 7 };
export const RANK_BONUS: Record<Rank, number> = { TeamLead: 0, Manager: 1, AVP: 2, VP: 3, CEO: 3 };

/** §21 rank by controlled departments. */
export function rankFor(depts: number, playerCount: 3 | 4): Rank {
  if (playerCount === 3) {
    if (depts >= 5) return 'CEO';
    if (depts >= 3) return 'VP';
    if (depts === 2) return 'Manager';
    return 'TeamLead';
  }
  if (depts >= 6) return 'CEO';
  if (depts >= 4) return 'VP';
  if (depts === 3) return 'AVP';
  if (depts === 2) return 'Manager';
  return 'TeamLead';
}

/** Influence max for rank; in 3-player games VP = 6 (AVP skipped, §7). */
export function influenceMaxFor(rank: Rank, playerCount: 3 | 4): number {
  if (playerCount === 3 && rank === 'VP') return 6;
  return INFLUENCE_BY_RANK[rank];
}

export function ceoThreshold(playerCount: 3 | 4): number {
  return playerCount + 2;
}

export const ELECTION_POINTS = {
  department: 10, loyal: 2, favorable: 1, rebel: -2, molePlanted: 3, agenda: 8,
} as const;

export const DEFAULT_PLAYER_NAMES = ['Sahib', 'Tanya', 'Nandini', 'Player 4'];
export const PLAYER_COLORS = ['#2f80ed', '#eb5757', '#27ae60', '#f2c94c'];
export const MAX_RESERVE = 3;
export const HAND_SIZE = 4;
export const MOLE_ROUNDS = 2;
export const PROMISE_ROUNDS = 3;
