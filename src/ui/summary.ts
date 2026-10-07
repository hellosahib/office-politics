// §34 save screen (pending 'save') and §67 end-turn summary (pending 'summary').
import type { GameView } from '../engine/types';
import { MAX_RESERVE, RANK_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { cardHtml, deptName, empName, esc, isMine, ui, type Handlers } from './helpers';

export function saveHtml(view: GameView, client: GameClient): string {
  if (!isMine(view, client) || view.pending.kind !== 'save') return '';
  const me = view.players[client.me!];
  const room = MAX_RESERVE - me.reserveCount;
  const n = ui.saveIds.size;
  const canAdd = n < room && n < me.influence;
  const cards = (me.hand ?? []).map(c => {
    const on = ui.saveIds.has(c.id);
    return `<label class="save-item${on ? ' on' : ''}">
      <input type="checkbox" data-act="save-toggle" data-id="${esc(c.id)}" ${on ? 'checked' : ''} ${!on && !canAdd ? 'disabled' : ''}>
      ${cardHtml(c)}</label>`;
  }).join('');
  return `<div class="float-center save" role="dialog" aria-label="Save cards">
    <h2>Save cards</h2>
    <p class="muted">1 Influence per card. Unsaved cards are discarded. Reserve: ${me.reserveCount}/${MAX_RESERVE} used, room for ${room}. Influence left: ${me.influence}.</p>
    <div class="save-list">${cards || '<div class="muted">No cards left in hand.</div>'}</div>
    <div class="row"><span>Saving ${n} · cost ${n}</span>
      <button type="button" class="primary" data-act="save-confirm">Confirm</button></div>
  </div>`;
}

const list = (xs: string[]) => (xs.length ? xs.join(', ') : '—');

export function summaryHtml(view: GameView, client: GameClient): string {
  const s = view.turnSummary;
  if (!isMine(view, client) || view.pending.kind !== 'summary' || !s) return '';
  const rows: [string, string][] = [
    ['Influence spent', String(s.influenceSpent)],
    ['Cards played', list(s.cardsPlayed.map(esc))],
    ['Cards saved', list(s.cardsSaved.map(esc))],
    ['Employees changed', list(s.employeesChanged.map(c => `${empName(view, c.employeeId)}: ${c.from} → ${c.to}`))],
    ['New Rebels', list(s.newRebels.map(id => empName(view, id)))],
    ['Departments captured', list(s.departmentsCaptured.map(id => deptName(view, id)))],
    ['Departments lost', list(s.departmentsLost.map(id => deptName(view, id)))],
    ['Management penalty', s.managementPenalty ? '<span class="bad">Yes — Internal Instability</span>' : 'No'],
    ['Promises created', list(s.promisesCreated.map(id => empName(view, id)))],
    ['Promises resolved', list(s.promisesResolved.map(id => empName(view, id)))],
    ['Mole activity', list(s.moleActivity.map(esc))],
    ['Promotion', s.promotion ? `<b class="good">${RANK_LABEL[s.promotion]}</b>` : '—'],
  ];
  return `<div class="float-center summary" role="dialog" aria-label="Turn summary">
    <h2>Turn summary</h2>
    <table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
    <div class="row"><button type="button" class="primary" data-act="end-turn">End Turn</button></div>
  </div>`;
}

export const summaryActions: Handlers = {
  'save-toggle': (el, c) => {
    const id = el.dataset.id!;
    if (!ui.saveIds.delete(id)) ui.saveIds.add(id);
    c.render();
  },
  'save-confirm': (_el, c) => void c.act({ type: 'save', player: c.client.me!, cardIds: [...ui.saveIds] }),
  'end-turn': (_el, c) => void c.act({ type: 'endTurn', player: c.client.me! }),
};
