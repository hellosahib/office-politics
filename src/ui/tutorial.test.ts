// The tutorial's script assumes things about its seed. If the engine's deal/draw rules change and this
// fails, search for a new seed with the same check (loop `fits(seed)` over 1..20000) and update TUTORIAL_SEED.
import { describe, expect, it } from 'vitest';
import { Game } from '../engine';
import { TUTORIAL_SEED, tutorialConfig } from './tutorial';

/** You move first; the first event is Local and both options ask for an employee; then a playable positive card. */
function fits(seed: number): boolean {
  const g = Game.create({ ...tutorialConfig('You'), seed });
  const p = g.state.pending;
  if (p.kind !== 'eventChoice' || p.player !== 0 || g.state.activeEvent?.card.type !== 'Local') return false;
  return (['A', 'B'] as const).every(opt => {
    const t = new Game(structuredClone(g.state));
    if (!t.dispatch({ type: 'eventChoice', player: 0, optionId: opt }).ok) return false;
    const q = t.state.pending;
    if (q.kind !== 'eventTarget' || q.choose !== 'employee') return false;
    t.dispatch({ type: 'eventTarget', player: 0, targetId: q.candidates[0] });
    const me = t.state.players[0];
    return t.state.pending.kind === 'play'
      && me.hand.some(c => c.direction === 'positive' && c.cost <= me.influence && t.legalTargets(0, c.id).length > 0);
  });
}

describe('tutorial seed', () => {
  it('still gives the scripted first turn', () => expect(fits(TUTORIAL_SEED)).toBe(true));
});
