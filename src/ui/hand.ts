// §60 influence hand, §32 Manage/Expand chooser, card → target → prediction → play.
import type { EmployeeId, GameView, InfluenceCard, PlayerView } from '../engine/types';
import { MAX_RESERVE, TRAIT_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { bandRange, cardHtml, deptName, esc, glyph, isMine, meterHtml, motionOK, pname, signed, ui, type Handlers } from './helpers';

/** Is it my play phase with a focus chosen? */
export function canPlay(view: GameView, client: GameClient): boolean {
  return isMine(view, client) && view.pending.kind === 'play' && view.pending.focus !== null;
}

/** Legal targets + a human reason when the card can't be played right now. */
export function cardStatus(view: GameView, client: GameClient, me: PlayerView, c: InfluenceCard): { targets: EmployeeId[]; reason: string | null } {
  const focus = view.pending.kind === 'play' ? view.pending.focus : null;
  const wanted = focus === 'Manage' ? 'Internal' : 'External';
  if (c.mode !== 'Both' && c.mode !== wanted) return { targets: [], reason: `${c.mode} only: not usable while ${focus === 'Manage' ? 'Managing' : 'Expanding'}` };
  if (c.cost > me.influence) return { targets: [], reason: `Needs ${c.cost} Influence (you have ${me.influence})` };
  const targets = client.legalTargets(c.id);
  return { targets, reason: targets.length ? null : 'No legal targets' };
}

const G_MANAGE = '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>';
const G_EXPAND = '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/><path d="M15 6l3-3M18 6V3h-3"/>';

/** Modal content when it's my play phase and focus is still null. */
export function focusChooserHtml(view: GameView, client: GameClient): string {
  if (!(isMine(view, client) && view.pending.kind === 'play' && view.pending.focus === null)) return '';
  return `<div class="float-center sheet focus-chooser" role="dialog" aria-label="Choose turn focus" data-enter="focus:${view.actionCount}:${client.me}" data-anim="rise">
    <div class="sheet-kicker">Turn focus</div>
    <h2>Where do you work today?</h2>
    <p class="muted">Negotiate first if you like. Your focus decides which employees you can target this turn.</p>
    <div class="focus-options">
      <button type="button" class="big-choice manage" data-act="focus" data-focus="Manage">
        ${glyph(G_MANAGE, 'choice-glyph')}
        <span class="big-label">Manage</span>
        <span>Work inside your own departments.</span>
        <ul><li>Repair loyalty</li><li>Prevent rebellion</li><li>Strengthen loyalists</li><li>Resolve internal problems</li><li>Prepare for Events</li></ul>
      </button>
      <button type="button" class="big-choice expand" data-act="focus" data-focus="Expand">
        ${glyph(G_EXPAND, 'choice-glyph')}
        <span class="big-label">Expand</span>
        <span>Reach into Neutral and rival departments.</span>
        <ul><li>Recruit</li><li>Destabilize</li><li>Create Rebels</li><li>Break rival loyalty</li><li>Capture departments</li></ul>
      </button>
    </div>
  </div>`;
}

function targetsHtml(view: GameView, client: GameClient, card: InfluenceCard, targets: EmployeeId[]): string {
  const byDept = new Map<string, EmployeeId[]>();
  for (const id of targets) {
    const d = view.employees.find(e => e.id === id)?.deptId ?? '?';
    byDept.set(d, [...(byDept.get(d) ?? []), id]);
  }
  const list = [...byDept].map(([d, ids]) => `<div class="tgt-dept"><div class="tgt-dept-name">${deptName(view, d)}</div>
    ${ids.map(id => {
      const e = view.employees.find(x => x.id === id)!;
      return `<button type="button" class="chip tgt${ui.selectedTarget === id ? ' on' : ''}" data-act="pick-target" data-id="${esc(id)}">${esc(e.name)} <span class="loy loy-${e.loyalty}">${e.loyalty}</span></button>`;
    }).join('')}</div>`).join('');
  return `<div class="targets">
    <div class="targets-head"><span><b>${esc(card.name)}</b>: pick a target <span class="muted">(board or list)</span></span>
      <button type="button" class="link" data-act="cancel-card">Cancel</button></div>
    ${ui.selectedTarget ? predictionHtml(view, client, card, ui.selectedTarget) : ''}
    <div class="tgt-list">${list}</div>
  </div>`;
}

/** Outcome bar: Failure 0–1 / Success 2–3 / Strong 4+, with the known range overlaid. */
function rangeBar(min: number, max: number): string {
  const lo = Math.min(-1, min), hi = Math.max(6, max), span = hi - lo + 1;
  const pct = (n: number) => ((n - lo) / span) * 100;
  const zone = (a: number, b: number, cls: string) => `<i class="zone ${cls}" style="left:${pct(a)}%;width:${pct(b + 1) - pct(a)}%"></i>`;
  return `<div class="range" aria-hidden="true">${zone(lo, 1, 'z-fail')}${zone(2, 3, 'z-ok')}${zone(4, hi, 'z-strong')}
    <i class="range-win" style="left:${pct(min)}%;width:${pct(max + 1) - pct(min)}%"></i>
    <span class="range-lbl" style="left:${pct(0)}%">0</span><span class="range-lbl" style="left:${pct(2)}%">2</span><span class="range-lbl" style="left:${pct(4)}%">4</span></div>`;
}

function predictionHtml(view: GameView, client: GameClient, card: InfluenceCard, target: EmployeeId): string {
  const p = client.predict(card.id, target);
  const parts = [`Base ${p.base}`, ...p.traitMods.map(m => `${TRAIT_LABEL[m.trait]} ${signed(m.value)}`), `Rank ${signed(p.rankBonus)}`];
  if (p.eventBonus) parts.push(`Event ${signed(p.eventBonus)}`);
  parts.push('Random −1 to +1');
  return `<div class="prediction" aria-live="polite" data-enter="pred:${esc(card.id)}:${esc(target)}" data-anim="pop">
    <div class="pred-title"><b>${esc(card.name)}</b> <span class="muted">on</span> <b>${esc(view.employees.find(e => e.id === target)?.name)}</b>
      <span class="pred-spend">Spend <b class="num">${p.requiredSpend}</b></span></div>
    ${rangeBar(p.min, p.max)}
    <div class="pred-range">Known outcome range <b class="num">${p.min}–${p.max}</b> <span class="muted">(${bandRange(p.min, p.max)})</span></div>
    <div class="pred-line">${parts.map(esc).join(' · ')}</div>
    ${p.unknownTraitMayAffect ? '<div class="warn">Unknown trait may affect result</div>' : ''}
    ${p.legal ? '' : `<div class="bad">${esc(p.reason ?? 'Not playable')}</div>`}
    <div class="row"><button type="button" class="primary" data-act="play-card" ${p.legal ? '' : 'disabled'}>Play card</button>
      <button type="button" data-act="cancel-target">Cancel</button></div>
  </div>`;
}

export function handHtml(view: GameView, client: GameClient): string {
  const me = client.me === null ? null : view.players[client.me];
  if (!ui.canAct || !me || !me.hand) return '';
  const playing = canPlay(view, client);
  const myPlay = isMine(view, client) && view.pending.kind === 'play';
  const all = [...me.hand, ...(me.reserve ?? [])];
  const selected = all.find(c => c.id === ui.selectedCard) ?? null;

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

  const focus = view.pending.kind === 'play' && myPlay ? view.pending.focus : null;
  return `<div class="hand-head">
      <button type="button" class="hand-toggle" data-act="toggle-hand" aria-expanded="${ui.handOpen}">
        <span class="chev" aria-hidden="true">${ui.handOpen ? '▾' : '▴'}</span> Hand <b class="num">${me.hand.length}</b> <span class="muted">· Reserve ${me.reserve?.length ?? 0}/${MAX_RESERVE}</span></button>
      <span class="hand-infl stat-infl"><span class="label">Influence</span><span class="num">${me.influence}</span><span class="of">/ ${me.influenceMax}</span>${meterHtml(`hinfl:${me.id}`, me.influence, me.influenceMax, 'sm')}</span>
      ${focus ? `<span class="focus-pill focus-${focus}">${focus}</span>` : ''}
      ${playing ? '<button type="button" class="primary" data-act="done-playing">Done playing</button>' : ''}
    </div>
    <div class="hand-body${ui.handOpen ? '' : ' collapsed'}">
      <div class="cards">${me.hand.map(c => one(c)).join('') || '<div class="muted empty">No cards in hand.</div>'}</div>
      ${me.reserve?.length ? `<div class="reserve"><div class="sec-title">Reserve</div><div class="cards">${reserve}</div></div>` : ''}
      ${playing && selected ? targetsHtml(view, client, selected, status.get(selected.id)!.targets) : ''}
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
  'focus': (el, c) => void c.act({ type: 'focus', player: c.client.me!, focus: el.dataset.focus as 'Manage' | 'Expand' }),
  'card': (el, c) => {
    if (el.getAttribute('aria-disabled')) return;
    ui.selectedCard = ui.selectedCard === el.dataset.id ? null : el.dataset.id!;
    ui.selectedTarget = null;
    c.render();
  },
  'pick-target': (el, c) => { ui.selectedTarget = el.dataset.id!; c.render(); },
  'cancel-target': (_el, c) => { ui.selectedTarget = null; c.render(); },
  'cancel-card': (_el, c) => { ui.selectedCard = ui.selectedTarget = null; c.render(); },
  'play-card': (_el, c) => {
    if (!ui.selectedCard || !ui.selectedTarget) return;
    const src = document.querySelector<HTMLElement>('.hand .card.selected');
    if (src && motionOK()) flyCard(src);
    void c.act({ type: 'playCard', player: c.client.me!, cardId: ui.selectedCard, targetId: ui.selectedTarget });
  },
  'done-playing': (_el, c) => void c.act({ type: 'donePlaying', player: c.client.me! }),
  'give-open': (el, c) => { ui.giveCard = el.dataset.id!; c.render(); },
  'give-cancel': (_el, c) => { ui.giveCard = null; c.render(); },
  'give': (el, c) => void c.act({ type: 'giveCard', player: c.client.me!, cardId: el.dataset.id!, toPlayer: Number(el.dataset.to) }),
  'toggle-hand': (_el, c) => { ui.handOpen = !ui.handOpen; c.render(); },
};
