// §61–§62 event resolution + Global voting, eventTarget picking, revealChoice (§29).
// Three looks: Global = company-wide broadcast, Local = incident memo, Reveal = dossier that opens.
import type { DeptId, GameView } from '../engine/types';
import { TRAIT_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { portraitDataUrl } from '../board/portrait';
import { deptName, empBadges, esc, isMine, leadName, loyChip, pendingPlayer, pname, ui, weightLabel, type Handlers } from './helpers';
import { eventTargetTitle } from './picker';

/** Departments the event touches; Global (or unknown) → the viewer's own departments. */
function affectedDepts(view: GameView, client: GameClient): DeptId[] {
  const ev = view.activeEvent as (GameView['activeEvent'] & { affectedDeptIds?: DeptId[] }) | null;
  if (ev?.affectedDeptIds?.length) return ev.affectedDeptIds;
  const p = view.pending;
  const d = ev?.deptId ?? (p.kind === 'eventChoice' ? p.deptId : null);
  if (d) return [d];
  return client.me !== null ? view.players[client.me]?.controlledDepartments ?? [] : [];
}

/** Compact "Your team" strip: who the event can hit, so the choice is informed. Click = dossier. */
function teamStripHtml(view: GameView, client: GameClient): string {
  const depts = affectedDepts(view, client);
  if (!depts.length) return '';
  const global = view.activeEvent?.card.type === 'Global' && !view.activeEvent.deptId;
  const rows = depts.map(id => {
    const d = view.departments.find(x => x.id === id);
    if (!d) return '';
    const emps = d.employeeIds.map(eid => view.employees.find(e => e.id === eid)!).filter(Boolean).map(e => {
      const pc = e.politicalOwner !== null ? view.players[e.politicalOwner]?.color : null;
      return `<button type="button" class="ts-emp${ui.inspect === e.id ? ' on' : ''}" data-act="inspect" data-id="${esc(e.id)}" style="--pc:${esc(pc ?? 'var(--line-2)')}" title="Open ${esc(e.name)}'s file">
        <img src="${portraitDataUrl(e)}" alt="" width="34" height="42"><span class="ts-name">${esc(e.name.split(' ')[0])}${empBadges(e, ui.canAct)}</span>${loyChip(e.loyalty)}</button>`;
    }).join('');
    return `<div class="ts-dept"><div class="ts-head"><b>${esc(d.name)}</b><span class="muted small">Lead ${leadName(view, id)}</span></div><div class="ts-row">${emps}</div></div>`;
  }).join('');
  return `<div class="team-strip"><div class="sec-title">${global ? 'Your team' : 'Who this affects'}</div>${rows}</div>`;
}

const KICKER = { Global: 'All-hands broadcast', Local: 'Incident memo', Reveal: 'Personnel file' } as const;

export function eventHtml(view: GameView, client: GameClient): string {
  const ev = view.activeEvent;
  const p = view.pending;
  if (view.phase !== 'event' || (!ev && p.kind !== 'revealChoice') || ui.holdEvent) return '';
  const mine = isMine(view, client);
  const who = pendingPlayer(p);
  const card = ev?.card;
  const type = card?.type ?? 'Reveal';

  if (ui.eventMin) {
    return `<div class="event-panel min ev-${type.toLowerCase()}"><button type="button" class="link" data-act="event-max">▸ ${esc(KICKER[type])}: ${esc(card?.title ?? 'Reveal')}${mine ? ' (your decision)' : ''}</button></div>`;
  }

  const deptId = ev?.deptId ?? (p.kind === 'eventChoice' ? p.deptId : null);
  const target = type === 'Global'
    ? (card?.resolution === 'individual' ? 'Company-wide. Each player decides for themselves.' : 'Company-wide. Majority vote.')
    : type === 'Local' ? `Department: <b>${deptName(view, deptId)}</b>` : 'A hidden trait comes to light.';

  let body = '';
  if (card && card.options.length) {
    const canChoose = mine && p.kind === 'eventChoice';
    const myVote = client.me !== null ? ev!.votes[String(client.me)] : undefined;
    body += `<div class="event-options">${card.options.map(o => `
      <button type="button" class="big-choice opt${myVote === o.id || ev!.outcome === o.id || (p.kind === 'eventTarget' && p.optionId === o.id) ? ' on' : ''}" data-act="event-choice" data-id="${o.id}" ${canChoose ? '' : 'disabled'}>
        <span class="opt-key">${o.id}</span><span class="big-label">${esc(o.label)}</span><span class="opt-text">${esc(o.text)}</span>
      </button>`).join('')}</div>`;
  }

  if (card?.type === 'Global' && ev) {
    const voters = view.players.filter(pl => !pl.eliminated);
    const opt = (id: 'A' | 'B') => esc(card.options.find(o => o.id === id)?.label ?? id);
    const seats = voters.map(pl => {
      const v = ev.votes[String(pl.id)];
      const state = ev.votesVisible ? (v ? `<b>${v}</b> ${opt(v)}` : 'no vote') : v ? 'locked' : 'deciding';
      return `<li class="vote${v ? ' in' : ''}${ev.votesVisible ? ' shown' : ''}" style="--pc:${esc(pl.color)}">${pname(view, pl.id)}<span class="vote-state">${state}</span></li>`;
    }).join('');
    body += `<div class="tally"><div class="sec-title">${ev.votesVisible ? 'Votes revealed' : 'Secret ballot'}</div><ul class="votes">${seats}</ul></div>`;
    if (ev.outcome) body += `<div class="outcome" data-enter="outcome:${esc(card.id)}" data-anim="pop">Outcome <b>${ev.outcome}. ${opt(ev.outcome)}</b></div>`;
  }

  if (p.kind === 'eventTarget') {
    const ask = eventTargetTitle(card?.options.find(o => o.id === p.optionId), p.choose);
    body += mine
      ? `<div class="prompt">${esc(ask)} <span class="muted">Choose in the dialog.</span></div>`
      : `<div class="waiting-line">Waiting for ${pname(view, p.player)}: ${esc(ask.toLowerCase().replace(/\?$/, ''))}…</div>`;
  }

  if (p.kind === 'revealChoice') {
    if (mine) {
      const e = view.employees.find(x => x.id === p.employeeId);
      const me = view.players[client.me!];
      body += `<div class="dossier-page" data-enter="reveal:${esc(p.employeeId)}:${p.trait}" data-anim="flip">
          <div class="dossier-sub">Subject</div>
          <div class="dossier-name">${esc(e?.name)}</div>
          <div class="muted small">${esc(e?.role ?? '')}</div>
          <div class="stamp big">${TRAIT_LABEL[p.trait]} ${weightLabel(p.weight)}</div>
        </div>
        <div class="row">
          <button type="button" class="primary" data-act="reveal" data-mode="public">Reveal publicly (free)</button>
          <button type="button" data-act="reveal" data-mode="private" ${me.influence < 1 ? 'disabled title="Needs 1 Influence"' : ''}>Keep private (1 Influence)</button>
        </div>`;
    } else body += `<div class="waiting-line">${pname(view, p.player)} is deciding whether to reveal what they learned…</div>`;
  } else if (p.kind === 'eventChoice' && !mine) {
    body += `<div class="waiting-line">${card?.type === 'Global' ? `${pname(view, who)} is voting…` : `Waiting for ${pname(view, who)} to decide…`}</div>`;
  }

  const anim = type === 'Global' ? 'broadcast' : type === 'Local' ? 'memo' : 'dossier';
  return `<div class="event-panel ev-${type.toLowerCase()}" role="dialog" aria-label="Event" data-enter="event:${esc(card?.id ?? `reveal:${p.kind === 'revealChoice' ? p.employeeId : ''}`)}" data-anim="${anim}">
    <div class="ev-strip"><span class="ev-kicker">${type === 'Global' ? '<span class="live-dot" aria-hidden="true"></span>' : ''}${KICKER[type]}</span>
      ${type === 'Local' ? `<span class="ev-stamp">${deptName(view, deptId)}</span>` : ''}
      <button type="button" class="link ev-min" data-act="event-min" aria-label="Minimise event">▾</button></div>
    <div class="ev-body">
      <span class="badge badge-${type.toLowerCase()}">${type}</span>
      <h2 class="ev-title">${esc(card?.title ?? 'Reveal')}</h2>
      ${card ? `<p class="situation">${esc(card.situation)}</p>` : ''}
      <div class="event-target">${target}</div>
      ${body}
      ${type !== 'Reveal' ? teamStripHtml(view, client) : ''}
    </div>
  </div>`;
}

export const eventActions: Handlers = {
  'event-choice': (el, c) => void c.act({ type: 'eventChoice', player: c.client.me!, optionId: el.dataset.id as 'A' | 'B' }),
  'event-target': (el, c) => void c.act({ type: 'eventTarget', player: c.client.me!, targetId: el.dataset.id! }),
  'reveal': (el, c) => void c.act({ type: 'revealChoice', player: c.client.me!, mode: el.dataset.mode as 'public' | 'private' }),
  'event-min': (_el, c) => { ui.eventMin = true; c.render(); },
  'event-max': (_el, c) => { ui.eventMin = false; c.render(); },
  'inspect': (el, c) => { ui.inspect = el.dataset.id!; c.render(); },
};
