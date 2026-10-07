// STUB — the content agent replaces this file with the full 72-card deck (§39, §40, §85).
import type { InfluenceCard } from '../engine/types';

type Template = Omit<InfluenceCard, 'id'> & { copies: number; miniCopies: number };

export const INFLUENCE_TEMPLATES: Template[] = [
  { templateId: 'lunch-invite', name: 'Lunch Invite', cost: 1, direction: 'positive', mode: 'Both', category: 'Social', baseEffect: 1, primary: 'Gossip', secondary: 'Lazy', adverse: 'Private', secondaryEffect: 'reveal', backfire: 'none', text: 'A casual lunch to build rapport.', copies: 6, miniCopies: 3 },
  { templateId: 'public-praise', name: 'Public Praise', cost: 2, direction: 'positive', mode: 'Both', category: 'Recognition', baseEffect: 1, primary: 'CreditHungry', secondary: 'Ambitious', adverse: 'ByTheBook', secondaryEffect: 'ripple', backfire: 'none', text: 'Praise them in front of the whole team.', copies: 6, miniCopies: 3 },
  { templateId: 'leak-a-rumor', name: 'Leak a Rumor', cost: 2, direction: 'negative', mode: 'Both', category: 'Pressure', baseEffect: 1, primary: 'Gossip', secondary: 'Disloyal', adverse: 'Private', secondaryEffect: 'ripple', backfire: 'reverse', text: 'Spread doubt about their leadership.', copies: 6, miniCopies: 3 },
  { templateId: 'mole-silent-block', name: 'Mole: Silent Block', cost: 3, direction: 'mole', mode: 'Both', category: 'Mole', baseEffect: 0, primary: null, secondary: null, adverse: null, secondaryEffect: 'none', backfire: 'none', moleAbility: 'SilentBlock', text: 'Plant a mole that secretly blocks one positive attempt.', copies: 6, miniCopies: 3 },
];

export function buildInfluenceDeck(board: 'full' | 'mini'): InfluenceCard[] {
  const deck: InfluenceCard[] = [];
  for (const t of INFLUENCE_TEMPLATES) {
    const { copies, miniCopies, ...card } = t;
    const n = board === 'mini' ? miniCopies : copies;
    for (let i = 1; i <= n; i++) deck.push({ ...card, id: `${t.templateId}#${i}` });
  }
  return deck;
}
