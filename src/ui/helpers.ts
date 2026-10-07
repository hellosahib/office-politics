// Shared bits for every screen: escaping, names in player colours, card rendering,
// the local UI state object and the handler/context types used by delegation.
import type {
  Action, Backfire, CardId, DeptId, EmployeeId, GameView, InfluenceCard, Pending, PlayerId, SecondaryEffect,
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
};

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

export const weightLabel = (w: number) => (w > 0 ? `(+${w})` : `(${w})`);
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');

/** §36 bands. */
export function band(score: number): string {
  return score <= 1 ? 'Failure' : score <= 3 ? 'Standard Success' : 'Strong Success';
}
export function bandRange(min: number, max: number): string {
  const a = band(min), b = band(max);
  return a === b ? a : `${a} – ${b}`;
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
const DIRECTION = { positive: ['↑', 'positive'], negative: ['↓', 'hostile'], mole: ['◎', 'mole'] } as const;

/**
 * One influence card. `act` makes it a clickable button (data-act/data-id);
 * `disabled` dims it and prints the reason; `extra` is appended inside (e.g. a Give button row).
 */
export function cardHtml(c: InfluenceCard, o: { act?: string; selected?: boolean; disabled?: string | null; extra?: string } = {}): string {
  const [icon, dirName] = DIRECTION[c.direction];
  const aff = [
    c.primary && `<span class="aff plus">+${TRAIT_LABEL[c.primary]}</span>`,
    c.secondary && `<span class="aff plus">+${TRAIT_LABEL[c.secondary]}</span>`,
    c.adverse && `<span class="aff minus">−${TRAIT_LABEL[c.adverse]}</span>`,
  ].filter(Boolean).join(' ');
  const strong = c.direction === 'mole'
    ? (c.moleAbility === 'SilentBlock' ? 'Secretly blocks one positive attempt' : 'Adds +1 rebel pressure in a crisis')
    : SECONDARY_TEXT[c.secondaryEffect];
  const body = `
    <div class="card-top"><span class="card-name">${esc(c.name)}</span><span class="cost" title="Cost">${c.cost}</span></div>
    <div class="card-meta"><span class="dir dir-${c.direction}" title="${dirName}">${icon} ${dirName}</span> · ${esc(c.mode)}${c.direction !== 'mole' ? ` · base ${c.baseEffect}` : ''}</div>
    ${aff ? `<div class="card-aff">${aff}</div>` : ''}
    ${strong ? `<div class="card-fx"><b>Strong:</b> ${esc(strong)}</div>` : ''}
    ${BACKFIRE_TEXT[c.backfire] ? `<div class="card-fx bad"><b>Backfire:</b> ${esc(BACKFIRE_TEXT[c.backfire])}</div>` : ''}
    <div class="card-text">${esc(c.text)}</div>
    ${o.disabled ? `<div class="card-reason">${esc(o.disabled)}</div>` : ''}`;
  const cls = `card dir-${c.direction}${o.selected ? ' selected' : ''}${o.disabled ? ' dim' : ''}`;
  if (!o.act) return `<div class="${cls}">${body}${o.extra ?? ''}</div>`;
  return `<div class="card-wrap"><button type="button" class="${cls}" data-act="${o.act}" data-id="${esc(c.id)}"${o.disabled ? ' aria-disabled="true"' : ''}>${body}</button>${o.extra ?? ''}</div>`;
}

/** Replace innerHTML only when it changed, so scroll positions and focus survive re-renders. */
const lastHtml = new WeakMap<Element, string>();
export function setHtml(el: Element, html: string): void {
  if (lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
}

/** Colour every player name in a plain log line. Skips "Sahib Singh"-style employee names (D24). */
export function colourNames(view: GameView, text: string): string {
  let out = esc(text);
  for (const p of view.players) {
    const n = esc(p.name);
    // ponytail: regex per player per line; fine for a few hundred log lines.
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?! [A-Z])`, 'g');
    out = out.replace(re, `<span class="pname" style="--pc:${esc(p.color)}">${n}</span>`);
  }
  return out;
}
