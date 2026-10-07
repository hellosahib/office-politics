// §64 mole accusation: boardroom modal for the team lead, non-blocking banner for everyone else.
import type { GameView } from '../engine/types';
import type { GameClient } from '../client';
import { empName, esc, isMine, pname, type Handlers } from './helpers';

export function accusationHtml(view: GameView, client: GameClient): string {
  const p = view.pending;
  if (p.kind !== 'accusation') return '';
  if (!isMine(view, client)) {
    return `<div class="banner" role="status">Accusation in progress: ${pname(view, p.player)} must name who planted the mole on <b>${empName(view, p.employeeId)}</b>.</div>`;
  }
  const others = view.players.filter(pl => pl.id !== p.player && !pl.eliminated);
  return `<div class="boardroom-backdrop"><div class="float-center sheet boardroom" role="dialog" aria-label="Accusation" data-enter="accuse:${esc(p.employeeId)}:${view.actionCount}" data-anim="boardroom">
    <div class="sheet-kicker bad">Mole exposed</div>
    <h2>Who planted this Mole?</h2>
    <p>A mole was found on <b>${empName(view, p.employeeId)}</b>. The whole table hears your accusation.</p>
    <div class="suspects">${others.map(pl => `<button type="button" class="suspect" data-act="accuse" data-to="${pl.id}" style="--pc:${esc(pl.color)}">
        <span class="suspect-chair" aria-hidden="true">${esc(pl.name.slice(0, 1).toUpperCase())}</span>${pname(view, pl.id)}<span class="suspect-cta">Accuse</span></button>`).join('')}</div>
    <p class="muted small">Correct: the planter is revealed. Wrong: the planter stays hidden and the employee drops to Skeptical (unless already Rebel).</p>
  </div></div>`;
}

export const accusationActions: Handlers = {
  'accuse': (el, c) => void c.act({ type: 'accuse', player: c.client.me!, accused: Number(el.dataset.to) }),
};
