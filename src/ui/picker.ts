// Centred target picker (§60): one modal for "play this card on whom?" and for event target picks
// (pending 'eventTarget'). Targets are grouped by department, each a portrait row with loyalty, owner
// and trait chips; hovering or selecting a row shows the forecast. The board stays live: legal
// targets are highlighted there and clicking a token selects it here (game.ts).
import type { EmployeeId, EmployeeView, EventOption, GameView, InfluenceCard } from '../engine/types';
import { TRAIT_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { portraitDataUrl } from '../board/portrait';
import { bandRange, empBadges, esc, isMine, leadName, loyChip, noTargetsText, pname, TARGET_WORD, signed, traitChips, ui, type Handlers } from './helpers';
import { canPlay, cardStatus } from './hand';

/** Outcome bar: Failure 0–1 / Success 2–3 / Strong 4+, with the known range overlaid. */
function rangeBar(min: number, max: number): string {
  const lo = Math.min(-1, min), hi = Math.max(6, max), span = hi - lo + 1;
  const pct = (n: number) => ((n - lo) / span) * 100;
  const zone = (a: number, b: number, cls: string) => `<i class="zone ${cls}" style="left:${pct(a)}%;width:${pct(b + 1) - pct(a)}%"></i>`;
  return `<div class="range" aria-hidden="true">${zone(lo, 1, 'z-fail')}${zone(2, 3, 'z-ok')}${zone(4, hi, 'z-strong')}
    <i class="range-win" style="left:${pct(min)}%;width:${pct(max + 1) - pct(min)}%"></i>
    <span class="range-lbl" style="left:${pct(0)}%">0</span><span class="range-lbl" style="left:${pct(2)}%">2</span><span class="range-lbl" style="left:${pct(4)}%">4</span></div>`;
}

/** Big subject card for the focused row: portrait, name, loyalty, all three trait chips. */
function subjectHtml(view: GameView, e: EmployeeView, card: InfluenceCard | null): string {
  return `<div class="pk-subject">
    <img class="pk-face" src="${portraitDataUrl(e)}" alt="" width="64" height="80">
    <div><div class="pk-subj-name">${esc(e.name)} ${empBadges(e, ui.canAct)}</div>
      <div class="muted small">${esc(e.role)} · ${esc(view.departments.find(d => d.id === e.deptId)?.name ?? '')}</div>
      <div class="pk-subj-loy">${loyChip(e.loyalty)} <span class="muted small">side</span> ${pname(view, e.politicalOwner)}</div></div>
    <div class="pk-subj-traits">${traitChips(e, ui.canAct, card)}</div>
  </div>`;
}

function forecastHtml(view: GameView, client: GameClient, card: InfluenceCard, e: EmployeeView): string {
  const p = client.predict(card.id, e.id);
  const parts = [`Base ${p.base}`, ...p.traitMods.map(m => `${TRAIT_LABEL[m.trait]} ${signed(m.value)}`), `Rank ${signed(p.rankBonus)}`];
  if (p.eventBonus) parts.push(`Event ${signed(p.eventBonus)}`);
  parts.push('Random −1 to +1');
  return `${subjectHtml(view, e, card)}
    <div class="prediction" aria-live="polite">
      <div class="pred-title"><span class="label">Forecast</span><span class="pred-spend">Spend <b class="num">${p.requiredSpend}</b></span></div>
      ${rangeBar(p.min, p.max)}
      <div class="pred-range">Known outcome <b class="num">${p.min}–${p.max}</b> <span class="muted">(${bandRange(p.min, p.max)})</span></div>
      <div class="pred-line">${parts.map(esc).join(' · ')}</div>
      ${p.unknownTraitMayAffect ? '<div class="warn">Unknown trait may affect result</div>' : ''}
      ${p.legal ? '' : `<div class="bad">${esc(p.reason ?? 'Not playable')}</div>`}
    </div>`;
}

/** One candidate row. `act` = data-act on click (select), hover previews via data-hover. */
function rowHtml(view: GameView, e: EmployeeView, act: string, selected: boolean, card: InfluenceCard | null): string {
  const pc = e.politicalOwner !== null ? view.players[e.politicalOwner]?.color : null;
  return `<button type="button" class="pk-row${selected ? ' on' : ''}" data-act="${act}" data-id="${esc(e.id)}" data-hover="${esc(e.id)}" style="--pc:${esc(pc ?? 'var(--line-2)')}" aria-pressed="${selected}">
    <img class="pk-thumb" src="${portraitDataUrl(e)}" alt="" width="36" height="45">
    <span class="pk-name"><b>${esc(e.name)}</b>${empBadges(e, ui.canAct)}<small>${esc(e.role)}</small></span>
    <span class="pk-meta">${loyChip(e.loyalty)}<span class="pk-owner">${pname(view, e.politicalOwner)}</span></span>
    <span class="pk-traits">${traitChips(e, ui.canAct, card, true)}</span>
  </button>`;
}

/** Rows grouped by department. */
function groupedHtml(view: GameView, ids: string[], row: (e: EmployeeView) => string): string {
  const by = new Map<string, EmployeeView[]>();
  for (const id of ids) {
    const e = view.employees.find(x => x.id === id);
    if (e) by.set(e.deptId, [...(by.get(e.deptId) ?? []), e]);
  }
  // Your departments first, then Neutral ones, then rivals'.
  const rank = (d: string) => { const l = view.departments.find(x => x.id === d)?.teamLead; return l === view.viewer ? 0 : l === null ? 1 : 2; };
  return [...by].sort((a, b) => rank(a[0]) - rank(b[0])).map(([d, es]) => `<section class="pk-dept">
      <div class="pk-dept-head"><b>${esc(view.departments.find(x => x.id === d)?.name ?? d)}</b><span class="muted small">Lead ${leadName(view, d)}</span></div>
      ${es.map(row).join('')}</section>`).join('');
}

function shell(kicker: string, title: string, coin: string, sub: string, list: string, side: string, foot: string, key: string): string {
  return `<div class="float-center sheet picker" role="dialog" aria-modal="false" aria-label="${esc(title)}" data-enter="${esc(key)}" data-anim="rise">
    <header class="pk-head">${coin}<div class="pk-titles"><div class="sheet-kicker">${kicker}</div><h2>${esc(title)}</h2>${sub}</div></header>
    <div class="pk-body"><div class="pk-list" data-scroll="picker">${list}</div><aside class="pk-side">${side}</aside></div>
    <footer class="row sheet-foot">${foot}</footer>
  </div>`;
}

function cardPickerHtml(view: GameView, client: GameClient): string {
  if (!ui.selectedCard || !canPlay(view, client)) return '';
  const me = view.players[client.me!];
  const card = [...(me.hand ?? []), ...(me.reserve ?? [])].find(c => c.id === ui.selectedCard);
  if (!card) return '';
  const { targets } = cardStatus(view, client, me, card);
  const focus = view.employees.find(e => e.id === (ui.hoverTarget && targets.includes(ui.hoverTarget) ? ui.hoverTarget : ui.selectedTarget));
  const legal = !!ui.selectedTarget && client.predict(card.id, ui.selectedTarget).legal;
  const side = focus ? forecastHtml(view, client, card, focus)
    : '<div class="pk-hint muted">Hover or pick an employee to see their traits and the forecast. You can also click a highlighted employee on the board.</div>';
  return shell(
    `Play a card · ${TARGET_WORD[card.direction]}`, card.name,
    `<span class="pk-coin" title="Cost ${card.cost} Influence">${card.cost}</span>`,
    `<p class="muted small pk-sub">${esc(card.text)} <span class="aff-key"><span class="tchip sm plus">helps</span><span class="tchip sm minus">hurts</span></span></p>`,
    groupedHtml(view, targets, e => rowHtml(view, e, 'pick-target', e.id === ui.selectedTarget, card)) || `<div class="muted">${noTargetsText(card)}.</div>`,
    side,
    `<span class="muted small">${targets.length} possible target${targets.length === 1 ? '' : 's'} · Influence ${me.influence}</span>
     <span class="row-end"><button type="button" data-act="cancel-card">Cancel</button>
     <button type="button" class="primary" data-act="play-card" ${legal ? '' : 'disabled'}>Play card</button></span>`,
    `picker:${card.id}`);
}

/** What does picking do? Phrased from the option's effects. */
export function eventTargetTitle(o: EventOption | undefined, choose: 'employee' | 'dept'): string {
  if (choose === 'dept') return 'Which department?';
  const fx = o?.effects ?? [];
  if (fx.some(f => f.kind === 'honorPromise')) return 'Who gets the promotion?';
  if (fx.some(f => f.kind === 'makeRebel' && f.target === 'chosen')) return 'Who turns Rebel?';
  if (fx.some(f => f.kind === 'reveal' && f.target === 'chosen')) return 'Whose file do you open?';
  const l = fx.find(f => f.kind === 'loyalty' && f.target === 'chosen');
  if (l && l.kind === 'loyalty') return l.delta > 0 ? 'Who moves up?' : 'Who takes the hit?';
  if (fx.some(f => f.kind === 'loyalty' && f.target === 'randomOther')) return 'Who do you protect?';
  return 'Choose an employee';
}

function eventPickerHtml(view: GameView, client: GameClient): string {
  const p = view.pending;
  if (p.kind !== 'eventTarget' || !isMine(view, client) || ui.holdEvent) return '';
  const card = view.activeEvent?.card;
  const opt = card?.options.find(o => o.id === p.optionId);
  const title = eventTargetTitle(opt, p.choose);
  const sel = p.candidates.includes(ui.eventPick ?? '') ? ui.eventPick : null;
  let list: string, side: string;
  if (p.choose === 'employee') {
    list = groupedHtml(view, p.candidates, e => rowHtml(view, e, 'event-pick', e.id === sel, null));
    const focus = view.employees.find(e => e.id === (ui.hoverTarget && p.candidates.includes(ui.hoverTarget) ? ui.hoverTarget : sel));
    side = focus ? subjectHtml(view, focus, null) : '<div class="pk-hint muted">Pick someone here or on the board. Their loyalty and known traits show here.</div>';
  } else {
    list = p.candidates.map(id => {
      const d = view.departments.find(x => x.id === id);
      return `<button type="button" class="pk-row pk-deptrow${id === sel ? ' on' : ''}" data-act="event-pick" data-id="${esc(id)}" aria-pressed="${id === sel}">
        <span class="pk-name"><b>${esc(d?.name ?? id)}</b><small>Lead ${leadName(view, id)}</small></span>
        <span class="pk-meta">${d?.rebelCount ? `<span class="mini-flag rebel">!</span> ${d.rebelCount} rebel${d.rebelCount > 1 ? 's' : ''}` : '<span class="muted small">no rebels</span>'}</span></button>`;
    }).join('');
    side = '<div class="pk-hint muted">The option applies to the department you pick.</div>';
  }
  return shell(
    `${esc(card?.title ?? 'Event')} · ${esc(opt?.label ?? '')}`, title, '',
    opt ? `<p class="muted small pk-sub">${esc(opt.text)}</p>` : '',
    list, side,
    `<span class="muted small">This choice is public.</span>
     <span class="row-end"><button type="button" class="primary" data-act="event-target" data-id="${esc(sel ?? '')}" ${sel ? '' : 'disabled'}>Confirm</button></span>`,
    `evpick:${p.eventId}:${p.optionId}:${view.actionCount}`);
}

export function pickerHtml(view: GameView, client: GameClient): string {
  return eventPickerHtml(view, client) || cardPickerHtml(view, client);
}

export const pickerActions: Handlers = {
  'event-pick': (el, c) => { ui.eventPick = el.dataset.id!; c.render(); },
};
