// §34 save screen (pending 'save') and §67 end-turn summary (pending 'summary') as a report sheet.
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
  return `<div class="float-center sheet save" role="dialog" aria-label="Save cards" data-enter="save:${view.actionCount}:${client.me}" data-anim="rise">
    <div class="sheet-kicker">Before you go</div>
    <h2>Save cards to your reserve</h2>
    <p class="muted">1 Influence per card; unsaved cards are discarded. Reserve ${me.reserveCount}/${MAX_RESERVE}, room for ${room}. Influence left: ${me.influence}.</p>
    <div class="save-list">${cards || '<div class="muted">No cards left in hand.</div>'}</div>
    <div class="row sheet-foot"><span>Saving <b class="num">${n}</b> · cost <b class="num">${n}</b></span>
      <button type="button" class="primary" data-act="save-confirm">Confirm</button></div>
  </div>`;
}

const list = (xs: string[]) => (xs.length ? xs.join(', ') : '<span class="nil">none</span>');

export function summaryHtml(view: GameView, client: GameClient): string {
  const s = view.turnSummary;
  if (!isMine(view, client) || view.pending.kind !== 'summary' || !s) return '';
  const change = s.employeesChanged.map(c => `<li><b>${empName(view, c.employeeId)}</b> <span class="loy loy-${c.from}">${c.from}</span> → <span class="loy loy-${c.to}">${c.to}</span></li>`).join('');
  const kpi = (label: string, value: string | number, cls = '') => `<div class="kpi ${cls}"><span class="num">${value}</span><span class="label">${label}</span></div>`;
  const rows: [string, string, string?][] = [
    ['Cards played', list(s.cardsPlayed.map(esc))],
    ['Cards saved', list(s.cardsSaved.map(esc))],
    ['New Rebels', list(s.newRebels.map(id => empName(view, id))), s.newRebels.length ? 'bad' : ''],
    ['Departments captured', list(s.departmentsCaptured.map(id => deptName(view, id))), s.departmentsCaptured.length ? 'good' : ''],
    ['Departments lost', list(s.departmentsLost.map(id => deptName(view, id))), s.departmentsLost.length ? 'bad' : ''],
    ['Management penalty', s.managementPenalty ? 'Yes: Internal Instability' : '<span class="nil">no</span>', s.managementPenalty ? 'bad' : ''],
    ['Promises created', list(s.promisesCreated.map(id => empName(view, id)))],
    ['Promises resolved', list(s.promisesResolved.map(id => empName(view, id)))],
    ['Mole activity', list(s.moleActivity.map(esc)), s.moleActivity.length ? 'mole' : ''],
    ['Promotion', s.promotion ? RANK_LABEL[s.promotion] : '<span class="nil">none</span>', s.promotion ? 'gold' : ''],
  ];
  return `<div class="float-center sheet report" role="dialog" aria-label="Turn summary" data-enter="summary:${view.actionCount}:${client.me}" data-anim="report">
    <div class="report-head"><span class="sheet-kicker">End of turn report</span><span class="report-ref">Round ${view.round} · ${esc(view.players[s.player]?.name ?? '')}</span></div>
    <h2>Turn summary</h2>
    <div class="kpis">${kpi('Influence spent', s.influenceSpent)}${kpi('Cards played', s.cardsPlayed.length)}${kpi('Employees moved', s.employeesChanged.length)}${kpi('Captured', s.departmentsCaptured.length, s.departmentsCaptured.length ? 'good' : '')}</div>
    ${change ? `<div class="sec-title">Employees changed</div><ul class="changes">${change}</ul>` : ''}
    <table class="kv report-kv">${rows.map(([k, v, cls]) => `<tr class="${cls ?? ''}"><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
    <div class="row sheet-foot"><span class="muted small">Review, then pass the turn.</span><button type="button" class="primary" data-act="end-turn">End Turn</button></div>
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
