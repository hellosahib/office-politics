// §61–§62 event resolution + Global voting, eventTarget picking, revealChoice (§29).
import type { GameView } from '../engine/types';
import { TRAIT_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { deptName, esc, isMine, pendingPlayer, pname, ui, weightLabel, type Handlers } from './helpers';

export function eventHtml(view: GameView, client: GameClient): string {
  const ev = view.activeEvent;
  const p = view.pending;
  if (view.phase !== 'event' || (!ev && p.kind !== 'revealChoice')) return '';
  const mine = isMine(view, client);
  const who = pendingPlayer(p);

  if (ui.eventMin) {
    return `<div class="event-panel min"><button type="button" class="link" data-act="event-max">▸ Event: ${esc(ev?.card.title ?? 'Reveal')}${mine ? ' — your decision' : ''}</button></div>`;
  }

  const card = ev?.card;
  const type = card?.type ?? 'Reveal';
  const deptId = ev?.deptId ?? (p.kind === 'eventChoice' ? p.deptId : null);
  const target = type === 'Global'
    ? (card?.resolution === 'individual' ? 'Company-wide — each player decides for themselves' : 'Company-wide vote')
    : type === 'Local' ? `Department: <b>${deptName(view, deptId)}</b>` : 'A hidden trait comes to light';

  let body = '';
  if (card && card.options.length) {
    const canChoose = mine && p.kind === 'eventChoice';
    const myVote = client.me !== null ? ev!.votes[String(client.me)] : undefined;
    body += `<div class="event-options">${card.options.map(o => `
      <button type="button" class="big-choice${myVote === o.id || ev!.outcome === o.id || (p.kind === 'eventTarget' && p.optionId === o.id) ? ' on' : ''}" data-act="event-choice" data-id="${o.id}" ${canChoose ? '' : 'disabled'}>
        <span class="big-label">${o.id}. ${esc(o.label)}</span><span>${esc(o.text)}</span>
      </button>`).join('')}</div>`;
  }

  if (card?.type === 'Global' && ev) {
    const voters = view.players.filter(pl => !pl.eliminated);
    const opt = (id: 'A' | 'B') => esc(card.options.find(o => o.id === id)?.label ?? id);
    const tally = voters.map(pl => {
      const v = ev.votes[String(pl.id)];
      if (ev.votesVisible) return `${pname(view, pl.id)}: ${v ? `<b>${v}</b> ${opt(v)}` : '—'}`;
      return `${pname(view, pl.id)} ${v ? '✓' : '…'}`;
    }).join(' · ');
    body += `<div class="tally">${ev.votesVisible ? 'Votes' : 'Locked'}: ${tally}</div>`;
    if (ev.outcome) body += `<div class="outcome">Outcome: <b>${ev.outcome}. ${opt(ev.outcome)}</b></div>`;
  }

  if (p.kind === 'eventTarget') {
    if (mine) {
      const items = p.candidates.map(id => {
        const label = p.choose === 'employee'
          ? (() => { const e = view.employees.find(x => x.id === id); return `${esc(e?.name ?? id)} <span class="muted">${e?.loyalty ?? ''}</span>`; })()
          : deptName(view, id);
        return `<button type="button" class="chip" data-act="event-target" data-id="${esc(id)}">${label}</button>`;
      }).join('');
      body += `<div class="prompt">Choose ${p.choose === 'employee' ? 'an employee' : 'a department'} (here or on the board):</div><div class="chips">${items}</div>`;
    } else body += `<div class="muted">Waiting for ${pname(view, p.player)} to choose a ${p.choose}…</div>`;
  }

  if (p.kind === 'revealChoice') {
    if (mine) {
      const e = view.employees.find(x => x.id === p.employeeId);
      const me = view.players[client.me!];
      body += `<div class="reveal">You learned: <b>${esc(e?.name)}</b> is <b>${TRAIT_LABEL[p.trait]} ${weightLabel(p.weight)}</b></div>
        <div class="row">
          <button type="button" class="primary" data-act="reveal" data-mode="public">Reveal publicly (free)</button>
          <button type="button" data-act="reveal" data-mode="private" ${me.influence < 1 ? 'disabled title="Needs 1 Influence"' : ''}>Keep private (1 Influence)</button>
        </div>`;
    } else body += `<div class="muted">${pname(view, p.player)} is deciding whether to reveal what they learned…</div>`;
  } else if (p.kind === 'eventChoice' && !mine) {
    body += `<div class="muted">${card?.type === 'Global' ? `${pname(view, who)} is voting…` : `Waiting for ${pname(view, who)} to decide…`}</div>`;
  }

  return `<div class="event-panel" role="dialog" aria-label="Event">
    <div class="event-head"><span class="badge badge-${type.toLowerCase()}">${type}</span>
      <h2>${esc(card?.title ?? 'Reveal')}</h2>
      <button type="button" class="link" data-act="event-min" aria-label="Minimise event">▾</button></div>
    ${card ? `<p class="situation">${esc(card.situation)}</p>` : ''}
    <div class="event-target">${target}</div>
    ${body}
  </div>`;
}

export const eventActions: Handlers = {
  'event-choice': (el, c) => void c.act({ type: 'eventChoice', player: c.client.me!, optionId: el.dataset.id as 'A' | 'B' }),
  'event-target': (el, c) => void c.act({ type: 'eventTarget', player: c.client.me!, targetId: el.dataset.id! }),
  'reveal': (el, c) => void c.act({ type: 'revealChoice', player: c.client.me!, mode: el.dataset.mode as 'public' | 'private' }),
  'event-min': (_el, c) => { ui.eventMin = true; c.render(); },
  'event-max': (_el, c) => { ui.eventMin = false; c.render(); },
};
