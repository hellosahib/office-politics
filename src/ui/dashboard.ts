// Top bar HUD + §65 player dashboard (own private stats, intel with expose) + public player list.
import type { GameView, Pending, TraitPole } from '../engine/types';
import { MAX_RESERVE, RANK_LABEL, TRAIT_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { portraitDataUrl } from '../board/portrait';
import { deptName, empName, esc, glyph, isMine, meterHtml, pendingPlayer, pname, ui, weightLabel, type Handlers } from './helpers';

const PHASE_LABEL: Record<Pending['kind'], string> = {
  eventChoice: 'Event', eventTarget: 'Event', revealChoice: 'Reveal', play: 'Play cards',
  save: 'Save cards', summary: 'End of turn', accusation: 'Accusation', gameOver: 'Game over',
};
const I = {
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  log: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7M9 8h3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4M12 17h.01"/>',
  exit: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
};

export function topbarHtml(view: GameView, client: GameClient): string {
  const me = client.me === null ? null : view.players[client.me];
  const waitingOn = pendingPlayer(view.pending);
  const waiting = waitingOn !== null && !isMine(view, client) && view.phase !== 'gameOver'
    ? `<span class="tb-wait">Waiting for ${pname(view, waitingOn)}<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></span>` : '';
  const yourMove = isMine(view, client) && view.phase !== 'gameOver';
  return `<button type="button" class="icon-btn tb-toggle" data-act="toggle-dash" aria-pressed="${ui.showDash}" aria-label="Dashboard">${glyph(I.menu)}</button>
    <span class="tb-brand hide-sm" aria-hidden="true">OP</span>
    <span class="tb-round"><span class="k">Round</span> <b class="num">${view.round}</b>${view.maxRounds ? `<span class="k">/${view.maxRounds}</span>` : ''}</span>
    <span class="tb-turn" style="--pc:${esc(view.players[view.currentPlayer]?.color ?? '#888')}">${pname(view, view.currentPlayer)}</span>
    <span class="tb-phase${yourMove ? ' live' : ''}">${PHASE_LABEL[view.pending.kind]}</span>
    <span class="tb-mode hide-sm">${esc(view.config.mode)}${view.config.board === 'mini' ? ' · mini' : ''}</span>
    ${waiting}
    <span class="spacer"></span>
    ${me && ui.canAct ? `<span class="tb-you hide-sm">You are ${pname(view, me.id)}</span>` : ''}
    <button type="button" class="icon-btn tb-help" data-act="help" title="How to play" aria-label="How to play">${glyph(I.help)}</button>
    <button type="button" class="icon-btn tb-toggle" data-act="toggle-log" aria-pressed="${ui.showLog}" aria-label="Political log">${glyph(I.log)}</button>
    <button type="button" class="icon-btn" data-act="leave" title="Leave game" aria-label="Leave game">${glyph(I.exit)}</button>`;
}

export function dashboardHtml(view: GameView, client: GameClient): string {
  const me = client.me === null ? null : view.players[client.me];
  let mine = '';
  if (me && ui.canAct) {
    const myTurn = isMine(view, client);
    const status = view.phase === 'gameOver' ? 'Game over'
      : myTurn ? `Your move: ${PHASE_LABEL[view.pending.kind]}` : `Waiting for ${pname(view, pendingPlayer(view.pending))}`;
    const canExpose = myTurn && view.pending.kind === 'play';
    // "Your intel": newest first, each with portrait, department and the trait it revealed.
    // ponytail: entries carrying deptId come from the newer engine, which already sorts newest first.
    const raw = me.intel ?? [];
    const intel = (raw.length && 'deptId' in raw[0] ? raw : [...raw].reverse()).map(i => {
      const e = view.employees.find(x => x.id === i.employeeId);
      const already = (e?.hiddenTrait1 === i.trait && e.hiddenTrait1Public) || (e?.hiddenTrait2 === i.trait && e.hiddenTrait2Public);
      return `<li class="intel-item">${e ? `<img src="${portraitDataUrl(e)}" alt="" width="30" height="38">` : ''}
        <div class="intel-body"><button type="button" class="link intel-who" data-act="inspect" data-id="${esc(i.employeeId)}">${empName(view, i.employeeId)}</button>
          <span class="muted small">${deptName(view, e?.deptId)}</span>
          <span class="tchip">${TRAIT_LABEL[i.trait]} <span class="w">${weightLabel(i.weight)}</span>${already ? ' <span class="tmark">public</span>' : ' <span class="tmark lock">🔒</span>'}</span>
          ${canExpose && !already ? `<button type="button" class="link" data-act="expose" data-id="${esc(i.employeeId)}" data-trait="${i.trait}">Expose publicly</button>` : ''}</div></li>`;
    }).join('');
    const tile = (label: string, value: string | number, cls = '') => `<div class="stat ${cls}"><span class="num">${value}</span><span class="label">${label}</span></div>`;
    mine = `<section class="me-card" style="--pc:${esc(me.color)}">
      <header class="me-head">
        <span class="me-avatar" aria-hidden="true">${esc(me.name.slice(0, 1).toUpperCase())}</span>
        <div><div class="me-name">${esc(me.name)}</div><div class="rank">${RANK_LABEL[me.rank]}</div></div>
      </header>
      <div class="turn-status${myTurn ? ' live' : ''}">${status}</div>
      ${view.currentPlayer === me.id
        ? `<div class="stat-infl"><span class="label">Influence</span><span class="num">${me.influence}</span><span class="of">/ ${me.influenceMax}</span>
        ${meterHtml(`infl:${me.id}`, me.influence, me.influenceMax)}</div>`
        : `<div class="stat-infl idle"><span class="label">Influence</span><span class="num">${me.influenceMax}</span><span class="of">not your turn</span></div>`}
      <div class="stat-grid">
        ${tile('Depts', me.controlledDepartments.length)}${tile('Upkeep', me.managementCost)}${tile('Saved', `${me.reserveCount}/${MAX_RESERVE}`)}
        ${tile('Loyal', me.loyalists, 'gold')}${tile('Favorable', me.favorable, 'good')}${tile('Rebels', me.rebels, me.rebels ? 'bad' : '')}
        ${tile('Moles', me.activeMoles ?? 0, me.activeMoles ? 'mole' : '')}
      </div>
      <div class="depts-line"><span class="label">Departments</span> ${me.controlledDepartments.map(d => deptName(view, d)).join(', ') || '<span class="muted">none</span>'}</div>
      ${me.agenda ? `<div class="agenda"><div class="agenda-seal">Secret agenda</div><b>${esc(me.agenda.name)}</b><div class="small">${esc(me.agenda.objective)}</div></div>` : ''}
      ${intel ? `<div class="sec-title">Your intel <span class="tag-private">private</span></div><ul class="intel">${intel}</ul>` : ''}
    </section>`;
  }
  const players = view.players.map(p => `<li class="pl${p.eliminated ? ' out' : ''}${p.id === view.currentPlayer ? ' current' : ''}" style="--pc:${esc(p.color)}">
      <div class="pl-top">${pname(view, p.id)}${p.isBot ? ' <span class="tag">bot</span>' : ''}${p.eliminated ? ' <span class="tag">out</span>' : ''}<span class="pl-rank">${RANK_LABEL[p.rank]}</span></div>
      <div class="pl-stats"><span title="Departments"><b>${p.controlledDepartments.length}</b> dept</span>${p.id === view.currentPlayer
        ? `<span title="Influence this turn"><b>${p.influence}</b>/${p.influenceMax} inf</span>`
        : `<span class="idle" title="Influence per turn (not their turn)"><b>${p.influenceMax}</b> inf</span>`}<span title="Cards in hand"><b>${p.handCount}</b> hand</span><span title="Saved cards"><b>${p.reserveCount}</b> saved</span></div>
    </li>`).join('');
  return `${mine}<div class="sec-title">Players</div><ul class="players">${players}</ul>`;
}

export const dashboardActions: Handlers = {
  'toggle-dash': (_el, c) => { ui.showDash = !ui.showDash; c.render(); },
  'toggle-log': (_el, c) => { ui.showLog = !ui.showLog; c.render(); },
  'leave': (_el, c) => { if (confirm('Leave this game?')) c.exit(); },
  'expose': (el, c) => void c.act({ type: 'exposeIntel', player: c.client.me!, employeeId: el.dataset.id!, trait: el.dataset.trait as TraitPole }),
};
