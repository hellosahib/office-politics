// §64 mole accusation: modal for the team lead, non-blocking banner for everyone else.
import type { GameView } from '../engine/types';
import type { GameClient } from '../client';
import { empName, isMine, pname, type Handlers } from './helpers';

export function accusationHtml(view: GameView, client: GameClient): string {
  const p = view.pending;
  if (p.kind !== 'accusation') return '';
  if (!isMine(view, client)) {
    return `<div class="banner">Accusation in progress: ${pname(view, p.player)} must name who planted the mole on <b>${empName(view, p.employeeId)}</b>.</div>`;
  }
  const others = view.players.filter(pl => pl.id !== p.player && !pl.eliminated);
  return `<div class="float-center accusation" role="dialog" aria-label="Accusation">
    <h2>Who planted this Mole?</h2>
    <p>A mole was exposed on <b>${empName(view, p.employeeId)}</b>. Your accusation is public.</p>
    <p class="muted small">Correct: the creator is revealed. Wrong: the creator stays hidden and the mole drops to Skeptical (unless already Rebel).</p>
    <div class="row">${others.map(pl => `<button type="button" class="big-btn" data-act="accuse" data-to="${pl.id}">${pname(view, pl.id)}</button>`).join('')}</div>
  </div>`;
}

export const accusationActions: Handlers = {
  'accuse': (el, c) => void c.act({ type: 'accuse', player: c.client.me!, accused: Number(el.dataset.to) }),
};
