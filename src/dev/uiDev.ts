// UI dev harness: the real game screen on a fake client wrapping a mock view.
// Keys: 1 Local event · 2 Global vote (locked) · 3 Global revealed + eventTarget · 4 revealChoice
//       5 play (choose focus) · 6 play (Expand) · 7 save · 8 summary · 9 accusation (mine)
//       0 game over (Election) · w someone else's turn · c hot-seat curtain
import type { GameClient } from '../client';
import type { Action, EmployeeId, GameView, Pending, PlayerId, Prediction } from '../engine/types';
import { AGENDAS, buildEventDeck, buildInfluenceDeck } from '../content';
import { makeMockView } from './mockView';
import { mountGame } from '../ui/game';

let view: GameView;
let me: PlayerId | null = 0;
let kind: 'local' | 'online' = 'online';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const events = buildEventDeck('full');
const deck = buildInfluenceDeck('full');

function base(): GameView {
  const v = makeMockView('full');
  const p0 = v.players[0];
  p0.influence = 5;
  p0.reserve = [deck[deck.length - 1]];
  p0.reserveCount = 1;
  p0.agenda = AGENDAS[0];
  p0.intel = [{ employeeId: 'neha-kapoor', trait: 'Ambitious', weight: 2 }, { employeeId: 'sahib-singh', trait: 'CreditHungry', weight: 2 }];
  return v;
}

function scenario(key: string): void {
  kind = 'online'; me = 0;
  view = base();
  const set = (pending: Pending, phase: GameView['phase']) => { view.pending = pending; view.phase = phase; };
  const local = events.find(e => e.type === 'Local')!;
  const global = events.find(e => e.type === 'Global')!;
  switch (key) {
    case '1':
      view.activeEvent = { card: local, deptId: 'engineering', votes: {}, targets: {}, remaining: [0], outcome: null, votesVisible: false };
      set({ kind: 'eventChoice', player: 0, eventId: local.id, deptId: 'engineering' }, 'event');
      break;
    case '2':
      view.activeEvent = { card: global, deptId: null, votes: { 1: 'A' }, targets: {}, remaining: [0, 2], outcome: null, votesVisible: false };
      set({ kind: 'eventChoice', player: 0, eventId: global.id, deptId: null }, 'event');
      break;
    case '3':
      view.activeEvent = { card: local, deptId: 'engineering', votes: {}, targets: {}, remaining: [0], outcome: null, votesVisible: false };
      set({ kind: 'eventTarget', player: 0, eventId: local.id, optionId: 'A', choose: 'employee', candidates: ['sahib-singh', 'riya-shah', 'kabir-anand', 'mehul-sethi'] }, 'event');
      break;
    case '4':
      view.activeEvent = { card: events.find(e => e.type === 'Reveal') ?? local, deptId: null, votes: {}, targets: {}, remaining: [], outcome: null, votesVisible: false };
      set({ kind: 'revealChoice', player: 0, employeeId: 'yash-malhotra', trait: 'Cautious', weight: 2 }, 'event');
      break;
    case '5': set({ kind: 'play', player: 0, focus: null }, 'play'); break;
    case '6': set({ kind: 'play', player: 0, focus: 'Expand' }, 'play'); view.focus = 'Expand'; break;
    case '7': set({ kind: 'save', player: 0 }, 'save'); view.players[0].influence = 2; break;
    case '8':
      set({ kind: 'summary', player: 0 }, 'summary');
      view.turnSummary = {
        player: 0, influenceSpent: 4, cardsPlayed: ['Public Praise', 'Lunch Invite'], cardsSaved: ['Leak a Rumor'],
        employeesChanged: [{ employeeId: 'yash-malhotra', from: 'Neutral', to: 'Favorable' }, { employeeId: 'mehul-sethi', from: 'Skeptical', to: 'Rebel' }],
        newRebels: ['mehul-sethi'], departmentsCaptured: ['product'], departmentsLost: [], managementPenalty: false,
        promisesCreated: ['kabir-anand'], promisesResolved: [], moleActivity: ['Your mole on Tanya Jain blocked Public Praise.'], promotion: 'Manager',
      };
      break;
    case '9': set({ kind: 'accusation', player: 0, employeeId: 'tanya-jain' }, 'accusation'); break;
    case '0':
      set({ kind: 'gameOver' }, 'gameOver');
      view.config = { ...view.config, mode: 'Election', rounds: 10 };
      view.winner = 1;
      view.players.forEach((p, i) => { p.agenda = AGENDAS[i]; });
      view.scores = Object.fromEntries(view.players.map((p, i) => [String(p.id), {
        departments: 20 - i * 5, loyalists: 4, favorable: 3, rebels: -2, molesPlanted: 3 * i, agenda: i === 1 ? 8 : 0, agendaCompleted: i === 1, total: 30 + i * 3,
      }]));
      break;
    case 'w':
      view.activeEvent = { card: global, deptId: null, votes: { 0: 'A', 1: 'B', 2: 'A' }, targets: {}, remaining: [], outcome: 'A', votesVisible: true };
      set({ kind: 'eventChoice', player: 1, eventId: global.id, deptId: null }, 'event');
      view.currentPlayer = 1;
      break;
    case 'c':
      kind = 'local'; me = 1;
      view.players[1].isBot = false;
      view.config.players[1].isBot = false;
      view.currentPlayer = 1;
      set({ kind: 'play', player: 1, focus: null }, 'play');
      break;
  }
  emit();
}

const client: GameClient = {
  get kind() { return kind; },
  get me() { return me; },
  getView: () => view,
  async dispatch(a: Action) {
    console.log('dispatch', a);
    view = { ...view, actionCount: view.actionCount + 1, log: [...view.log, { round: view.round, turn: a.player, text: `dispatch ${a.type}`, visibility: a.player, tag: 'dev' }] };
    if (a.type === 'focus') view.pending = { kind: 'play', player: a.player, focus: a.focus };
    emit();
    return { ok: true };
  },
  legalTargets(cardId) {
    const card = [...(view.players[0].hand ?? []), ...(view.players[0].reserve ?? [])].find(c => c.id === cardId);
    const focus = view.pending.kind === 'play' ? view.pending.focus : null;
    const mine = new Set(view.players[0].controlledDepartments);
    return view.employees
      .filter(e => (focus === 'Manage') === mine.has(e.deptId))
      .filter(e => !(card?.direction === 'mole' && e.loyalty === 'Loyal'))
      .map(e => e.id);
  },
  predict(cardId, targetId: EmployeeId): Prediction {
    const me0 = view.players[0];
    const card = [...(me0.hand ?? []), ...(me0.reserve ?? [])].find(c => c.id === cardId)!;
    const e = view.employees.find(x => x.id === targetId)!;
    const known: [typeof e.permanentTrait, number][] = [[e.permanentTrait, 1]];
    if (e.hiddenTrait1) known.push([e.hiddenTrait1, 2]);
    const traitMods = known.flatMap(([t, w]) =>
      t === card.primary || t === card.secondary ? [{ trait: t, value: w }] : t === card.adverse ? [{ trait: t, value: -w }] : []);
    const sum = card.baseEffect + traitMods.reduce((s, m) => s + m.value, 0) + 1;
    const requiredSpend = card.direction === 'negative' && e.loyalty === 'Loyal' ? Math.max(2, card.cost) : card.cost;
    const legal = requiredSpend <= me0.influence;
    return { requiredSpend, base: card.baseEffect, rankBonus: 1, eventBonus: 0, traitMods, unknownTraitMayAffect: !e.hiddenTrait1, min: sum - 1, max: sum + 1, legal, reason: legal ? undefined : 'Not enough Influence' };
  },
  subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
  leave() { console.log('leave'); },
};

scenario('6');
mountGame(document.getElementById('app')!, client, () => console.log('exit'));
window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if ('1234567890wc'.includes(e.key)) scenario(e.key);
});
