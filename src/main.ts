import type { GameClient } from './client';
import { mountLobby } from './ui/lobby';
import { mountGame } from './ui/game';
import { resumeLocalClient } from './net';

const app = document.getElementById('app')!;

function showLobby(): void {
  mountLobby(app, showGame);
  offerResume();
}

/** A reload must not lose a local game: offer to pick it up where it was. */
function offerResume(): void {
  const client = resumeLocalClient();
  if (!client || client.getView().phase === 'gameOver') return;
  const bar = document.createElement('div');
  bar.className = 'resume-bar';
  bar.innerHTML = '<span>You have an unfinished local game.</span><button type="button" data-resume>Resume</button><button type="button" data-discard>Discard</button>';
  bar.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('[data-resume]')) { bar.remove(); showGame(client); }
    else if (t.matches('[data-discard]')) { client.leave(); bar.remove(); }
  });
  document.body.append(bar);
}

function showGame(client: GameClient): void {
  mountGame(app, client, () => { client.leave(); showLobby(); });
}

showLobby();
