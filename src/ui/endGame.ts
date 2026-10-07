// §68 end game: Takeover hero or Election scoring table, agendas revealed.
import type { GameView } from '../engine/types';
import { esc, colourNames, pname, type Handlers } from './helpers';

export function endGameHtml(view: GameView): string {
  if (view.phase !== 'gameOver') return '';
  const w = view.winner === null ? null : view.players[view.winner];
  const hero = w
    ? `<h1 class="hero" style="--pc:${esc(w.color)}">${esc(w.name.toUpperCase())} IS CEO</h1>`
    : '<h1 class="hero">No CEO this time</h1>';

  let table = '';
  if (view.scores) {
    const cols = ['Departments', 'Loyalists', 'Favorable', 'Rebels', 'Moles Planted', 'Secret Agenda', 'Total'];
    table = `<table class="scores"><thead><tr><th>Player</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>
      ${view.players.map(p => {
        const s = view.scores![String(p.id)];
        if (!s) return '';
        return `<tr class="${p.id === view.winner ? 'winner' : ''}"><td>${pname(view, p.id)}</td>
          <td>${s.departments}</td><td>${s.loyalists}</td><td>${s.favorable}</td><td>${s.rebels}</td><td>${s.molesPlanted}</td>
          <td>${s.agenda} ${s.agendaCompleted ? '<span class="good">✓</span>' : '<span class="bad">✗</span>'}</td><td><b>${s.total}</b></td></tr>`;
      }).join('')}</tbody></table>`;
  } else {
    // Takeover: plain stats per player.
    table = `<table class="scores"><thead><tr><th>Player</th><th>Departments</th><th>Loyalists</th><th>Favorable</th><th>Rebels</th><th>Active Moles</th></tr></thead><tbody>
      ${view.players.map(p => `<tr class="${p.id === view.winner ? 'winner' : ''}"><td>${pname(view, p.id)}${p.eliminated ? ' <span class="tag">out</span>' : ''}</td>
        <td>${p.controlledDepartments.length}</td><td>${p.loyalists}</td><td>${p.favorable}</td><td>${p.rebels}</td><td>${p.activeMoles ?? '—'}</td></tr>`).join('')}
      </tbody></table>`;
  }

  const agendas = view.players.filter(p => p.agenda).map(p => {
    const done = view.scores?.[String(p.id)]?.agendaCompleted;
    return `<li>${pname(view, p.id)}: <b>${esc(p.agenda!.name)}</b> — ${esc(p.agenda!.objective)} ${done === undefined ? '' : done ? '<span class="good">✓</span>' : '<span class="bad">✗</span>'}</li>`;
  }).join('');
  const highlights = view.log.filter(l => l.visibility === 'public' && l.tag && l.tag !== 'event').slice(-6).reverse();

  return `<div class="modal-backdrop"><div class="modal endgame" role="dialog" aria-label="Game over">
    ${hero}
    <div class="table-scroll">${table}</div>
    ${agendas ? `<div class="sec-title">Secret agendas</div><ul class="agendas">${agendas}</ul>` : ''}
    ${highlights.length ? `<div class="sec-title">Political highlights</div><ul class="recent">${highlights.map(l => `<li><span class="muted">R${l.round}</span> ${colourNames(view, l.text)}</li>`).join('')}</ul>` : ''}
    <div class="row"><button type="button" class="primary" data-act="back-to-lobby">Back to lobby</button></div>
  </div></div>`;
}

export const endGameActions: Handlers = {
  'back-to-lobby': (_el, c) => c.exit(),
};
