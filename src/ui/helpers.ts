// Shared bits for every screen: escaping, names in player colours, card rendering,
// the local UI state object and the handler/context types used by delegation.
import type {
  Action, Backfire, CardId, DeptId, EmployeeId, EmployeeView, GameView, InfluenceCard, Pending, PlayerId, SecondaryEffect, TraitPole,
} from '../engine/types';
import { TRAIT_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import type { Board } from '../board/board';

export interface Ctx {
  view: GameView;
  client: GameClient;
  board: Board;
  render(): void;
  /** Dispatch for `client.me`; shows a toast on failure. Resolves true on success. */
  act(a: Action): Promise<boolean>;
  exit(): void;
}
/** data-act value -> handler. Each screen exports one of these; game.ts merges them. */
export type Handlers = Record<string, (el: HTMLElement, ctx: Ctx) => void>;

/** Local, never-synced UI state. Reset of per-decision fields happens in game.ts when the pending changes. */
export const ui = {
  selectedCard: null as CardId | null,
  selectedTarget: null as EmployeeId | null,
  giveCard: null as CardId | null,
  saveIds: new Set<CardId>(),
  inspect: null as EmployeeId | null,
  logTag: 'all' as string,
  logDept: null as DeptId | null,
  eventMin: false,
  /** Hot-seat: the seat whose owner pressed "I'm X" on the curtain. */
  acceptedMe: null as PlayerId | null,
  /** Computed every render: may this screen show `client.me`'s private info + controls? */
  canAct: false,
  // mobile panel toggles
  showDash: false,
  showLog: false,
  handOpen: true,
  error: null as string | null,
  /** Target picker: row under the pointer (prediction preview) and the chosen event target. */
  hoverTarget: null as EmployeeId | null,
  eventPick: null as string | null,
  /** Event outcome modal (src/ui/results.ts) is open on this screen. */
  eventResultOpen: false,
  /** Cinema (src/ui/cinema.ts): seat whose "Meet your team" intro is open, cards not yet dealt in,
   *  and whether the event modal waits for its draw animation. */
  introFor: null as PlayerId | null,
  undealt: new Set<CardId>(),
  holdEvent: false,
  /** Cards that left the hand on purpose (played / given): no discard animation for them. */
  flown: new Set<CardId>(),
};

/** Who a card can target is decided by its direction: positive → your team (+ Neutral departments),
 *  hostile and mole → other players' teams (+ Neutral departments for hostile). */
export const TARGET_WORD: Record<InfluenceCard['direction'], string> = { positive: '↑ Your team / unattached rivals', negative: '↓ Other teams', mole: '◉ Other teams' };
export const noTargetsText = (c: InfluenceCard) =>
  c.direction === 'positive' ? 'No one on your team (or unattached rival) can be targeted right now' : 'No rival employee can be targeted right now';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function pendingPlayer(p: Pending): PlayerId | null {
  return 'player' in p ? p.player : null;
}

/** True when the pending decision belongs to this client's seat and the seat owner may see it. */
export function isMine(view: GameView, client: GameClient): boolean {
  return ui.canAct && client.me !== null && pendingPlayer(view.pending) === client.me;
}

export function pname(view: GameView, id: PlayerId | null | undefined): string {
  if (id === null || id === undefined) return '<span class="muted">Neutral</span>';
  const p = view.players[id];
  if (!p) return `Player ${id + 1}`;
  return `<span class="pname" style="--pc:${esc(p.color)}">${esc(p.name)}</span>`;
}

export const deptName = (view: GameView, id: DeptId | null | undefined) =>
  esc(view.departments.find(d => d.id === id)?.name ?? id ?? '—');

export const empName = (view: GameView, id: EmployeeId) =>
  esc(view.employees.find(e => e.id === id)?.name ?? id);

/** Department lead's name (engine field when present, else the team-lead player's name). */
export function leadName(view: GameView, id: DeptId): string {
  const d = view.departments.find(x => x.id === id) as ({ leadName?: string | null; teamLead: PlayerId | null } | undefined);
  if (d?.leadName) return esc(d.leadName);
  return pname(view, d?.teamLead ?? null);
}

/** Loyalty pill. */
export const loyChip = (l: string) => `<span class="loy-chip loy-${esc(l)}">${esc(l)}</span>`;

/** Small badges for an employee: rebel / known mole / promise. `showPrivate` = may this screen show private info. */
export function empBadges(e: EmployeeView, showPrivate: boolean): string {
  return (e.loyalty === 'Rebel' ? '<span class="mini-flag rebel" title="Rebel">!</span>' : '')
    + (e.mole && (showPrivate || e.mole.visibleBecause === 'exposed') ? '<span class="mini-flag mole" title="Mole">◉</span>' : '')
    + (e.promise ? '<span class="mini-flag promise" title="Promotion promise">★</span>' : '');
}

/**
 * Trait chips for a target: known (+1), hidden (+2) and hidden (0), redacted "???" when unknown to this screen.
 * With a card, a chip matching its primary/secondary affinity is green, its adverse affinity red.
 */
export function traitChips(e: EmployeeView, showPrivate: boolean, card?: InfluenceCard | null, sm = false): string {
  const h1 = showPrivate || e.hiddenTrait1Public ? e.hiddenTrait1 : null;
  const h2 = showPrivate || e.hiddenTrait2Public ? e.hiddenTrait2 : null;
  const chip = (t: TraitPole | null, w: number) => {
    const hit = !t || !card ? '' : t === card.primary || t === card.secondary ? ' plus' : t === card.adverse ? ' minus' : '';
    // Hidden traits: "public" once disclosed to all, a lock when only this viewer knows (private intel).
    const pub = w === 1 ? null : w === 2 ? e.hiddenTrait1Public : e.hiddenTrait2Public;
    const mark = !t || pub === null ? '' : pub ? (sm ? '' : ' <span class="tmark">public</span>') : ' <span class="tmark lock" title="Private: only you know">🔒</span>';
    return `<span class="tchip${sm ? ' sm' : ''}${t ? hit : ' unknown'}">${t ? esc(TRAIT_LABEL[t]) : '???'} <span class="w">${weightLabel(w)}</span>${mark}</span>`;
  };
  return `<span class="tchips">${chip(e.permanentTrait, 1)}${chip(h1, 2)}${chip(h2, 0)}</span>`;
}

export const weightLabel = (w: number) => (w > 0 ? `(+${w})` : `(${w})`);
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');

/** §36 bands. */
export function band(score: number): string {
  return score <= 1 ? 'Failure' : score <= 3 ? 'Standard Success' : 'Strong Success';
}
export function bandRange(min: number, max: number): string {
  const a = band(min), b = band(max);
  return a === b ? a : `${a} to ${b}`;
}

const SECONDARY_TEXT: Record<SecondaryEffect, string> = {
  none: '',
  ripple: 'a teammate also moves the same way',
  refund: 'regain 1 Influence',
  reveal: 'privately learn a hidden trait',
  promise: 'creates a Promotion Promise',
  draw: 'draw 1 extra card',
  extraStep: 'target moves one extra step',
};
const BACKFIRE_TEXT: Record<Backfire, string> = {
  none: '',
  reverse: 'target moves the opposite way',
  ripple: 'a teammate turns against you',
  loseInfluence: 'lose 1 extra Influence',
  exposeSelf: 'your attempt is exposed publicly',
};
const DIRECTION = { positive: ['↑', 'positive'], negative: ['↓', 'hostile'], mole: ['◉', 'mole'] } as const;

/** Category glyphs for the card art (24×24 line icons, inline: no icon dependency). */
const CAT_GLYPH: Record<InfluenceCard['category'], string> = {
  Social: '<path d="M4 6h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M18 9h2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-4-3h-3"/>',
  Recognition: '<circle cx="12" cy="9" r="6"/><path d="M12 6l1 2 2 .3-1.5 1.4.4 2.1L12 10.8 10.1 11.8l.4-2.1L9 8.3 11 8z"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
  Support: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>',
  Authority: '<path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10M2 10l10-6 10 6z"/>',
  Pressure: '<path d="M4 4h16M4 20h16M8 4v4l4 4 4-4V4M8 20v-4l4-4 4 4v4"/>',
  Mole: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>',
};
export const glyph = (paths: string, cls = 'glyph') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/**
 * One influence card. `act` makes it a clickable button (data-act/data-id);
 * `disabled` dims it and prints the reason; `extra` is appended after the card (e.g. a Give row).
 */
export function cardHtml(c: InfluenceCard, o: { act?: string; selected?: boolean; disabled?: string | null; extra?: string } = {}): string {
  const [icon, dirName] = DIRECTION[c.direction];
  const aff = [
    c.primary && `<span class="aff plus">+${TRAIT_LABEL[c.primary]}</span>`,
    c.secondary && `<span class="aff plus">+${TRAIT_LABEL[c.secondary]}</span>`,
    c.adverse && `<span class="aff minus">−${TRAIT_LABEL[c.adverse]}</span>`,
  ].filter(Boolean).join('');
  const strong = c.direction === 'mole'
    ? (c.moleAbility === 'SilentBlock' ? 'Secretly blocks one positive attempt' : 'Adds +1 rebel pressure in a crisis')
    : SECONDARY_TEXT[c.secondaryEffect];
  const body = `
    <span class="card-art">${glyph(CAT_GLYPH[c.category], 'card-glyph')}<span class="card-cat">${esc(c.category)}</span></span>
    <span class="card-cost" title="Cost: ${c.cost} Influence">${c.cost}</span>
    <span class="card-dir" title="${dirName}">${icon}</span>
    <span class="card-name">${esc(c.name)}</span>
    <span class="card-meta">${dirName}${c.direction !== 'mole' ? ` · base ${c.baseEffect}` : ''}</span>
    <span class="card-mode tgt-${c.direction}" title="Who this card can target">${TARGET_WORD[c.direction]}</span>
    ${aff ? `<span class="card-aff">${aff}</span>` : ''}
    ${strong ? `<span class="card-fx"><b>Strong</b> ${esc(strong)}</span>` : ''}
    ${BACKFIRE_TEXT[c.backfire] ? `<span class="card-fx bad"><b>Backfire</b> ${esc(BACKFIRE_TEXT[c.backfire])}</span>` : ''}
    <span class="card-text">${esc(c.text)}</span>
    ${o.disabled ? `<span class="card-reason">${esc(o.disabled)}</span>` : ''}`;
  const cls = `card cat-${c.category} dir-${c.direction}${o.selected ? ' selected' : ''}${o.disabled ? ' dim' : ''}`;
  // Dealing in is animated by src/ui/cinema.ts; undealt cards hold their slot invisibly.
  const wrap = `class="card-wrap${ui.undealt.has(c.id) ? ' undealt' : ''}" data-card="${esc(c.id)}"`;
  if (!o.act) return `<div ${wrap}><div class="${cls}">${body}</div>${o.extra ?? ''}</div>`;
  return `<div ${wrap}><button type="button" class="${cls}" data-act="${o.act}" data-id="${esc(c.id)}"${o.disabled ? ' aria-disabled="true"' : ''}>${body}</button>${o.extra ?? ''}</div>`;
}

/** Replace innerHTML only when it changed, so scroll positions and focus survive re-renders. */
const lastHtml = new WeakMap<Element, string>();
export function setHtml(el: Element, html: string): boolean {
  if (lastHtml.get(el) === html) return false;
  lastHtml.set(el, html);
  // Lists marked data-scroll="<key>" keep their scroll position across repaints.
  const scroll = new Map([...el.querySelectorAll<HTMLElement>('[data-scroll]')].map(x => [x.dataset.scroll!, x.scrollTop]));
  el.innerHTML = html;
  for (const [k, top] of scroll) { const x = el.querySelector<HTMLElement>(`[data-scroll="${k}"]`); if (x) x.scrollTop = top; }
  return true;
}

// ---------------------------------------------------------------- motion
export const motionOK = () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Entrance animations. Templates mark elements with data-enter="<unique key>" data-anim="<kind>";
 * after each render, an element whose key was never seen gets class `anim-<kind>` once (CSS keyframes
 * do the rest). Re-renders that rebuild the same element don't replay it.
 * Returns the keys that entered this pass so callers can hook extra effects (confetti).
 */
const entered = new Set<string>();
export function runEnter(root: Element): string[] {
  const fresh: string[] = [];
  let drawIdx = 0;
  root.querySelectorAll<HTMLElement>('[data-enter]').forEach(el => {
    const key = el.dataset.enter!;
    if (entered.has(key)) return;
    entered.add(key);
    fresh.push(key);
    if (!motionOK()) return;
    const kind = el.dataset.anim ?? 'fade';
    if (kind === 'draw') el.style.animationDelay = `${drawIdx++ * 80}ms`;
    el.classList.add(`anim-${kind}`);
    el.addEventListener('animationend', () => { el.classList.remove(`anim-${kind}`); el.style.animationDelay = ''; }, { once: true });
  });
  return fresh;
}
/** Mark everything under root as already seen (e.g. the log backlog on first mount). */
export function markEntered(root: Element): void {
  root.querySelectorAll<HTMLElement>('[data-enter]').forEach(el => entered.add(el.dataset.enter!));
}

/** Meter element; when its value for `key` changes between renders, tweenMeters() animates the fill. */
export function meterHtml(key: string, v: number, max: number, cls = ''): string {
  const m = Math.max(1, max);
  return `<span class="meter ${cls}" data-tween="${esc(key)}" data-v="${v}" data-max="${m}" role="meter" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="${m}">`
    + `<i class="meter-fill" style="transform:scaleX(${Math.min(1, v / m)})"></i>`
    + Array.from({ length: m - 1 }, (_, i) => `<i class="meter-tick" style="left:${((i + 1) / m) * 100}%"></i>`).join('')
    + '</span>';
}
const meterLast = new Map<string, number>();
export function tweenMeters(root: Element): void {
  root.querySelectorAll<HTMLElement>('[data-tween]').forEach(el => {
    const key = el.dataset.tween!, v = Number(el.dataset.v), max = Number(el.dataset.max);
    const old = meterLast.get(key);
    meterLast.set(key, v);
    if (old === undefined || old === v || !motionOK()) return;
    el.querySelector('.meter-fill')?.animate(
      [{ transform: `scaleX(${Math.min(1, old / max)})` }, { transform: `scaleX(${Math.min(1, v / max)})` }],
      { duration: 750, easing: 'cubic-bezier(.16,1,.3,1)' });
    el.parentElement?.querySelector('.num')?.animate(
      [{ transform: 'scale(1.4)', color: v > old ? 'var(--good)' : 'var(--bad)' }, { transform: 'scale(1)' }],
      { duration: 650, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  });
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Player-name matcher that skips "Sahib Singh"-style employee names (D24). */
const nameRe = (name: string) => new RegExp(`\\b${reEsc(name)}\\b(?! [A-Z])`, 'g');
/** Does a log line mention this player? */
export const mentions = (text: string, name: string) => nameRe(name).test(text);

/** Colour every player name in a plain log line; department names become dept-filter buttons, employee names open their file. */
export function colourNames(view: GameView, text: string): string {
  let out = esc(text);
  // ponytail: regex per name per line; fine for a few hundred log lines.
  for (const d of view.departments) {
    out = out.replace(new RegExp(`\\b${reEsc(esc(d.name))}(?![\\w-])`, 'g'),
      `<button type="button" class="dname" data-act="log-dept" data-id="${esc(d.id)}">${esc(d.name)}</button>`);
  }
  // Employee full names open their details card.
  for (const e of view.employees) {
    if (!out.includes(esc(e.name))) continue;
    out = out.replace(new RegExp(`\\b${reEsc(esc(e.name))}\\b`, 'g'),
      `<button type="button" class="ename" data-act="inspect" data-id="${esc(e.id)}">${esc(e.name)}</button>`);
  }
  for (const p of view.players) {
    out = out.replace(nameRe(esc(p.name)), `<span class="pname" style="--pc:${esc(p.color)}">${esc(p.name)}</span>`);
  }
  return out;
}
