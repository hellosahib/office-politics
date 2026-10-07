import type { GameClient } from './client';
import { mountLobby } from './ui/lobby';
import { mountGame } from './ui/game';

const app = document.getElementById('app')!;

function showLobby(): void {
  mountLobby(app, showGame);
}

function showGame(client: GameClient): void {
  mountGame(app, client, () => { client.leave(); showLobby(); });
}

showLobby();
