// Influence deck (§39, §40, §85; D12). Full 72 = Social 12, Recognition 12, Support 12,
// Authority 12, Pressure 12, Mole 12. Mini 24 = 11 positive + 7 negative + 6 mole (§82).
// Balance lives here: copies / miniCopies, affinities, effects.
import type { InfluenceCard } from '../engine/types';

type Template = Omit<InfluenceCard, 'id'> & { copies: number; miniCopies: number };

export const INFLUENCE_TEMPLATES: Template[] = [
  // ---- Social (12)
  { templateId: 'lunch-invite', name: 'Lunch Invite', cost: 1, direction: 'positive', mode: 'Both', category: 'Social', baseEffect: 1, primary: 'Gossip', secondary: 'Lazy', adverse: 'Private', secondaryEffect: 'reveal', backfire: 'none', text: 'A long lunch off-site; they talk, you listen.', copies: 4, miniCopies: 2 },
  { templateId: 'one-on-one', name: 'One-on-One Conversation', cost: 1, direction: 'positive', mode: 'Both', category: 'Social', baseEffect: 1, primary: 'Private', secondary: 'Loyal', adverse: 'Gossip', secondaryEffect: 'reveal', backfire: 'none', text: 'A quiet closed-door chat about how they are really doing.', copies: 4, miniCopies: 1 },
  { templateId: 'exclusive-information', name: 'Exclusive Information', cost: 2, direction: 'positive', mode: 'Both', category: 'Social', baseEffect: 1, primary: 'Gossip', secondary: 'Ambitious', adverse: 'Private', secondaryEffect: 'reveal', backfire: 'none', text: 'Let them in on what leadership is planning before anyone else hears.', copies: 4, miniCopies: 1 },

  // ---- Recognition (12)
  { templateId: 'public-praise', name: 'Public Praise', cost: 2, direction: 'positive', mode: 'Both', category: 'Recognition', baseEffect: 1, primary: 'CreditHungry', secondary: 'Ambitious', adverse: 'ByTheBook', secondaryEffect: 'ripple', backfire: 'none', text: 'Call out their work in front of the whole floor.', copies: 4, miniCopies: 1 },
  { templateId: 'give-credit', name: 'Give Credit', cost: 2, direction: 'positive', mode: 'Both', category: 'Recognition', baseEffect: 1, primary: 'CreditHungry', secondary: 'Loyal', adverse: 'Ambitious', secondaryEffect: 'draw', backfire: 'none', text: 'Put their name on the slide that the VP will actually read.', copies: 4, miniCopies: 1 },
  { templateId: 'take-credit', name: 'Take Credit for Their Work', cost: 2, direction: 'negative', mode: 'External', category: 'Recognition', baseEffect: 1, primary: 'Ambitious', secondary: 'Disloyal', adverse: 'CreditHungry', secondaryEffect: 'ripple', backfire: 'reverse', text: 'Present their idea as yours in the steering meeting.', copies: 2, miniCopies: 1 },
  { templateId: 'withhold-recognition', name: 'Withhold Recognition', cost: 2, direction: 'negative', mode: 'Both', category: 'Recognition', baseEffect: 1, primary: 'CreditHungry', secondary: 'Disloyal', adverse: 'Ambitious', secondaryEffect: 'refund', backfire: 'reverse', text: 'Thank everyone on the project except them.', copies: 2, miniCopies: 1 },

  // ---- Support (12)
  { templateId: 'ask-for-a-favor', name: 'Ask for a Favor', cost: 1, direction: 'positive', mode: 'Both', category: 'Support', baseEffect: 1, primary: 'Loyal', secondary: 'Ambitious', adverse: 'Disloyal', secondaryEffect: 'refund', backfire: 'none', text: 'Ask them to help you out; people like being needed.', copies: 3, miniCopies: 1 },
  { templateId: 'flexible-work', name: 'Flexible Work Arrangement', cost: 1, direction: 'positive', mode: 'Internal', category: 'Support', baseEffect: 1, primary: 'Lazy', secondary: 'Private', adverse: 'ByTheBook', secondaryEffect: 'draw', backfire: 'none', text: 'Quietly approve their Fridays from home.', copies: 3, miniCopies: 0 },
  { templateId: 'cover-their-mistake', name: 'Cover Their Mistake', cost: 2, direction: 'positive', mode: 'Internal', category: 'Support', baseEffect: 1, primary: 'Loyal', secondary: 'Lazy', adverse: 'ByTheBook', secondaryEffect: 'refund', backfire: 'exposeSelf', text: 'Make their missed deadline disappear from the status report.', copies: 3, miniCopies: 1 },
  { templateId: 'defend-in-public', name: 'Defend Them in Public', cost: 2, direction: 'positive', mode: 'Both', category: 'Support', baseEffect: 1, primary: 'Loyal', secondary: 'CreditHungry', adverse: 'Private', secondaryEffect: 'ripple', backfire: 'exposeSelf', text: 'Stand up for them when they are criticised in the all-hands.', copies: 3, miniCopies: 1 },

  // ---- Authority / Career (12)
  { templateId: 'promise-promotion', name: 'Promise Promotion', cost: 3, direction: 'positive', mode: 'Both', category: 'Authority', baseEffect: 2, primary: 'Ambitious', secondary: 'CreditHungry', adverse: 'Lazy', secondaryEffect: 'promise', backfire: 'exposeSelf', text: 'Tell them the next title bump is theirs. Promotion Season will hold you to it.', copies: 3, miniCopies: 1 },
  { templateId: 'executive-meeting-invite', name: 'Executive Meeting Invite', cost: 3, direction: 'positive', mode: 'External', category: 'Authority', baseEffect: 2, primary: 'Ambitious', secondary: 'CreditHungry', adverse: 'Private', secondaryEffect: 'draw', backfire: 'none', text: 'Bring them into the room where the real decisions get made.', copies: 2, miniCopies: 0 },
  { templateId: 'high-visibility-project', name: 'High-Visibility Project', cost: 3, direction: 'positive', mode: 'Both', category: 'Authority', baseEffect: 2, primary: 'RiskTaking', secondary: 'Ambitious', adverse: 'Cautious', secondaryEffect: 'ripple', backfire: 'loseInfluence', text: 'Hand them the launch everyone will be watching.', copies: 2, miniCopies: 1 },
  { templateId: 'give-decision-ownership', name: 'Give Decision Ownership', cost: 3, direction: 'positive', mode: 'Internal', category: 'Authority', baseEffect: 2, primary: 'RiskTaking', secondary: 'Loyal', adverse: 'ByTheBook', secondaryEffect: 'refund', backfire: 'loseInfluence', text: 'Let them make the call, and back whatever they decide.', copies: 2, miniCopies: 0 },
  { templateId: 'headhunter-approach', name: 'Headhunter Approach', cost: 4, direction: 'positive', mode: 'External', category: 'Authority', baseEffect: 2, primary: 'Ambitious', secondary: 'Disloyal', adverse: 'Loyal', secondaryEffect: 'extraStep', backfire: 'exposeSelf', text: 'A discreet call with a much better offer. Strong success moves them two states.', copies: 1, miniCopies: 0 },
  { templateId: 'block-promotion', name: 'Block Promotion', cost: 3, direction: 'negative', mode: 'Both', category: 'Authority', baseEffect: 2, primary: 'Ambitious', secondary: 'CreditHungry', adverse: 'Lazy', secondaryEffect: 'ripple', backfire: 'reverse', text: 'Raise "concerns" in the calibration meeting.', copies: 2, miniCopies: 1 },

  // ---- Pressure / Sabotage (12)
  { templateId: 'assign-unwanted-task', name: 'Assign Unwanted Task', cost: 1, direction: 'negative', mode: 'Both', category: 'Pressure', baseEffect: 1, primary: 'Lazy', secondary: 'CreditHungry', adverse: 'Loyal', secondaryEffect: 'refund', backfire: 'reverse', text: 'Give them the quarterly compliance spreadsheet. Again.', copies: 3, miniCopies: 1 },
  { templateId: 'leak-a-rumor', name: 'Leak a Rumor', cost: 2, direction: 'negative', mode: 'External', category: 'Pressure', baseEffect: 1, primary: 'Gossip', secondary: 'Disloyal', adverse: 'Private', secondaryEffect: 'ripple', backfire: 'ripple', text: 'Let slip that their team lead is about to be replaced.', copies: 3, miniCopies: 1 },
  { templateId: 'escalate-to-hr', name: 'Escalate to HR', cost: 3, direction: 'negative', mode: 'Both', category: 'Pressure', baseEffect: 2, primary: 'RiskTaking', secondary: 'Lazy', adverse: 'ByTheBook', secondaryEffect: 'ripple', backfire: 'reverse', text: 'File a formal complaint about their conduct.', copies: 2, miniCopies: 1 },
  { templateId: 'remove-from-spotlight', name: 'Remove From Spotlight', cost: 2, direction: 'negative', mode: 'Both', category: 'Pressure', baseEffect: 1, primary: 'CreditHungry', secondary: 'Gossip', adverse: 'Ambitious', secondaryEffect: 'refund', backfire: 'reverse', text: 'Quietly take them off the demo-day presenter list.', copies: 2, miniCopies: 1 },
  { templateId: 'reorg-announcement', name: 'Reorg Announcement', cost: 4, direction: 'negative', mode: 'External', category: 'Pressure', baseEffect: 2, primary: 'Cautious', secondary: 'Lazy', adverse: 'RiskTaking', secondaryEffect: 'ripple', backfire: 'ripple', text: 'Float a reorg chart that has their whole team reporting somewhere else.', copies: 2, miniCopies: 0 },

  // ---- Mole (12)
  { templateId: 'mole-silent-block', name: 'Mole: Silent Block', cost: 3, direction: 'mole', mode: 'Both', category: 'Mole', baseEffect: 0, primary: null, secondary: null, adverse: null, secondaryEffect: 'none', backfire: 'none', moleAbility: 'SilentBlock', text: 'Plant a mole on a non-Loyal employee for 2 rounds. They cannot move up, and the first positive card played on them by a rival is secretly blocked.', copies: 6, miniCopies: 3 },
  { templateId: 'mole-rebel-pressure', name: 'Mole: Rebel Pressure', cost: 3, direction: 'mole', mode: 'Both', category: 'Mole', baseEffect: 0, primary: null, secondary: null, adverse: null, secondaryEffect: 'none', backfire: 'none', moleAbility: 'RebelPressure', text: 'Plant a mole on a non-Loyal employee for 2 rounds. They cannot move up, and the first time their team hits 2 Rebels the mole secretly adds +1 Rebel Pressure.', copies: 6, miniCopies: 3 },
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
