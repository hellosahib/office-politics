import { beforeEach, expect, test } from 'vitest';
import { createLocalClient, resumeLocalClient } from './localClient';
import type { GameConfig } from '../engine/types';

// Minimal sessionStorage shim: vitest runs in node.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const config: GameConfig = {
  playerCount: 3, mode: 'Takeover', seed: 42, board: 'full',
  players: [{ name: 'A', isBot: false }, { name: 'B', isBot: false }, { name: 'C', isBot: false }],
};

test('a local game survives a reload and leave() forgets it', async () => {
  const c = createLocalClient(config);
  const before = c.getView();
  const first = before.pending;
  if (first.kind === 'eventChoice') await c.dispatch({ type: 'eventChoice', player: first.player, optionId: 'A' });
  const resumed = resumeLocalClient();
  expect(resumed).not.toBeNull();
  expect(resumed!.getView().actionCount).toBe(c.getView().actionCount);
  expect(JSON.stringify(resumed!.getView())).toBe(JSON.stringify(c.getView()));
  c.leave();
  expect(resumeLocalClient()).toBeNull();
});
