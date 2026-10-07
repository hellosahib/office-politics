// Hot-seat pass-the-device curtain (D2). Local clients only.
import type { GameView } from '../engine/types';
import type { GameClient } from '../client';
import { esc, ui, type Handlers } from './helpers';

/**
 * Decides whether the curtain is up and sets `ui.canAct` (may this screen show `me`'s
 * private info and controls). Returns the curtain HTML or ''.
 */
export function curtainHtml(view: GameView, client: GameClient): string {
  const me = client.me;
  const seat = me === null ? null : view.players[me];
  if (client.kind === 'online') { ui.canAct = me !== null; return ''; }
  // Local: bot seats never get a curtain and never show their private info.
  if (!seat || seat.isBot) { ui.canAct = false; return ''; }
  const humans = view.players.filter(p => !p.isBot).length;
  if (humans <= 1 || view.phase === 'gameOver') ui.acceptedMe = me;
  ui.canAct = ui.acceptedMe === me;
  if (ui.canAct) return '';
  return `<div class="curtain" style="--pc:${esc(seat.color)}" role="dialog" aria-label="Pass the device">
    <div class="curtain-box">
      <div class="curtain-badge" aria-hidden="true"><span class="clip"></span>${esc(seat.name.slice(0, 1).toUpperCase())}</div>
      <div class="sheet-kicker">Eyes only</div>
      <h1>Pass the device to <span class="pname" style="--pc:${esc(seat.color)}">${esc(seat.name)}</span></h1>
      <p class="muted">Everyone else, look away. Private cards and intel are on the next screen.</p>
      <button type="button" class="primary big-btn" data-act="curtain-ok">I'm ${esc(seat.name)}</button>
    </div>
  </div>`;
}

export const curtainActions: Handlers = {
  'curtain-ok': (_el, c) => { ui.acceptedMe = c.client.me; c.render(); },
};
