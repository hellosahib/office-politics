import type { Agenda } from '../engine/types';

// §25. Evaluation logic lives in the engine (scoring).
export const AGENDAS: Agenda[] = [
  { id: 'EmpireBuilder',     name: 'The Empire Builder',     objective: 'Control 4+ departments at game end.' },
  { id: 'Stabilizer',        name: 'The Stabilizer',         objective: 'Finish with no owned department containing more than 1 Rebel.' },
  { id: 'PuppetMaster',      name: 'The Puppet Master',      objective: 'Have 2+ Moles active at the same time during the game.' },
  { id: 'Opportunist',       name: 'The Opportunist',        objective: 'Capture a previously Neutral department.' },
  { id: 'Saboteur',          name: 'The Saboteur',           objective: 'Create 5 Rebels through your actions.' },
  { id: 'PeopleManager',     name: 'The People Manager',     objective: 'Finish with the most Loyal employees (ties count).' },
  { id: 'Survivor',          name: 'The Survivor',           objective: 'Never lose your starting department.' },
  { id: 'Climber',           name: 'The Climber',            objective: 'Reach VP before the final round.' },
  { id: 'InformationBroker', name: 'The Information Broker', objective: 'Privately acquire 4 revealed traits.' },
  { id: 'CorporateFixer',    name: 'The Corporate Fixer',    objective: 'Resolve 3 negative Events without triggering Internal Instability that turn.' },
];
