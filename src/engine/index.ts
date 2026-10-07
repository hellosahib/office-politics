// Public engine surface. Implemented in ./game.ts.
//
//   const game = Game.create(config);
//   game.dispatch({ type: 'focus', player: 0, focus: 'Expand' });   // -> { ok, error? }
//   game.view(0)                                                     // filtered GameView for player 0
//   game.legalTargets(0, cardId)                                     // EmployeeId[]
//   game.predict(0, cardId, targetId)                                // Prediction
//   Game.replay(config, actions)                                     // net layer: rebuild from action log
//   new Game(state)                                                  // rehydrate from a saved GameState
//
export { Game } from './game';
export * from './types';
export { createRng, next, nextInt, pick, shuffle, randomModifier } from './rng';
