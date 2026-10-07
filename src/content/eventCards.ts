// Event deck (§45–§52; D6, D8, D14, D21). Full 56 = Global 24 (8×3), Local 24 (8×3), Reveal 8.
// Mini 18 = Global 8, Local 7, Reveal 3 (§82).
// Majority Globals: `minorityEffects` on option X hit the players who voted against X when X wins.
import type { EventCard } from '../engine/types';

type Template = Omit<EventCard, 'id'> & { copies: number; miniCopies: number };

export const EVENT_TEMPLATES: Template[] = [
  // ================================================================ Global
  {
    templateId: 'promotion-season', type: 'Global', resolution: 'individual', title: 'Promotion Season',
    situation: 'Calibration is done and the promotion list is due on Friday. Everyone remembers what they were told.',
    options: [
      { id: 'A', label: 'Honor Commitments', chooseEmployee: true, text: 'Pick a promised employee: they gain 1 state and the promise is fulfilled. Every other promised employee in that department loses 1 state.', effects: [{ kind: 'honorPromise' }] },
      { id: 'B', label: 'Open Competition', chooseEmployee: true, text: 'Pick anyone: they gain 1 state. All promises in that department are broken (each promised employee loses 1 state; if none, a random Ambitious or Credit-hungry employee loses 1).', effects: [{ kind: 'breakPromises' }, { kind: 'loyalty', target: 'chosen', delta: 1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'budget-freeze', type: 'Global', resolution: 'individual', title: 'Budget Freeze',
    situation: 'Finance has frozen all discretionary spend until next quarter. Somebody\'s team is going to feel it.',
    options: [
      { id: 'A', label: 'Protect', chooseDept: true, text: 'Choose one of your departments: it cannot receive negative event effects for 1 round.', effects: [{ kind: 'protectDept', rounds: 1 }] },
      { id: 'B', label: 'Cut', chooseDept: true, text: 'Choose one of your departments to absorb the cut: a random employee there loses 1 state, and you gain 2 Influence from the savings.', effects: [{ kind: 'loyalty', target: 'random', delta: -1 }, { kind: 'influence', delta: 2 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'ceo-town-hall', type: 'Global', resolution: 'majority', title: 'CEO Town Hall',
    situation: 'The CEO unveils a bold new strategy and asks the leadership team for a show of hands.',
    options: [
      { id: 'A', label: 'Support the CEO', text: 'If this wins: everyone gains 1 Influence. Players who voted Challenge get +1 on their next card this turn, but a random employee of theirs loses 1 state.', effects: [{ kind: 'influence', delta: 1 }], minorityEffects: [{ kind: 'actionBonus', delta: 1 }, { kind: 'loyalty', target: 'random', delta: -1 }] },
      { id: 'B', label: 'Challenge the Strategy', text: 'If this wins: in each player\'s department a random Risk-taking or Ambitious employee gains 1 state and a random Cautious or Loyal employee loses 1. Players who voted Support gain 1 Influence, but a random employee of theirs loses 1 state.', effects: [{ kind: 'loyalty', target: 'randomWithTrait', traits: ['RiskTaking', 'Ambitious'], delta: 1 }, { kind: 'loyalty', target: 'randomWithTrait', traits: ['Cautious', 'Loyal'], delta: -1 }], minorityEffects: [{ kind: 'influence', delta: 1 }, { kind: 'loyalty', target: 'random', delta: -1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'company-audit', type: 'Global', resolution: 'majority', title: 'Company Audit',
    situation: 'External auditors arrive Monday. They will see whatever you let them see.',
    options: [
      { id: 'A', label: 'Full Transparency', text: 'If this wins: every player\'s department is investigated (an active mole is exposed; if none, you learn a hidden trait). Players who voted Protect still shield that department for 1 round, but their future Local events get +1 severity.', effects: [{ kind: 'investigate' }], minorityEffects: [{ kind: 'protectDept', rounds: 1 }, { kind: 'severity', delta: 1 }] },
      { id: 'B', label: 'Protect My Team', text: 'If this wins: every player\'s department is protected for 1 round, but everyone\'s future Local events get +1 severity. Players who voted Transparency still investigate their own department, at a cost of 1 Influence.', effects: [{ kind: 'severity', delta: 1 }, { kind: 'protectDept', rounds: 1 }], minorityEffects: [{ kind: 'investigate' }, { kind: 'influence', delta: -1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'cross-department-project', type: 'Global', resolution: 'majority', title: 'Cross-Department Project',
    situation: 'Leadership wants one flagship project delivered by every team together. Or by whoever grabs it first.',
    options: [
      { id: 'A', label: 'Collaborate', text: 'If this wins: every player\'s department is protected for 1 round. Players who voted Compete also get a random employee +1 state, so rivals benefit too.', effects: [{ kind: 'protectDept', rounds: 1 }], minorityEffects: [{ kind: 'loyalty', target: 'random', delta: 1 }] },
      { id: 'B', label: 'Compete', text: 'If this wins: everyone gains 2 Influence, but a random employee in each player\'s department loses 1 state. Players who voted Collaborate draw 1 extra card but face a Rebel Pressure check.', effects: [{ kind: 'influence', delta: 2 }, { kind: 'loyalty', target: 'random', delta: -1 }], minorityEffects: [{ kind: 'draw', count: 1 }, { kind: 'rebelPressure' }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'layoff-rumours', type: 'Global', resolution: 'individual', title: 'Layoff Rumours',
    situation: 'A spreadsheet titled "headcount_v7_FINAL" was left on the shared printer.',
    options: [
      { id: 'A', label: 'Reassure the Team', chooseDept: true, text: 'Choose one of your departments: pay 1 Influence and a random employee there gains 1 state.', effects: [{ kind: 'influence', delta: -1 }, { kind: 'loyalty', target: 'random', delta: 1 }] },
      { id: 'B', label: 'Let Fear Work', text: 'Gain 1 Influence and draw 1 card, but a random Cautious or Lazy employee in your department loses 1 state.', effects: [{ kind: 'influence', delta: 1 }, { kind: 'draw', count: 1 }, { kind: 'loyalty', target: 'randomWithTrait', traits: ['Cautious', 'Lazy'], delta: -1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'all-hands-offsite', type: 'Global', resolution: 'majority', title: 'All-Hands Offsite',
    situation: 'Two days at a resort with trust falls and an open bar. Attendance is "strongly encouraged".',
    options: [
      { id: 'A', label: 'Go to the Offsite', text: 'If this wins: everyone pays 1 Influence and learns a hidden trait of a random employee in their department. Players who voted Cancel draw 1 card, but a random employee of theirs loses 1 state.', effects: [{ kind: 'influence', delta: -1 }, { kind: 'reveal', target: 'random' }], minorityEffects: [{ kind: 'draw', count: 1 }, { kind: 'loyalty', target: 'random', delta: -1 }] },
      { id: 'B', label: 'Cancel It', text: 'If this wins: everyone gains 1 Influence, but a random Gossip or Lazy employee in each department loses 1 state. Players who voted Go get +1 on their next card this turn, but a random employee of theirs loses 1 state.', effects: [{ kind: 'influence', delta: 1 }, { kind: 'loyalty', target: 'randomWithTrait', traits: ['Gossip', 'Lazy'], delta: -1 }], minorityEffects: [{ kind: 'actionBonus', delta: 1 }, { kind: 'loyalty', target: 'random', delta: -1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'new-ceo-mandate', type: 'Global', resolution: 'individual', title: 'New CEO Mandate',
    situation: 'A memo arrives: all teams will adopt the new process by end of month. No exceptions.',
    options: [
      { id: 'A', label: 'Fall in Line', text: 'Your next card this turn gets +1, but a random Risk-taking or Ambitious employee in your department loses 1 state.', effects: [{ kind: 'actionBonus', delta: 1 }, { kind: 'loyalty', target: 'randomWithTrait', traits: ['RiskTaking', 'Ambitious'], delta: -1 }] },
      { id: 'B', label: 'Push Back', text: 'A random Risk-taking or Disloyal employee in your department gains 1 state, but your future Local events get +1 severity.', effects: [{ kind: 'loyalty', target: 'randomWithTrait', traits: ['RiskTaking', 'Disloyal'], delta: 1 }, { kind: 'severity', delta: 1 }] },
    ],
    copies: 3, miniCopies: 1,
  },

  // ================================================================ Local
  {
    templateId: 'missed-deadline', type: 'Local', title: 'Missed Deadline',
    situation: 'A key deliverable slipped and the client noticed. Someone has to answer for it.',
    options: [
      { id: 'A', label: 'Protect Employee', chooseEmployee: true, text: 'The chosen employee is spared, but another random teammate takes the fall and loses 1 state.', effects: [{ kind: 'loyalty', target: 'randomOther', delta: -1 }] },
      { id: 'B', label: 'Blame Employee', chooseEmployee: true, text: 'The chosen employee loses 1 state.', effects: [{ kind: 'loyalty', target: 'chosen', delta: -1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'promotion-promise-review', type: 'Local', title: 'Promotion Promise Review',
    situation: 'HR is reviewing every verbal promise made this year. They want names.',
    options: [
      { id: 'A', label: 'Honour a Promise', chooseEmployee: true, text: 'Pick a promised employee: they gain 1 state and the promise is fulfilled. Every other promised employee here loses 1 state.', effects: [{ kind: 'honorPromise' }] },
      { id: 'B', label: 'Ignore Them', text: 'Gain 1 Influence. All promises here are broken: each promised employee loses 1 state (if none, a random Ambitious or Credit-hungry employee loses 1).', effects: [{ kind: 'breakPromises' }, { kind: 'influence', delta: 1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'client-complaint', type: 'Local', title: 'Client Complaint',
    situation: 'A major client has escalated to your boss, naming your team by name.',
    options: [
      { id: 'A', label: 'Back Your Team', chooseEmployee: true, text: 'The chosen employee gains 1 state, but your future Local events get +1 severity.', effects: [{ kind: 'loyalty', target: 'chosen', delta: 1 }, { kind: 'severity', delta: 1 }] },
      { id: 'B', label: 'Sacrifice One Employee', chooseEmployee: true, text: 'The chosen employee loses 1 state, then this department is protected from negative events for 1 round.', effects: [{ kind: 'loyalty', target: 'chosen', delta: -1 }, { kind: 'protectDept', rounds: 1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'surprise-resignation', type: 'Local', title: 'Surprise Resignation',
    situation: 'Your most reliable contractor just quit by email. Their work does not stop.',
    options: [
      { id: 'A', label: 'Redistribute the Work', text: 'Two random employees lose 1 state each; you gain 1 Influence from the saved budget.', effects: [{ kind: 'loyalty', target: 'twoRandom', delta: -1 }, { kind: 'influence', delta: 1 }] },
      { id: 'B', label: 'Promote Someone', chooseEmployee: true, text: 'The chosen employee gains 1 state; another random teammate resents it and loses 1 state.', effects: [{ kind: 'loyalty', target: 'chosen', delta: 1 }, { kind: 'loyalty', target: 'randomOther', delta: -1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'credit-dispute', type: 'Local', title: 'Credit Dispute',
    situation: 'Two people both claim they built the feature the CEO just praised.',
    options: [
      { id: 'A', label: 'Pick a Side', chooseEmployee: true, text: 'The chosen employee gains 1 state; another random teammate loses 1 state.', effects: [{ kind: 'loyalty', target: 'chosen', delta: 1 }, { kind: 'loyalty', target: 'randomOther', delta: -1 }] },
      { id: 'B', label: 'Split the Credit', text: 'Your next card this turn gets +1 for looking fair, but a random Credit-hungry or Ambitious employee loses 1 state.', effects: [{ kind: 'actionBonus', delta: 1 }, { kind: 'loyalty', target: 'randomWithTrait', traits: ['CreditHungry', 'Ambitious'], delta: -1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'team-burnout', type: 'Local', title: 'Team Burnout',
    situation: 'Third weekend in a row on call. The team chat has gone very quiet.',
    options: [
      { id: 'A', label: 'Push Through', text: 'Gain 2 Influence, but the department faces a Rebel Pressure check.', effects: [{ kind: 'influence', delta: 2 }, { kind: 'rebelPressure' }] },
      { id: 'B', label: 'Protect the Team', text: 'No gain now, but this department is protected from negative events for 1 round.', effects: [{ kind: 'protectDept', rounds: 1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'internal-investigation', type: 'Local', title: 'Internal Investigation',
    situation: 'Someone has been leaking meeting notes. Compliance offers to look into it, quietly.',
    options: [
      { id: 'A', label: 'Investigate', text: 'If a mole is active in this department it is exposed and you must accuse its planter; if not, you learn a hidden trait.', effects: [{ kind: 'investigate' }] },
      { id: 'B', label: 'Look Away', text: 'Gain 1 Influence, but your future Local events get +1 severity.', effects: [{ kind: 'severity', delta: 1 }, { kind: 'influence', delta: 1 }] },
    ],
    copies: 3, miniCopies: 1,
  },
  {
    templateId: 'rival-poaching-offer', type: 'Local', title: 'Rival Poaching Offer',
    situation: 'A competitor has been taking your people out for very expensive coffees.',
    options: [
      { id: 'A', label: 'Counter-Offer', chooseEmployee: true, text: 'Pay 2 Influence: the chosen employee gains 1 state.', effects: [{ kind: 'influence', delta: -2 }, { kind: 'loyalty', target: 'chosen', delta: 1 }] },
      { id: 'B', label: 'Let Them Talk', text: 'Gain 1 Influence, but a random Ambitious or Disloyal employee loses 1 state.', effects: [{ kind: 'influence', delta: 1 }, { kind: 'loyalty', target: 'randomWithTrait', traits: ['Ambitious', 'Disloyal'], delta: -1 }] },
    ],
    copies: 3, miniCopies: 0,
  },

  // ================================================================ Reveal (engine picks the target, D21)
  { templateId: 'hallway-gossip', type: 'Reveal', title: 'Hallway Gossip', situation: 'You overhear something revealing by the coffee machine.', options: [], copies: 3, miniCopies: 1 },
  { templateId: 'exit-interview-leak', type: 'Reveal', title: 'Exit Interview Leak', situation: 'A departing employee\'s exit interview notes land in your inbox by mistake.', options: [], copies: 3, miniCopies: 1 },
  { templateId: 'performance-review', type: 'Reveal', title: 'Performance Review', situation: 'Peer feedback forms are in, and some of them are very candid.', options: [], copies: 2, miniCopies: 1 },
];

export function buildEventDeck(board: 'full' | 'mini'): EventCard[] {
  const deck: EventCard[] = [];
  for (const t of EVENT_TEMPLATES) {
    const { copies, miniCopies, ...card } = t;
    const n = board === 'mini' ? miniCopies : copies;
    for (let i = 1; i <= n; i++) deck.push({ ...card, id: `${t.templateId}#${i}` });
  }
  return deck;
}
