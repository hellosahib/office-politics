// Hot-seat client: one Game in memory; `me` follows whoever the engine waits on.
import { Game, createRng, next } from '../engine';
import type { GameConfig, PlayerId } from '../engine/types';
import type { GameClient } from '../client';
import { BOT_DELAY_MS, MAX_BOT_RUN, botAction, botSeat } from './bots';

export function createLocalClient(config: GameConfig): GameClient {
  const game = Game.create(config);
  const botRng = createRng((config.seed ^ 0x5eed_b07) >>> 0); // seeded so sims/replays of bot play are reproducible
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let botRun = 0;

  const notify = () => listeners.forEach((l) => l());
  // While bots act, keep showing the last human seat so their private view never hits the screen.
  let lastHuman: PlayerId | null = (() => { const i = config.players.findIndex((p) => !p.isBot); return i < 0 ? null : i; })();
  const me = (): PlayerId | null => {
    const p = game.state.pending;
    if (p.kind === 'gameOver') return lastHuman;
    if (!config.players[p.player].isBot) lastHuman = p.player;
    return lastHuman;
  };

  function pump() {
    if (timer !== undefined) return;
    const seat = botSeat(game);
    if (seat === null) return;
    if (botRun >= MAX_BOT_RUN) return console.error(`bot loop stopped after ${MAX_BOT_RUN} actions`);
    timer = setTimeout(() => {
      timer = undefined;
      botRun++;
      const r = game.dispatch(botAction(game, seat, () => next(botRng)));
      if (!r.ok) { console.error('bot fallback rejected', r.error); botRun = MAX_BOT_RUN; }
      notify();
      pump();
    }, BOT_DELAY_MS);
  }
  pump(); // a bot may move first

  return {
    kind: 'local',
    get me() { return me(); },
    getView: () => game.view(me()),
    async dispatch(action) {
      const r = game.dispatch(action);
      if (r.ok) { botRun = 0; notify(); pump(); }
      return r;
    },
    legalTargets: (cardId) => { const m = me(); return m === null ? [] : game.legalTargets(m, cardId); },
    predict: (cardId, targetId) => game.predict(me() ?? 0, cardId, targetId),
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    leave() { clearTimeout(timer); timer = undefined; botRun = MAX_BOT_RUN; listeners.clear(); },
  };
}
