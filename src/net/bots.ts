// Bot driving shared by the local and online clients.
import { Game } from '../engine';
import type { Action, GameView, PlayerId } from '../engine/types';
import { decide } from '../bot/bot';

export const BOT_DELAY_MS = 150;
/** Runaway guard: bot actions allowed between two human actions. */
export const MAX_BOT_RUN = 200;

/** Seat of the bot the engine is waiting on, or null. */
export function botSeat(game: Game): PlayerId | null {
  const s = game.state;
  const p = s.pending;
  if (s.phase === 'gameOver' || p.kind === 'gameOver') return null;
  return s.config.players[p.player]?.isBot ? p.player : null;
}

/** Bot's choice, checked on a throwaway copy; falls back to the safest legal move. */
export function botAction(game: Game, seat: PlayerId, rng: () => number): Action {
  const view = game.view(seat);
  try {
    const a = decide(view, { legalTargets: (c) => game.legalTargets(seat, c), predict: (c, t) => game.predict(seat, c, t) }, rng);
    const r = new Game(structuredClone(game.state)).dispatch(a);
    if (r.ok) return a;
    console.warn('bot chose an illegal action, falling back', a, r.error);
  } catch (e) {
    console.warn('bot crashed, falling back', e);
  }
  return fallbackAction(view, seat);
}

export function fallbackAction(view: GameView, player: PlayerId): Action {
  const p = view.pending;
  switch (p.kind) {
    case 'play': return p.focus === null ? { type: 'focus', player, focus: 'Manage' } : { type: 'donePlaying', player };
    case 'summary': return { type: 'endTurn', player };
    case 'save': return { type: 'save', player, cardIds: [] };
    case 'eventChoice': return { type: 'eventChoice', player, optionId: 'A' };
    case 'revealChoice': return { type: 'revealChoice', player, mode: 'public' };
    case 'eventTarget': return { type: 'eventTarget', player, targetId: p.candidates[0] };
    case 'accusation': return { type: 'accuse', player, accused: view.players.find((x) => x.id !== player)!.id };
    case 'gameOver': throw new Error('game over');
  }
}
