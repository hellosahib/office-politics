// §60 influence hand: pick a card → the target picker (src/ui/picker.ts) opens → play.
// No Manage/Expand focus any more: a card's direction decides who it can target.
import type { EmployeeId, GameView, InfluenceCard, PlayerView } from '../engine/types';
import { MAX_RESERVE } from '../engine/types';
import type { GameClient } from '../client';
import { play as sfx } from './sound';
import { cardHtml, esc, isMine, meterHtml, motionOK, noTargetsText, pname, ui, type Handlers } from './helpers';

/** Is it my play phase? */
export function canPlay(view: GameView, client: GameClient): boolean {
  return isMine(view, client) && view.pending.kind === 'play';
}

/** Legal targets + a human reason when the card can't be played right now. */
export function cardStatus(view: GameView, client: GameClient, me: PlayerView, c: InfluenceCard): { targets: EmployeeId[]; reason: string | null } {
  if (c.cost > me.influence) return { targets: [], reason: `Needs ${c.cost} Influence (you have ${me.influence})` };
  const targets = client.legalTargets(c.id);
  return { targets, reason: targets.length ? null : noTargetsText(c) };
}

export function handHtml(view: GameView, client: GameClient): string {
  const me = client.me === null ? null : view.players[client.me];
  if (!ui.canAct || !me || !me.hand) return '';
  const playing = canPlay(view, client);
  const myPlay = isMine(view, client) && view.pending.kind === 'play';
  const all = [...me.hand, ...(me.reserve ?? [])];

  const status = new Map(all.map(c => [c.id, playing ? cardStatus(view, client, me, c) : { targets: [], reason: null }]));
  const one = (c: InfluenceCard, extra = '') => cardHtml(c, {
    act: playing ? 'card' : undefined,
    selected: c.id === ui.selectedCard,
    disabled: status.get(c.id)!.reason,
    extra,
  });

  const others = view.players.filter(p => p.id !== me.id && !p.eliminated);
  const reserve = (me.reserve ?? []).map(c => {
    if (!myPlay) return one(c);
    const give = ui.giveCard === c.id
      ? `<div class="give">Give to ${others.map(p => `<button type="button" class="chip" data-act="give" data-id="${esc(c.id)}" data-to="${p.id}" ${p.reserveCount >= MAX_RESERVE ? 'disabled title="Reserve full"' : ''}>${pname(view, p.id)}</button>`).join('')}
         <button type="button" class="link" data-act="give-cancel">Cancel</button></div>`
      : `<button type="button" class="link give-btn" data-act="give-open" data-id="${esc(c.id)}">Give to…</button>`;
    return one(c, give);
  }).join('');

  const active = view.currentPlayer === me.id;
  return `<div class="hand-head">
      <button type="button" class="hand-toggle" data-act="toggle-hand" aria-expanded="${ui.handOpen}">
        <span class="chev" aria-hidden="true">${ui.handOpen ? '▾' : '▴'}</span> Hand <b class="num">${me.hand.length}</b> <span class="muted">· Reserve ${me.reserve?.length ?? 0}/${MAX_RESERVE}</span></button>
      ${active
        ? `<span class="hand-infl stat-infl"><span class="label">Influence</span><span class="num">${me.influence}</span><span class="of">/ ${me.influenceMax}</span>${meterHtml(`hinfl:${me.id}`, me.influence, me.influenceMax, 'sm')}</span>`
        : `<span class="hand-infl stat-infl idle" title="Influence refills on your turn"><span class="label">Influence</span><span class="num">${me.influenceMax}</span><span class="of">next turn</span></span>`}
      ${playing ? '<button type="button" class="primary" data-act="done-playing">Done playing</button>' : ''}
    </div>
    <div class="hand-body${ui.handOpen ? '' : ' collapsed'}">
      <div class="cards">${me.hand.map(c => one(c)).join('') || '<div class="muted empty">No cards in hand.</div>'}</div>
      ${me.reserve?.length ? `<div class="reserve"><div class="sec-title">Reserve</div><div class="cards">${reserve}</div></div>` : ''}
    </div>`;
}

/** Clone the played card and send it spinning toward the board; purely cosmetic. */
function flyCard(src: HTMLElement): void {
  const r = src.getBoundingClientRect();
  const ghost = src.cloneNode(true) as HTMLElement;
  ghost.classList.add('card-ghost');
  Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', zIndex: '60', pointerEvents: 'none' });
  document.body.append(ghost);
  const dx = window.innerWidth / 2 - (r.left + r.width / 2), dy = window.innerHeight * 0.36 - (r.top + r.height / 2);
  ghost.animate([
    { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1, filter: 'brightness(1)' },
    { transform: `translate(${dx * 0.6}px,${dy * 0.7 - 60}px) rotate(-8deg) scale(.9)`, opacity: 1, filter: 'brightness(1.3)', offset: 0.55 },
    { transform: `translate(${dx}px,${dy}px) rotate(6deg) scale(.35)`, opacity: 0, filter: 'brightness(2)' },
  ], { duration: 650, easing: 'cubic-bezier(.5,0,.2,1)' }).onfinish = () => ghost.remove();
}

export const handActions: Handlers = {
  'card': (el, c) => {
    if (el.getAttribute('aria-disabled')) return;
    ui.selectedCard = ui.selectedCard === el.dataset.id ? null : el.dataset.id!;
    ui.selectedTarget = ui.hoverTarget = null;
    c.render();
  },
  'pick-target': (el, c) => { ui.selectedTarget = el.dataset.id!; c.render(); },
  'cancel-target': (_el, c) => { ui.selectedTarget = null; c.render(); },
  'cancel-card': (_el, c) => { ui.selectedCard = ui.selectedTarget = ui.hoverTarget = null; c.render(); },
  'play-card': (_el, c) => {
    if (!ui.selectedCard || !ui.selectedTarget) return;
    const src = document.querySelector<HTMLElement>('.hand .card.selected');
    if (src && motionOK()) flyCard(src);
    sfx('play');
    ui.flown.add(ui.selectedCard);
    void c.act({ type: 'playCard', player: c.client.me!, cardId: ui.selectedCard, targetId: ui.selectedTarget });
  },
  'done-playing': (_el, c) => void c.act({ type: 'donePlaying', player: c.client.me! }),
  'give-open': (el, c) => { ui.giveCard = el.dataset.id!; c.render(); },
  'give-cancel': (_el, c) => { ui.giveCard = null; c.render(); },
  'give': (el, c) => { ui.flown.add(el.dataset.id!); void c.act({ type: 'giveCard', player: c.client.me!, cardId: el.dataset.id!, toPlayer: Number(el.dataset.to) }); },
  'toggle-hand': (_el, c) => { ui.handOpen = !ui.handOpen; c.render(); },
};
