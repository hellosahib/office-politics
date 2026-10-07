// Hand-written plausible GameView for the board dev harness and UI work. Not engine output.
import { DEPARTMENTS, MINI_DEPARTMENTS, EMPLOYEES, buildInfluenceDeck } from '../content';
import {
  DEFAULT_PLAYER_NAMES, LOYALTY_SCORE, MANAGEMENT_COST, PLAYER_COLORS, influenceMaxFor, rankFor,
  type DepartmentView, type EmployeeView, type GameView, type InfluenceCard, type LoyaltyState, type PlayerId, type PlayerView,
} from '../engine/types';

type Patch = Partial<Pick<EmployeeView, 'loyalty' | 'politicalOwner' | 'promise' | 'mole' | 'hiddenTrait1' | 'hiddenTrait1Public' | 'rebelInclination'>>;

// viewer = player 0 (Sahib)
const LEADS: Record<'full' | 'mini', Record<string, PlayerId | null>> = {
  full: { engineering: 0, sales: 0, product: 1, marketing: 1, finance: 2, people: null, operations: null },
  mini: { engineering: 0, product: 1, sales: 2, operations: null },
};

const PATCH: Record<string, Patch> = {
  // engineering (P0): solid
  'sahib-singh': { loyalty: 'Loyal', politicalOwner: 0, hiddenTrait1: 'CreditHungry', hiddenTrait1Public: true },
  'riya-shah': { loyalty: 'Favorable', politicalOwner: 0 },
  'kabir-anand': { loyalty: 'Favorable', politicalOwner: 0, promise: { byPlayer: 0, expiresRound: 5 } },
  'mehul-sethi': { loyalty: 'Skeptical', politicalOwner: null },
  // product (P1): one of our moles in there
  'neha-kapoor': { loyalty: 'Loyal', politicalOwner: 1 },
  'vikram-rao': { loyalty: 'Favorable', politicalOwner: 1 },
  'tanya-jain': {
    loyalty: 'Favorable', politicalOwner: 1,
    mole: { creator: 0, ability: 'SilentBlock', plantedRound: 2, expiresRound: 5, used: false, exposed: false, creatorRevealed: false, visibleBecause: 'creator' },
  },
  'yash-malhotra': { loyalty: 'Neutral', politicalOwner: null },
  // sales: unstable (2 rebels)
  'sameer-khanna': { loyalty: 'Rebel', politicalOwner: null, rebelInclination: 0 },
  'pooja-nair': { loyalty: 'Rebel', politicalOwner: null },
  'rohit-bedi': { loyalty: 'Favorable', politicalOwner: 0 },
  'simran-arora': { loyalty: 'Loyal', politicalOwner: 0 },
  // marketing (P1)
  'aisha-khan': { loyalty: 'Favorable', politicalOwner: 1 },
  'dev-oberoi': { loyalty: 'Favorable', politicalOwner: 1 },
  'nitin-jain': { loyalty: 'Neutral', politicalOwner: null },
  'isha-verma': { loyalty: 'Favorable', politicalOwner: 2 },
  // finance (P2)
  'kunal-gupta': { loyalty: 'Loyal', politicalOwner: 2 },
  'nandini-jain': { loyalty: 'Favorable', politicalOwner: 2 },
  'aditya-sen': { loyalty: 'Favorable', politicalOwner: 2 },
  'lavanya-iyer': { loyalty: 'Skeptical', politicalOwner: null },
  // operations (neutral, being contested)
  'manav-kapoor': { loyalty: 'Favorable', politicalOwner: 0 },
  'sakshi-chawla': { loyalty: 'Favorable', politicalOwner: 2 },
  'ananya-bose': { loyalty: 'Rebel', politicalOwner: null },
  // people (neutral)
  'karan-gill': { loyalty: 'Favorable', politicalOwner: 1 },
};

export function makeMockView(board: 'full' | 'mini'): GameView {
  const defs = board === 'mini' ? MINI_DEPARTMENTS : DEPARTMENTS;
  const deptIds = new Set(defs.map((d) => d.id));
  // mini: sales is led by P2 in this mock, so its loyal employees point to P2
  const owner = (p: Patch, deptId: string) =>
    board === 'mini' && deptId === 'sales' && p.politicalOwner === 0 ? 2 : p.politicalOwner ?? null;

  const employees: EmployeeView[] = EMPLOYEES.filter((e) => deptIds.has(e.deptId)).map((e) => {
    const p = PATCH[e.id] ?? {};
    const loyalty: LoyaltyState = p.loyalty ?? 'Neutral';
    return {
      id: e.id, deptId: e.deptId, name: e.name, role: e.role, visual: e.visual, permanentTrait: e.permanentTrait,
      hiddenTrait1: p.hiddenTrait1 ?? null, hiddenTrait1Public: p.hiddenTrait1Public ?? false,
      hiddenTrait2: null, hiddenTrait2Public: false,
      loyalty, loyaltyScore: LOYALTY_SCORE[loyalty], politicalOwner: owner(p, e.deptId),
      rebelInclination: p.rebelInclination ?? null, promise: p.promise ?? null, mole: p.mole ?? null,
    };
  });

  const departments: DepartmentView[] = defs.map((d) => {
    const emps = employees.filter((e) => e.deptId === d.id);
    const rebelCount = emps.filter((e) => e.loyalty === 'Rebel').length;
    return {
      ...d, employeeIds: emps.map((e) => e.id), teamLead: LEADS[board][d.id] ?? null, rebelCount,
      instability: (rebelCount >= 4 ? 3 : rebelCount === 3 ? 2 : rebelCount === 2 ? 1 : 0) as DepartmentView['instability'],
      protectedUntilRound: d.id === 'finance' ? 5 : 0,
    };
  });

  const deck = buildInfluenceDeck(board);
  const hand: InfluenceCard[] = [...new Map(deck.map((c) => [c.templateId, c])).values()].slice(0, 4);
  const playerCount = 3 as const;
  const players: PlayerView[] = [0, 1, 2].map((id) => {
    const controlled = departments.filter((d) => d.teamLead === id).map((d) => d.id);
    const rank = rankFor(controlled.length, playerCount);
    const inMine = employees.filter((e) => controlled.includes(e.deptId));
    const me = id === 0;
    return {
      id, name: DEFAULT_PLAYER_NAMES[id], isBot: !me, color: PLAYER_COLORS[id], rank,
      influence: me ? 3 : 0, influenceMax: influenceMaxFor(rank, playerCount),
      managementCost: MANAGEMENT_COST[controlled.length], controlledDepartments: controlled,
      hand: me ? hand : null, handCount: me ? hand.length : 0,
      reserve: me ? [] : null, reserveCount: id === 1 ? 1 : 0,
      agenda: null, eliminated: false,
      loyalists: employees.filter((e) => e.politicalOwner === id && e.loyalty === 'Loyal').length,
      favorable: employees.filter((e) => e.politicalOwner === id && e.loyalty === 'Favorable').length,
      rebels: inMine.filter((e) => e.loyalty === 'Rebel').length,
      activeMoles: me ? employees.filter((e) => e.mole?.creator === 0).length : null,
      intel: me ? [{ employeeId: 'neha-kapoor', trait: 'Ambitious', weight: 2 }] : null,
    };
  });

  return {
    viewer: 0,
    config: {
      playerCount, mode: 'Takeover', seed: 42, board,
      players: players.map((p) => ({ name: p.name, isBot: p.isBot })),
    },
    round: 3,
    maxRounds: board === 'mini' ? 6 : null,
    currentPlayer: 0,
    firstPlayer: 0,
    phase: 'play',
    pending: { kind: 'play', player: 0, focus: null },
    focus: null,
    departments,
    employees,
    players,
    activeEvent: null,
    log: [
      { round: 2, turn: 1, text: 'Tanya played Public Praise on Neha Kapoor — Strong Success (Favorable → Loyal).', visibility: 'public', tag: 'card' },
      { round: 2, turn: 2, text: 'Pooja Nair became a Rebel. Sales is now Unstable.', visibility: 'public', tag: 'rebel' },
      { round: 2, turn: 0, text: 'You planted a Mole on Tanya Jain (Silent Block).', visibility: 0, tag: 'mole' },
      { round: 3, turn: 0, text: 'Event: Missed Deadline in Engineering — you chose Protect Employee.', visibility: 'public', tag: 'event' },
      { round: 3, turn: 0, text: 'Sahib refreshed Influence to 4 and paid 1 management cost.', visibility: 'public' },
    ],
    turnSummary: null,
    winner: null,
    scores: null,
    actionCount: 12,
  };
}
