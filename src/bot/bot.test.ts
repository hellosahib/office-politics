import { describe, expect, it } from 'vitest';
import { decide, type BotHelpers } from './bot';
import { makeMockView } from '../dev/mockView';
import type { Action, EventCard, InfluenceCard, Pending, Prediction } from '../engine/types';

const pred = (min: number, max: number): Prediction => ({
  requiredSpend: 1, base: 1, rankBonus: 0, eventBonus: 0, traitMods: [], unknownTraitMayAffect: false, min, max, legal: true,
});
const helpers = (targets: string[], p = pred(1, 3)): BotHelpers => ({ legalTargets: () => targets, predict: () => p });
const zero = () => 0;

function card(id: string, primary: InfluenceCard['primary']): InfluenceCard {
  return {
    id, templateId: id, name: id, cost: 1, direction: 'positive', mode: 'Both', category: 'Social', baseEffect: 1,
    primary, secondary: null, adverse: null, secondaryEffect: 'none', backfire: 'none', text: '',
  };
}

describe('bot', () => {
  it('chooses Manage when an owned department has a rebel, Expand otherwise', () => {
    const v = makeMockView('full'); // P0 owns sales, which has 2 rebels
    expect(decide(v, helpers([]), zero)).toEqual({ type: 'focus', player: 0, focus: 'Manage' });

    const calm = makeMockView('full');
    const mine = new Set(calm.players[0].controlledDepartments);
    for (const e of calm.employees) if (mine.has(e.deptId)) e.loyalty = 'Favorable';
    expect(decide(calm, helpers([]), zero)).toEqual({ type: 'focus', player: 0, focus: 'Expand' });
  });

  it('picks the card whose primary trait matches a known trait of the target', () => {
    const v = makeMockView('full');
    const target = v.employees.find((e) => e.id === 'yash-malhotra')!;
    const other = target.permanentTrait === 'Lazy' ? 'Ambitious' : 'Lazy';
    v.pending = { kind: 'play', player: 0, focus: 'Expand' };
    v.players[0].hand = [card('a-nomatch', other), card('b-match', target.permanentTrait)];
    v.players[0].reserveCount = 3; // nothing worth saving -> full budget
    expect(decide(v, helpers([target.id]), zero)).toEqual({ type: 'playCard', player: 0, cardId: 'b-match', targetId: target.id });
    // Nothing good enough -> stop playing.
    expect(decide(v, helpers([target.id], pred(-1, 1)), zero).type).toBe('donePlaying');
  });

  it('returns the right action type for every pending kind', () => {
    const ev: EventCard = {
      id: 'ev#1', templateId: 'ev', type: 'Local', title: 'Ev', situation: '',
      options: [
        { id: 'A', label: 'A', text: '', effects: [{ kind: 'influence', delta: -1 }] },
        { id: 'B', label: 'B', text: '', effects: [{ kind: 'loyalty', target: 'chosen', delta: 1 }], chooseEmployee: true },
      ],
    };
    const cases: [Pending, Action['type']][] = [
      [{ kind: 'play', player: 0, focus: 'Manage' }, 'donePlaying'],
      [{ kind: 'save', player: 0 }, 'save'],
      [{ kind: 'summary', player: 0 }, 'endTurn'],
      [{ kind: 'revealChoice', player: 0, employeeId: 'riya-shah', trait: 'Lazy', weight: 2 }, 'revealChoice'],
      [{ kind: 'accusation', player: 0, employeeId: 'riya-shah' }, 'accuse'],
      [{ kind: 'eventChoice', player: 0, eventId: ev.id, deptId: 'engineering' }, 'eventChoice'],
      [{ kind: 'eventTarget', player: 0, eventId: ev.id, optionId: 'B', choose: 'employee', candidates: ['mehul-sethi', 'riya-shah'] }, 'eventTarget'],
    ];
    for (const [pending, type] of cases) {
      const v = makeMockView('full');
      v.pending = pending;
      v.activeEvent = { card: ev, deptId: 'engineering', votes: {}, targets: {}, remaining: [], outcome: null, votesVisible: false };
      const a = decide(v, helpers([]), zero);
      expect(a.type).toBe(type);
      if (a.type === 'eventChoice') expect(a.optionId).toBe('B');            // +2 loyalty beats -1 influence
      if (a.type === 'eventTarget') expect(a.targetId).toBe('riya-shah');    // Favorable -> push to Loyal
      if (a.type === 'accuse') expect(a.accused).not.toBe(0);
    }
  });
});
