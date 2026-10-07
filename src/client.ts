import type { Action, ActionResult, CardId, EmployeeId, GameConfig, GameView, PlayerId, Prediction } from './engine/types';

/**
 * Transport-agnostic handle the UI drives. Two implementations:
 *  - src/net/localClient.ts     hot-seat: `me` is the player the engine is waiting on (changes each turn)
 *  - src/net/firestoreClient.ts online:   `me` is this device's fixed seat
 * Bots are driven by whoever owns the bot seat (local: always; online: the host device).
 */
export interface GameClient {
  readonly kind: 'local' | 'online';
  /** Seat this client acts for right now. null = spectator. */
  readonly me: PlayerId | null;
  getView(): GameView;
  dispatch(action: Action): Promise<ActionResult>;
  /** Rules helpers for the hand UI / bots, evaluated for `me`. */
  legalTargets(cardId: CardId): EmployeeId[];
  predict(cardId: CardId, targetId: EmployeeId): Prediction;
  /** Called whenever the view may have changed. Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  leave(): void;
}

// ---------------------------------------------------------------- Lobby (online only)
export interface LobbyPlayer { uid: string; name: string; seat: PlayerId }

export interface Lobby {
  code: string;
  hostUid: string;
  players: LobbyPlayer[];
  config: Omit<GameConfig, 'seed' | 'players'>;
  status: 'waiting' | 'started';
}

export interface RoomHandle {
  readonly code: string;
  readonly isHost: boolean;
  readonly myUid: string;
  subscribe(listener: (lobby: Lobby) => void): () => void;
  /** Host only. Empty seats up to config.playerCount are filled with bots. */
  start(): Promise<void>;
  /** Resolves once the lobby status is 'started'. */
  client(): Promise<GameClient>;
  leave(): void;
}

/**
 * Implemented by src/net/index.ts:
 *   createLocalClient(config): GameClient
 *   isOnlineAvailable(): boolean                      // VITE_FIREBASE_* present
 *   createRoom(name, config): Promise<RoomHandle>
 *   joinRoom(code, name): Promise<RoomHandle>
 */
