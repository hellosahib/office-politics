// Top bar + §65 player dashboard (own private stats, intel with expose) + public player list.
import type { GameView, Pending, TraitPole } from '../engine/types';
import { MAX_RESERVE, RANK_LABEL, TRAIT_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { deptName, empName, esc, isMine, pendingPlayer, pname, ui, weightLabel, type Handlers } from './helpers';

const PHASE_LABEL: Record<Pending['kind'], string> = {
  eventChoice: 'Event', eventTarget: 'Event', revealChoice: 'Reveal', play: 'Play cards',
  save: 'Save cards', summary: 'End of turn', accusation: 'Accusation', gameOver: 'Game over',
};

export function topbarHtml(view: GameView, client: GameClient): string {
  const me = client.me === null ? null : view.players[client.me];
  const waitingOn = pendingPlayer(view.pending);
  const round = view.maxRounds ? `Round ${view.round} / ${view.maxRounds}` : `Round ${view.round}`;
  const waiting = waitingOn !== null && !isMine(view, client) && view.phase !== 'gameOver'
    ? `<span class="chip waiting">Waiting for ${pname(view, waitingOn)}…</span>` : '';
  return `<button type="button" class="tb-toggle" data-act="toggle-dash" aria-pressed="${ui.showDash}">☰</button>
    <span class="tb-item"><b>${round}</b></span>
    <span class="tb-item">Turn: ${pname(view, view.currentPlayer)}</span>
    <span class="tb-item muted">${PHASE_LABEL[view.pending.kind]}</span>
    <span class="tb-item muted hide-sm">${esc(view.config.mode)}${view.config.board === 'mini' ? ' · mini' : ''}</span>
    ${waiting}
    <span class="spacer"></span>
    ${me && ui.canAct ? `<span class="tb-item hide-sm">You: ${pname(view, me.id)}</span>` : ''}
    <button type="button" class="tb-help" data-act="help" title="How to play" aria-label="How to play">?</button>
    <button type="button" class="tb-toggle" data-act="toggle-log" aria-pressed="${ui.showLog}">Log</button>
    <button type="button" class="link" data-act="leave">Leave</button>`;
}

export function dashboardHtml(view: GameView, client: GameClient): string {
  const me = client.me === null ? null : view.players[client.me];
  let mine = '';
  if (me && ui.canAct) {
    const myTurn = isMine(view, client);
    const status = view.phase === 'gameOver' ? 'Game over'
      : myTurn ? `Your turn — ${PHASE_LABEL[view.pending.kind]}` : `Waiting for ${pname(view, pendingPlayer(view.pending))}`;
    const canExpose = myTurn && view.pending.kind === 'play';
    const intel = (me.intel ?? []).map(i => {
      const e = view.employees.find(x => x.id === i.employeeId);
      const already = (e?.hiddenTrait1 === i.trait && e.hiddenTrait1Public) || (e?.hiddenTrait2 === i.trait && e.hiddenTrait2Public);
      return `<li>${empName(view, i.employeeId)}: ${TRAIT_LABEL[i.trait]} <span class="muted">${weightLabel(i.weight)}</span>
        ${canExpose && !already ? `<button type="button" class="link" data-act="expose" data-id="${esc(i.employeeId)}" data-trait="${i.trait}">Expose publicly</button>` : ''}
        ${already ? '<span class="muted small">public</span>' : ''}</li>`;
    }).join('');
    mine = `<div class="me-card" style="--pc:${esc(me.color)}">
      <div class="me-name">${pname(view, me.id)} <span class="muted">${RANK_LABEL[me.rank]}</span></div>
      <div class="turn-status">${status}</div>
      <table class="kv">
        <tr><th>Influence</th><td><b>${me.influence}</b> / ${me.influenceMax}</td></tr>
        <tr><th>Departments</th><td>${me.controlledDepartments.map(d => deptName(view, d)).join(', ') || '—'}</td></tr>
        <tr><th>Management cost</th><td>${me.managementCost}</td></tr>
        <tr><th>Saved cards</th><td>${me.reserveCount} / ${MAX_RESERVE}</td></tr>
        <tr><th>Loyalists</th><td>${me.loyalists}</td></tr>
        <tr><th>Favorable</th><td>${me.favorable}</td></tr>
        <tr><th>Rebels</th><td>${me.rebels}</td></tr>
        <tr><th>Active moles</th><td>${me.activeMoles ?? 0}</td></tr>
      </table>
      ${me.agenda ? `<div class="agenda"><div class="sec-title">Secret agenda</div><b>${esc(me.agenda.name)}</b><div class="small">${esc(me.agenda.objective)}</div></div>` : ''}
      ${intel ? `<div class="sec-title">Private intel</div><ul class="intel">${intel}</ul>` : ''}
    </div>`;
  }
  const players = view.players.map(p => `<li class="pl${p.eliminated ? ' out' : ''}${p.id === view.currentPlayer ? ' current' : ''}">
      ${pname(view, p.id)}${p.isBot ? ' <span class="tag">bot</span>' : ''}${p.eliminated ? ' <span class="tag">out</span>' : ''}
      <div class="small muted">${RANK_LABEL[p.rank]} · ${p.controlledDepartments.length} dept · ${p.influence}/${p.influenceMax} inf · hand ${p.handCount} · saved ${p.reserveCount}</div>
    </li>`).join('');
  return `${mine}<div class="sec-title">Players</div><ul class="players">${players}</ul>`;
}

export const dashboardActions: Handlers = {
  'toggle-dash': (_el, c) => { ui.showDash = !ui.showDash; c.render(); },
  'toggle-log': (_el, c) => { ui.showLog = !ui.showLog; c.render(); },
  'leave': (_el, c) => { if (confirm('Leave this game?')) c.exit(); },
  'expose': (el, c) => void c.act({ type: 'exposeIntel', player: c.client.me!, employeeId: el.dataset.id!, trait: el.dataset.trait as TraitPole }),
};
