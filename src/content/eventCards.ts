// STUB — the content agent replaces this file with the full 56-card deck (§45–§52).
import type { EventCard } from '../engine/types';

type Template = Omit<EventCard, 'id'> & { copies: number; miniCopies: number };

export const EVENT_TEMPLATES: Template[] = [
  {
    templateId: 'missed-deadline', type: 'Local', title: 'Missed Deadline',
    situation: 'A key deliverable slipped. Someone has to answer for it.',
    options: [
      { id: 'A', label: 'Protect Employee', text: 'The chosen employee is spared, but another teammate takes the fall (-1).', chooseEmployee: true, effects: [{ kind: 'loyalty', target: 'randomOther', delta: -1 }] },
      { id: 'B', label: 'Blame Employee', text: 'The chosen employee loses 1 loyalty state.', chooseEmployee: true, effects: [{ kind: 'loyalty', target: 'chosen', delta: -1 }] },
    ],
    copies: 6, miniCopies: 3,
  },
  {
    templateId: 'ceo-town-hall', type: 'Global', resolution: 'majority', title: 'CEO Town Hall',
    situation: 'The CEO lays out a bold new strategy. Will you back it?',
    options: [
      { id: 'A', label: 'Support the CEO', text: 'Majority: everyone +1 Influence. Minority: +2 Influence but a random employee -1.', effects: [{ kind: 'influence', delta: 1 }], minorityEffects: [{ kind: 'influence', delta: 1 }, { kind: 'loyalty', target: 'random', delta: -1 }] },
      { id: 'B', label: 'Challenge the Strategy', text: 'Majority: a random employee in each org +1. Minority: +1 Influence but a random employee -1.', effects: [{ kind: 'loyalty', target: 'random', delta: 1 }], minorityEffects: [{ kind: 'influence', delta: 1 }, { kind: 'loyalty', target: 'random', delta: -1 }] },
    ],
    copies: 6, miniCopies: 3,
  },
  { templateId: 'hallway-gossip', type: 'Reveal', title: 'Hallway Gossip', situation: 'You overhear something revealing about a colleague.', options: [], copies: 4, miniCopies: 2 },
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
