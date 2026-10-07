import { describe, expect, it } from 'vitest';
import { buildInfluenceDeck, INFLUENCE_TEMPLATES } from './influenceCards';
import { buildEventDeck, EVENT_TEMPLATES } from './eventCards';
import type { EventEffect } from '../engine/types';

const count = <T>(xs: T[], key: (x: T) => string) =>
  xs.reduce<Record<string, number>>((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});

describe('influence deck', () => {
  const full = buildInfluenceDeck('full');
  const mini = buildInfluenceDeck('mini');

  it('has the right sizes and category split', () => {
    expect(full).toHaveLength(72);
    expect(count(full, (c) => c.category)).toEqual({ Social: 12, Recognition: 12, Support: 12, Authority: 12, Pressure: 12, Mole: 12 });
    expect(mini).toHaveLength(24);
    expect(count(mini, (c) => c.direction)).toEqual({ positive: 11, negative: 7, mole: 6 });
  });

  it('has unique instance ids', () => {
    for (const d of [full, mini]) expect(new Set(d.map((c) => c.id)).size).toBe(d.length);
  });

  it('keeps at least 60% of cards usable in both modes', () => {
    expect(full.filter((c) => c.mode === 'Both').length / full.length).toBeGreaterThanOrEqual(0.6);
  });

  it('has well-formed templates', () => {
    for (const t of INFLUENCE_TEMPLATES) {
      expect(t.cost).toBeGreaterThanOrEqual(1);
      expect(t.cost).toBeLessThanOrEqual(4);
      if (t.category === 'Mole' || t.direction === 'mole') {
        expect(t.direction).toBe('mole');
        expect(t.category).toBe('Mole');
        expect(t.moleAbility).toBeDefined();
        expect([t.primary, t.secondary, t.adverse]).toEqual([null, null, null]);
      } else {
        expect(t.moleAbility).toBeUndefined();
        expect(t.primary).not.toBeNull();
        expect(t.adverse).not.toBeNull();
      }
      expect(t.secondaryEffect === 'promise').toBe(t.templateId === 'promise-promotion');
    }
  });
});

describe('event deck', () => {
  const full = buildEventDeck('full');
  const mini = buildEventDeck('mini');

  it('has the right sizes and type split', () => {
    expect(full).toHaveLength(56);
    expect(count(full, (e) => e.type)).toEqual({ Global: 24, Local: 24, Reveal: 8 });
    expect(mini).toHaveLength(18);
    expect(count(mini, (e) => e.type)).toEqual({ Global: 8, Local: 7, Reveal: 3 });
  });

  it('has unique instance ids', () => {
    for (const d of [full, mini]) expect(new Set(d.map((e) => e.id)).size).toBe(d.length);
  });

  const targets = (es: EventEffect[] = []) => es.flatMap((e) => ('target' in e ? [e.target] : []));

  it('has well-formed options', () => {
    for (const t of EVENT_TEMPLATES) {
      if (t.type === 'Reveal') {
        expect(t.options).toHaveLength(0);
        continue;
      }
      expect(t.options.map((o) => o.id)).toEqual(['A', 'B']);
      if (t.type === 'Global') expect(t.resolution).toBeDefined();
      else expect(t.resolution).toBeUndefined();
      for (const o of t.options) {
        expect(o.effects.length).toBeGreaterThan(0);
        const ts = targets(o.effects);
        const needsChoice = ts.includes('chosen') || ts.includes('randomOther') || o.effects.some((e) => e.kind === 'honorPromise');
        expect(!!o.chooseEmployee, `${t.templateId}/${o.id}`).toBe(needsChoice);
        // minority effects never need a choice, and only majority Globals have them (on both options)
        expect(targets(o.minorityEffects).filter((x) => x === 'chosen' || x === 'randomOther')).toEqual([]);
        expect(!!o.minorityEffects).toBe(t.resolution === 'majority');
        if (o.chooseDept) expect(t.type).toBe('Global');
      }
    }
  });
});
