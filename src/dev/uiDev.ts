// UI dev harness: the real game screen on a fake client wrapping a mock view.
// Keys: 1 Local event · 2 Global vote (locked) · 3 eventTarget picker (Promotion Season) · 4 revealChoice
//       5 play · 6 play + target picker open · 7 save · 8 summary · 9 accusation (mine)
//       0 game over (Election) · w someone else's turn · c hot-seat curtain · e employee dossier
//       i "Meet your team" intro → deal → event flip · d next turn: discard + deal + event flip
//       o event outcome modal (Global) · b card banner (success) · f card banner (failure) · r trait reveal banners
import type { GameClient } from '../client';
import type { Action, EmployeeId, GameView, Pending, PlayerId, PlayerView, Prediction } from '../engine/types';
import { AGENDAS, buildEventDeck, buildInfluenceDeck } from '../content';
import { makeMockView } from './mockView';
import { mountGame } from '../ui/game';
import { ui } from '../ui/helpers';

let view: GameView;
let seed = 1000;
let me: PlayerId | null = 0;
let kind: 'local' | 'online' = 'online';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const events = buildEventDeck('full');
const deck = buildInfluenceDeck('full');

type AE = NonNullable<GameView['activeEvent']>;
/** Mock active event; affectedDeptIds is filled the way the engine does (Local: its dept). */
const ae = (x: Omit<AE, 'affectedDeptIds'>) => ({ affectedDeptIds: x.deptId ? [x.deptId] : [], ...x }) as AE;

function base(): GameView {
  const v = makeMockView('full');
  const p0 = v.players[0];
  p0.influence = 5;
  p0.reserve = [deck[deck.length - 1]];
  p0.reserveCount = 1;
  p0.agenda = AGENDAS[0];
  const intel = [{ employeeId: 'sahib-singh', deptId: 'engineering', trait: 'CreditHungry' as const, weight: 2 }, { employeeId: 'neha-kapoor', deptId: 'product', trait: 'Ambitious' as const, weight: 2 }];
  p0.intel = intel as PlayerView['intel']; // newest first; deptId per the newer engine view
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
      view.activeEvent = ae({ card: local, deptId: 'engineering', votes: {}, targets: {}, remaining: [0], outcome: null, votesVisible: false });
      set({ kind: 'eventChoice', player: 0, eventId: local.id, deptId: 'engineering' }, 'event');
      break;
    case '2':
      view.activeEvent = ae({ card: global, deptId: null, votes: { 1: 'A' }, targets: {}, remaining: [0, 2], outcome: null, votesVisible: false });
      set({ kind: 'eventChoice', player: 0, eventId: global.id, deptId: null }, 'event');
      break;
    case '3': {
      const promo = events.find(e => e.options.some(o => o.effects.some(f => f.kind === 'honorPromise'))) ?? local;
      const opt = promo.options.find(o => o.effects.some(f => f.kind === 'honorPromise'))?.id ?? 'A';
      view.activeEvent = ae({ card: promo, deptId: 'engineering', votes: {}, targets: {}, remaining: [0], outcome: null, votesVisible: false });
      set({ kind: 'eventTarget', player: 0, eventId: promo.id, optionId: opt, choose: 'employee', candidates: ['sahib-singh', 'riya-shah', 'kabir-anand', 'mehul-sethi'] }, 'event');
      break;
    }
    case '4':
      view.activeEvent = ae({ card: events.find(e => e.type === 'Reveal') ?? local, deptId: null, votes: {}, targets: {}, remaining: [], outcome: null, votesVisible: false });
      set({ kind: 'revealChoice', player: 0, employeeId: 'yash-malhotra', trait: 'Cautious', weight: 2 }, 'event');
      break;
    case '5': set({ kind: 'play', player: 0, focus: null }, 'play'); break;
    case '6':
      set({ kind: 'play', player: 0, focus: null }, 'play');
      ui.selectedCard = view.players[0].hand![0].id; ui.selectedTarget = 'yash-malhotra';
      break;
    case 'i':
      view = base(); view.config = { ...view.config, seed: ++seed }; view.round = 1; view.actionCount = 0;
      view.activeEvent = ae({ card: local, deptId: 'engineering', votes: {}, targets: {}, remaining: [0], outcome: null, votesVisible: false });
      set({ kind: 'eventChoice', player: 0, eventId: local.id, deptId: 'engineering' }, 'event');
      break;
    case 'd': {
      const fresh = deck.filter(c => !view.players[0].hand!.some(h => h.templateId === c.templateId)).slice(0, 4).map((c, i) => ({ ...c, id: `${c.id}~${seed++}${i}` }));
      view.players[0].hand = fresh; view.players[0].handCount = 4; view.round = 4;
      view.activeEvent = ae({ card: global, deptId: null, votes: {}, targets: {}, remaining: [0, 1, 2], outcome: null, votesVisible: false });
      set({ kind: 'eventChoice', player: 0, eventId: global.id, deptId: null }, 'event');
      break;
    }
    case 'o': {
      const o = global.options[0], o2 = global.options[1];
      set({ kind: 'play', player: 0, focus: null }, 'play');
      (view as GameView & { lastEventResult?: unknown }).lastEventResult = {
        eventId: global.id, templateId: global.templateId, title: global.title, type: global.type, situation: global.situation,
        votes: [{ player: 0, optionId: 'A', optionLabel: o.label }, { player: 1, optionId: 'B', optionLabel: o2.label }, { player: 2, optionId: 'A', optionLabel: o.label }],
        outcome: { optionId: 'A', label: o.label, text: o.text },
        perPlayer: [
          { player: 0, deptId: 'engineering', minority: false, changes: [{ kind: 'loyalty', employeeId: 'riya-shah', from: 'Favorable', to: 'Loyal' }, { kind: 'influence', delta: 1 }] },
          { player: 1, deptId: 'product', minority: true, changes: [{ kind: 'loyalty', employeeId: 'vikram-rao', from: 'Favorable', to: 'Neutral' }, { kind: 'reveal', employeeId: 'neha-kapoor', by: 1, public: true, trait: 'Ambitious', weight: 2 }] },
          { player: 2, deptId: 'finance', minority: false, changes: [] },
        ],
        actionCount: ++seed,
      };
      break;
    }
    case 'b': case 'f': {
      set({ kind: 'play', player: 1, focus: null }, 'play'); view.currentPlayer = 1;
      const ok = key === 'b';
      (view as GameView & { lastCardResult?: unknown }).lastCardResult = {
        actor: 1, cardName: ok ? 'Public Praise' : 'Leak a Rumor', employeeId: 'yash-malhotra', deptId: 'product',
        band: ok ? 'Strong Success' : 'Failure', from: 'Neutral', to: ok ? 'Favorable' : 'Neutral',
        reaction: ok ? 'Yash beams and starts quoting Tanya in standups' : 'Yash shrugs it off and keeps his head down', actionCount: ++seed,
      };
      break;
    }
    case 'r':
      view.log = [...view.log,
        { round: 3, turn: 1, text: 'Revealed: Riya Shah is Cautious (+2).', visibility: 'public', tag: 'reveal' },
        { round: 3, turn: 0, text: 'Intel: Kabir Anand is Gossip (+2).', visibility: 0, tag: 'reveal' }];
      view.players[0].intel = [{ employeeId: 'kabir-anand', deptId: 'engineering', trait: 'Gossip', weight: 2 }, ...view.players[0].intel!] as PlayerView['intel'];
      break;
    case '7': set({ kind: 'save', player: 0 }, 'save'); view.players[0].influence = 2; break;
    case '8':
      set({ kind: 'summary', player: 0 }, 'summary');
      view.turnSummary = {
        player: 0, influenceSpent: 4, cardsPlayed: ['Public Praise', 'Lunch Invite'], cardsSaved: ['Leak a Rumor'],
        employeesChanged: [{ employeeId: 'yash-malhotra', from: 'Neutral', to: 'Favorable' }, { employeeId: 'mehul-sethi', from: 'Skeptical', to: 'Rebel' }],
        newRebels: ['mehul-sethi'], departmentsCaptured: ['product'], departmentsLost: [], managementPenalty: false,
        promisesCreated: ['kabir-anand'], promisesResolved: [], moleActivity: ['Your mole on Tanya Jain blocked Public Praise.'], promotion: 'Manager',
      };
      view.log = [...view.log,
        { round: 3, turn: 0, text: 'Sahib pays 1 Influence in management cost.', visibility: 'public' },
        { round: 3, turn: 0, text: 'Sahib played Public Praise on Yash Malhotra: Standard Success (Neutral → Favorable).', visibility: 'public' },
        { round: 3, turn: 0, text: 'Sahib played Lunch Invite on Mehul Sethi: Failure.', visibility: 'public' }];
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
      view.activeEvent = ae({ card: global, deptId: null, votes: { 0: 'A', 1: 'B', 2: 'A' }, targets: {}, remaining: [], outcome: 'A', votesVisible: true });
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
    emit();
    return { ok: true };
  },
  legalTargets(cardId) {
    // Direction decides: positive → own team + Neutral depts; hostile → rivals + Neutral; mole → rivals.
    const card = [...(view.players[0].hand ?? []), ...(view.players[0].reserve ?? [])].find(c => c.id === cardId);
    const lead = (d: string) => view.departments.find(x => x.id === d)?.teamLead ?? null;
    return view.employees
      .filter(e => card?.direction === 'positive' ? lead(e.deptId) === 0 || lead(e.deptId) === null
        : card?.direction === 'negative' ? lead(e.deptId) !== 0 : lead(e.deptId) !== 0 && lead(e.deptId) !== null)
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

scenario('5');
mountGame(document.getElementById('app')!, client, () => console.log('exit'));
window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'e') { ui.inspect = ui.inspect ? null : 'tanya-jain'; emit(); return; }
  if ('1234567890wcidobfr'.includes(e.key)) scenario(e.key);
});
