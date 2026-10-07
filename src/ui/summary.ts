// §34 save screen (pending 'save') and §67 end-turn summary (pending 'summary') as a report sheet.
import type { GameView } from '../engine/types';
import { LOYALTY_LADDER, MAX_RESERVE, RANK_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { cardHtml, deptName, empName, esc, isMine, loyChip, ui, type Handlers } from './helpers';

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

interface Played { card: string; empId: string | null; target: string; band: string; from: string | null; to: string | null }

/** Card plays this turn, from the public narrative lines ("X played/used Card on Employee …"). */
function playsFromLog(view: GameView, player: number): Played[] {
  const name = view.players[player]?.name ?? '';
  const out: Played[] = [];
  for (const l of view.log) {
    if (l.round !== view.round || l.turn !== player || l.visibility !== 'public' || !l.text.startsWith(`${name} `)) continue;
    const m = /^.+? (?:played|used) (.+?) on (.+?)(?:[:.] |$)(.*)$/.exec(l.text);
    if (!m) continue;
    const e = view.employees.find(x => m[2].startsWith(x.name));
    if (!e) continue;
    const mv = /(\w+) → (\w+)/.exec(m[3]) ?? /from (\w+) to (\w+)/.exec(m[3]);
    const band = /Strong Success/.test(m[3]) ? 'Strong Success' : /Success/.test(m[3]) ? 'Standard Success'
      : /Blocked/.test(m[3]) ? 'Blocked' : /Fail/.test(m[3]) ? 'Failure' : mv && mv[1] !== mv[2] ? 'Success' : 'No effect';
    out.push({ card: m[1], empId: e.id, target: e.name, band, from: mv?.[1] ?? null, to: mv?.[2] ?? null });
  }
  return out;
}

const BAND_CLS: Record<string, string> = { 'Strong Success': 'gold', 'Standard Success': 'good', Success: 'good', 'No effect': 'bad', Failure: 'bad', Blocked: 'bad' };

export function summaryHtml(view: GameView, client: GameClient): string {
  const s = view.turnSummary;
  if (!isMine(view, client) || view.pending.kind !== 'summary' || !s) return '';
  const pl = view.players[s.player];
  const emp = (id: string) => view.employees.find(e => e.id === id);
  const dOf = (id: string) => deptName(view, emp(id)?.deptId);
  const sec = (title: string, body: string, cls = '') => `<section class="rp-sec ${cls}"><h3 class="rp-title">${title}</h3>${body}</section>`;
  const thisTurn = view.log.filter(l => l.round === view.round && l.turn === s.player);
  const upkeep = thisTurn.map(l => /pays (\d+) Influence in management cost/.exec(l.text)).find(Boolean);

  // Influence
  const infl = `<div class="rp-kpis">
      <div class="kpi"><span class="num">${s.influenceSpent}</span><span class="label">Spent</span></div>
      <div class="kpi"><span class="num">${pl?.influence ?? 0}</span><span class="label">Remaining</span></div>
      <div class="kpi"><span class="num">${upkeep ? upkeep[1] : 0}</span><span class="label">Upkeep paid</span></div></div>
    ${s.managementPenalty ? '<p class="rp-warn bad">Couldn\'t pay upkeep: <b>Internal Instability</b> hit one of your departments.</p>' : ''}
    ${s.cardsSaved.length ? `<p class="small muted">Saved to reserve: ${s.cardsSaved.map(esc).join(', ')}</p>` : ''}`;

  // Cards played
  const plays = playsFromLog(view, s.player);
  const playRows = plays.length
    ? plays.map(p => `<li class="rp-play"><span class="rp-card">${esc(p.card)}</span><span class="arr">→</span>
        <span><b>${esc(p.target)}</b> <span class="muted small">(${p.empId ? dOf(p.empId) : ''})</span></span>
        <span class="rp-band ${BAND_CLS[p.band] ?? ''}">${p.band}</span>
        ${p.from && p.to ? `<span class="rp-move">${loyChip(p.from)}<span class="arr">→</span>${loyChip(p.to)}</span>` : '<span class="muted small">no change</span>'}</li>`).join('')
    : s.cardsPlayed.map(c => `<li class="rp-play"><span class="rp-card">${esc(c)}</span></li>`).join('');

  // Loyalty changes, grouped by department
  const byDept = new Map<string, typeof s.employeesChanged>();
  for (const c of s.employeesChanged) { const d = emp(c.employeeId)?.deptId ?? '?'; byDept.set(d, [...(byDept.get(d) ?? []), c]); }
  const step = (l: string) => LOYALTY_LADDER.indexOf(l as typeof LOYALTY_LADDER[number]);
  const changes = [...byDept].map(([d, cs]) => `<div class="rp-dept"><div class="rp-dept-name">${deptName(view, d)}</div><ul class="rp-list">${cs.map(c => {
    const e = emp(c.employeeId);
    const up = step(c.to) > step(c.from);
    const pc = e?.politicalOwner != null ? view.players[e.politicalOwner]?.color : null;
    return `<li><span class="rp-dot" style="--pc:${esc(pc ?? 'var(--ink-3)')}"></span><b>${empName(view, c.employeeId)}</b>
      <span class="rp-move">${loyChip(c.from)}<span class="arr ${up ? 'good' : 'bad'}">${up ? '▲' : '▼'}</span>${loyChip(c.to)}</span></li>`;
  }).join('')}</ul></div>`).join('');

  const names = (ids: string[]) => ids.map(id => `<b>${empName(view, id)}</b> <span class="muted small">(${dOf(id)})</span>`).join(', ');
  const parts = [
    sec('Influence', infl),
    playRows ? sec('Cards played', `<ul class="rp-list">${playRows}</ul>`) : '',
    changes ? sec('Loyalty changes', changes) : '',
    s.newRebels.length ? sec('New Rebels', `<p>${names(s.newRebels)}</p>`, 'bad') : '',
    s.departmentsCaptured.length || s.departmentsLost.length ? sec('Departments', `<p>
      ${s.departmentsCaptured.length ? `<span class="good">Captured</span> ${s.departmentsCaptured.map(d => `<b>${deptName(view, d)}</b>`).join(', ')}` : ''}
      ${s.departmentsLost.length ? `<span class="bad">Lost</span> ${s.departmentsLost.map(d => `<b>${deptName(view, d)}</b>`).join(', ')}` : ''}</p>`) : '',
    s.promisesCreated.length || s.promisesResolved.length ? sec('Promises', `<p>
      ${s.promisesCreated.length ? `★ Made to ${names(s.promisesCreated)}` : ''}
      ${s.promisesResolved.length ? `<br>Resolved: ${names(s.promisesResolved)}` : ''}</p>`, 'gold') : '',
    s.moleActivity.length ? sec('Mole activity <span class="tag-private">private</span>', `<ul class="rp-list">${s.moleActivity.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`, 'mole') : '',
    s.promotion ? sec('Promotion', `<p class="rp-promo">You are now <b>${RANK_LABEL[s.promotion]}</b></p>`, 'gold') : '',
  ].join('');

  return `<div class="float-center sheet report" role="dialog" aria-label="Turn summary" data-enter="summary:${view.actionCount}:${client.me}" data-anim="report">
    <div class="report-head"><span class="sheet-kicker">End of turn report</span><span class="report-ref">${s.cardsPlayed.length} card${s.cardsPlayed.length === 1 ? '' : 's'} · ${s.employeesChanged.length} moved</span></div>
    <h2>Round ${view.round} — ${esc(pl?.name ?? '')}'s turn</h2>
    <div class="rp-body" data-scroll="report">${parts}</div>
    <div class="row sheet-foot"><span class="muted small">Review, then pass the turn.</span><button type="button" class="primary big-btn" data-act="end-turn">End turn</button></div>
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
