// What just happened, shown on every client:
//  - card banner: a centre banner after each Influence card resolves (confetti on success, falling 😢 on
//    failure), auto-dismissed after ~3 s or on click; never blocks the rest of the UI.
//  - event outcome: a centred modal after an event resolves (votes, winning option, changes per player).
// Both prefer the engine's `view.lastCardResult` / `view.lastEventResult` and fall back to parsing the log
// until those fields exist.
import type { DeptId, EmployeeId, EventCard, GameView, LoyaltyState, PlayerId } from '../engine/types';
import type { GameClient } from '../client';
import { portraitDataUrl } from '../board/portrait';
import { deptName, esc, loyChip, motionOK, pname, ui, type Handlers } from './helpers';
import { confetti } from './endGame';

// ---------------------------------------------------------------- card banner
type Band = 'Failure' | 'Standard Success' | 'Strong Success' | 'Blocked';
interface CardResult {
  actor: PlayerId; cardName: string; employeeId: EmployeeId; deptId: DeptId; band: Band;
  from: LoyaltyState; to: LoyaltyState; reaction: string; why?: string; key: string;
}
type CardResultView = Omit<CardResult, 'why' | 'key'> & { explanation?: { lines: { label: string; value: number }[]; score: number }; actionCount: number };

const CARD_RE = /^(.+?) (?:played|used) (.+?) on (.+?)(?:: |\. )(.*)$/;

/** Newest card result: engine field, else the newest narrative card line in the log. */
function latestCard(view: GameView, client: GameClient): CardResult | null {
  const r = (view as GameView & { lastCardResult?: CardResultView }).lastCardResult;
  if (r) {
    const why = r.explanation ? `${r.explanation.lines.map(l => `${l.label} ${l.value >= 0 ? '+' : ''}${l.value}`).join(', ')} = ${r.explanation.score}` : undefined;
    return { ...r, why, key: `a${r.actionCount}` };
  }
  for (let i = view.log.length - 1; i >= 0; i--) {
    const l = view.log[i];
    if (l.visibility !== 'public' || (l.tag && l.tag !== 'card')) continue;
    const m = CARD_RE.exec(l.text);
    const actor = view.players.find(p => m?.[1] === p.name);
    const e = m && view.employees.find(x => m[3].startsWith(x.name));
    if (!m || !actor || !e) continue;
    const rest = m[4];
    const mv = /(\w+) → (\w+)/.exec(rest) ?? /from (\w+) to (\w+)/.exec(rest);
    const band: Band = /Strong Success/.test(rest) ? 'Strong Success' : /Success/.test(rest) ? 'Standard Success'
      : /Blocked/.test(rest) ? 'Blocked' : /Fail/.test(rest) ? 'Failure' : mv && mv[1] !== mv[2] ? 'Standard Success' : 'Failure';
    // New engine lines: "<Reaction>. Status changed from A to B." Old: "<Band> (A → B)."
    const reaction = rest.replace(/\s*Status changed from \w+ to \w+\.?$/, '').replace(/\s*\(\w+ → \w+\)\.?$/, '').replace(/\.$/, '') || band;
    // The actor also sees the private score line that follows (§89); never shown in the log itself.
    const ex = view.log[i + 1];
    const why = ex?.tag === 'explanation' && ui.canAct && ex.visibility === client.me ? ex.text.replace(/^.*?: /, '').replace(/ → .*$/, '') : undefined;
    return { actor: actor.id, cardName: m[2], employeeId: e.id, deptId: e.deptId, band, from: (mv?.[1] ?? e.loyalty) as LoyaltyState, to: (mv?.[2] ?? e.loyalty) as LoyaltyState, reaction, why, key: `l${i}` };
  }
  return null;
}

function showBanner(root: HTMLElement, view: GameView, r: CardResult): void {
  root.querySelector('.card-banner')?.remove();
  const ok = r.band === 'Standard Success' || r.band === 'Strong Success';
  const actor = view.players[r.actor];
  const emp = view.employees.find(e => e.id === r.employeeId);
  const b = document.createElement('div');
  b.className = `card-banner ${ok ? 'ok' : 'fail'}`;
  b.setAttribute('role', 'status');
  b.style.setProperty('--pc', actor?.color ?? 'var(--brass)');
  b.innerHTML = `<div class="cb-line">${pname(view, r.actor)} used <b>${esc(r.cardName)}</b> on <b>${esc(emp?.name ?? '')}</b> of ${deptName(view, r.deptId)}</div>
    <div class="cb-reaction">${esc(r.reaction)}</div>
    <div class="cb-status"><span class="cb-band">${esc(r.band === 'Blocked' ? 'Failure' : r.band)}</span> Status ${loyChip(r.from)}<span class="arr">→</span>${loyChip(r.to)}</div>
    ${r.why ? `<details class="cb-why"><summary>Why?</summary><span class="num">${esc(r.why)}</span></details>` : ''}`;
  root.append(b);
  let timer = window.setTimeout(() => close(), 3200);
  const close = () => { clearTimeout(timer); b.classList.add('out'); window.setTimeout(() => b.remove(), motionOK() ? 260 : 0); };
  b.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('details')) { clearTimeout(timer); timer = window.setTimeout(close, 5000); return; }
    close();
  });
  if (!motionOK()) return;
  if (ok) { confetti(root, [actor?.color ?? '#d9ad62'], { count: r.band === 'Strong Success' ? 110 : 60, ms: 1800, y: 0.42 }); return; }
  // A ring of crying faces drifting down around the banner.
  const rect = b.getBoundingClientRect();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const t = document.createElement('span');
    t.className = 'cry';
    t.textContent = '😢';
    t.style.left = `${rect.left + rect.width / 2 + Math.cos(a) * (rect.width / 2 + 24)}px`;
    t.style.top = `${rect.top + rect.height / 2 + Math.sin(a) * (rect.height / 2 + 26)}px`;
    root.append(t);
    t.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }, { opacity: 1, offset: 0.15 },
      { opacity: 0, transform: `translate(-50%, calc(-50% + ${80 + (i % 3) * 30}px)) rotate(${(i % 2 ? 1 : -1) * 20}deg)` }],
    { duration: 2400, delay: i * 50, easing: 'ease-in', fill: 'forwards' }).onfinish = () => t.remove();
  }
}

// ---------------------------------------------------------------- trait reveal banners
/** Newest reveal line: public ("Revealed: X is T (+2)." / "P exposes: X is T (+2).") or the viewer's private intel. */
function latestReveal(view: GameView, client: GameClient): { i: number; html: string; priv: boolean } | null {
  for (let i = view.log.length - 1; i >= 0; i--) {
    const l = view.log[i];
    if (l.tag !== 'reveal') continue;
    const priv = l.visibility !== 'public';
    if (priv && !(ui.canAct && l.visibility === client.me)) continue;
    const m = /^(?:(.+?) exposes|Revealed|Intel): (.+?) is (.+?) \(([+\d]+)\)\.$/.exec(l.text);
    const e = m && view.employees.find(x => x.name === m[2]);
    if (!m || !e) continue;
    const who = `<b>${esc(e.name)}</b> <span class="muted">(${deptName(view, e.deptId)})</span> is <span class="tchip">${esc(m[3])} <span class="w">(${esc(m[4])})</span></span>`;
    const by = view.players.find(p => p.name === m[1])?.id ?? l.turn;
    return priv
      ? { i, priv, html: `<div class="cb-line">Private intel</div><div class="cb-reaction">You now know</div><div class="cb-status">${who}</div><div class="cb-line">Only you can see this.</div>` }
      : { i, priv, html: `<div class="cb-line">Trait disclosed</div><div class="cb-status">${who}</div><div class="cb-line">revealed by ${pname(view, by)}</div>` };
  }
  return null;
}

function showRevealBanner(root: HTMLElement, html: string, priv: boolean): void {
  root.querySelector('.card-banner')?.remove();
  const b = document.createElement('div');
  b.className = `card-banner reveal${priv ? ' private' : ''}`;
  b.setAttribute('role', 'status');
  b.innerHTML = html;
  root.append(b);
  const close = () => { b.classList.add('out'); window.setTimeout(() => b.remove(), motionOK() ? 260 : 0); };
  const t = window.setTimeout(close, 3600);
  b.addEventListener('click', () => { clearTimeout(t); close(); });
}

// ---------------------------------------------------------------- event outcome
type EventChange =
  | { kind: 'loyalty'; employeeId: EmployeeId; from: LoyaltyState; to: LoyaltyState }
  | { kind: 'influence'; delta: number }
  | { kind: 'protected'; deptId: DeptId; untilRound: number }
  | { kind: 'severity'; delta: number }
  | { kind: 'reveal'; employeeId: EmployeeId; by?: PlayerId; public?: boolean; trait?: string; weight?: number }
  | { kind: 'investigate'; found: boolean }
  | { kind: 'promise'; employeeId: EmployeeId; honored: boolean }
  | { kind: 'rebel'; employeeId: EmployeeId }
  | { kind: 'text'; text: string };
export interface EventResult {
  eventId: string; title: string; type: EventCard['type']; situation: string;
  votes: { player: PlayerId; optionId: 'A' | 'B'; optionLabel: string }[];
  outcome: { optionId: 'A' | 'B'; label: string; text: string } | null;
  perPlayer: { player: PlayerId; deptId: DeptId | null; minority: boolean; changes: EventChange[] }[];
  actionCount: number;
}

function changeRow(view: GameView, c: EventChange): string {
  const face = (id: EmployeeId, extra: string) => {
    const e = view.employees.find(x => x.id === id);
    return `<li class="eo-row">${e ? `<img src="${portraitDataUrl(e)}" alt="" width="30" height="38">` : ''}<b>${esc(e?.name ?? id)}</b>${extra}</li>`;
  };
  switch (c.kind) {
    case 'loyalty': return face(c.employeeId, `<span class="rp-move">${loyChip(c.from)}<span class="arr">→</span>${loyChip(c.to)}</span>`);
    case 'rebel': return face(c.employeeId, '<span class="mini-flag rebel">!</span> <span class="bad">turned Rebel</span>');
    case 'reveal': return face(c.employeeId, c.trait
      ? `<span class="tchip">${esc(c.trait)} <span class="w">(${c.weight ? `+${c.weight}` : '0'})</span></span>${c.public === false ? ' <span class="tag-private">private</span>' : ' <span class="tag">public</span>'}${c.by !== undefined ? ` <span class="muted small">by</span> ${pname(view, c.by)}` : ''}`
      : '<span class="muted">hidden trait revealed</span>');
    case 'promise': return face(c.employeeId, c.honored ? '<span class="good">★ promise honoured</span>' : '<span class="bad">promise broken</span>');
    case 'influence': return `<li class="eo-row"><b class="num ${c.delta >= 0 ? 'good' : 'bad'}">${c.delta >= 0 ? '+' : '−'}${Math.abs(c.delta)} Influence</b></li>`;
    case 'protected': return `<li class="eo-row">${deptName(view, c.deptId)} <span class="good">protected until round ${c.untilRound}</span></li>`;
    case 'severity': return `<li class="eo-row"><span class="${c.delta > 0 ? 'bad' : 'good'}">Future local events ${c.delta > 0 ? 'hit harder' : 'ease'} (${c.delta > 0 ? '+' : ''}${c.delta})</span></li>`;
    case 'investigate': return `<li class="eo-row">${c.found ? '<span class="mole">A mole was found!</span>' : '<span class="muted">Investigation found nothing</span>'}</li>`;
    case 'text': return `<li class="eo-row">${esc(c.text)}</li>`;
  }
}

export function eventResultHtml(view: GameView, r: EventResult | null): string {
  if (!r) return '';
  const type = r.type.toLowerCase();
  const tally = r.votes.length ? `<ul class="votes eo-votes">${r.votes.map(v => `<li class="vote shown${r.outcome?.optionId === v.optionId ? ' win' : ''}" style="--pc:${esc(view.players[v.player]?.color ?? '')}">${pname(view, v.player)}<span class="vote-state"><b>${v.optionId}</b> ${esc(v.optionLabel)}</span></li>`).join('')}</ul>` : '';
  const sections = r.perPlayer.map(pp => {
    const pl = view.players[pp.player];
    return `<section class="eo-player" style="--pc:${esc(pl?.color ?? 'var(--line-2)')}">
      <div class="eo-who">${pname(view, pp.player)}${pp.deptId ? ` <span class="muted small">· ${deptName(view, pp.deptId)}</span>` : ''}${pp.minority ? ' <span class="tag">minority</span>' : ''}</div>
      ${pp.changes.length ? `<ul class="eo-list">${pp.changes.map(c => changeRow(view, c)).join('')}</ul>` : '<div class="muted small">No effect</div>'}</section>`;
  }).join('');
  return `<div class="modal-backdrop eo-backdrop"><div class="sheet event-outcome ev-${type}" role="dialog" aria-modal="true" aria-labelledby="eo-title" data-enter="eo:${r.actionCount}" data-anim="pop">
    <div class="sheet-kicker">Event outcome</div>
    <div class="eo-head"><span class="badge badge-${type}">${esc(r.type)}</span><h2 id="eo-title">${esc(r.title)}</h2></div>
    ${tally}
    ${r.outcome ? `<div class="outcome"><b>${r.outcome.optionId}. ${esc(r.outcome.label)}</b>${r.outcome.text ? ` <span class="muted">— ${esc(r.outcome.text)}</span>` : ''}</div>` : ''}
    <div class="eo-sections" data-scroll="eo">${sections || '<div class="muted">Nothing changed.</div>'}</div>
    <div class="row sheet-foot"><span class="muted small">Everyone sees this.</span><button type="button" class="primary" data-act="eo-close">Continue</button></div>
  </div></div>`;
}

/** Log fallback until `view.lastEventResult` lands: snapshot the event while it's open, read its log lines once it closes. */
function deriveEvent(view: GameView, snap: { ev: NonNullable<GameView['activeEvent']>; from: number; player: PlayerId }): EventResult {
  const { ev, from, player } = snap;
  const opt = (id: 'A' | 'B' | null | undefined) => ev.card.options.find(o => o.id === id);
  const lines = view.log.slice(from).filter(l => l.visibility === 'public' && ['event', 'rebel', 'crisis', 'capture', 'mole', 'reveal'].includes(l.tag ?? ''));
  let outcomeId = ev.outcome;
  const by = new Map<PlayerId, EventChange[]>();
  const add = (p: PlayerId, c: EventChange) => by.set(p, [...(by.get(p) ?? []), c]);
  for (const l of lines) {
    if (l.text.startsWith('Event — ')) continue;
    const o = /Outcome: (.+?)\.$/.exec(l.text);
    if (o && l.text.startsWith(ev.card.title)) { outcomeId = ev.card.options.find(x => x.label === o[1])?.id ?? outcomeId; continue; }
    const m = /^(.+?): (\w+) → (\w+)\.$/.exec(l.text);
    const e = m && view.employees.find(x => x.name === m[1]);
    if (e && m) {
      const lead = view.departments.find(d => d.id === e.deptId)?.teamLead ?? player;
      add(ev.card.type === 'Global' ? lead : player, { kind: 'loyalty', employeeId: e.id, from: m[2] as LoyaltyState, to: m[3] as LoyaltyState });
    } else add(player, { kind: 'text', text: l.text });
  }
  const local = ev.card.type !== 'Global';
  const players = local ? [player] : view.players.filter(p => !p.eliminated).map(p => p.id);
  const votes = Object.entries(ev.votes).map(([p, v]) => ({ player: Number(p), optionId: v, optionLabel: opt(v)?.label ?? v }));
  const chosen = local ? (votes.find(v => v.player === player)?.optionId ?? outcomeId) : outcomeId;
  const oc = opt(chosen);
  return {
    eventId: ev.card.id, title: ev.card.title, type: ev.card.type, situation: ev.card.situation,
    votes: local ? [] : votes,
    outcome: oc ? { optionId: oc.id, label: oc.label, text: oc.text } : null,
    perPlayer: players.map(p => ({ player: p, deptId: local ? ev.deptId : null, minority: !local && !!outcomeId && ev.votes[String(p)] !== undefined && ev.votes[String(p)] !== outcomeId, changes: by.get(p) ?? [] })),
    actionCount: view.actionCount,
  };
}

// ---------------------------------------------------------------- watcher
export interface Results { check(view: GameView, client: GameClient): void; current(): EventResult | null }

export function createResults(root: HTMLElement): Results {
  let lastCard: string | undefined;
  let lastReveal: number | undefined;
  let lastEvent: number | undefined;
  let snap: { ev: NonNullable<GameView['activeEvent']>; from: number; player: PlayerId; key: string } | null = null;
  let open: EventResult | null = null;
  return {
    current: () => (ui.eventResultOpen ? open : null),
    check(view, client) {
      const c = latestCard(view, client);
      const ck = c?.key ?? '';
      if (lastCard !== undefined && ck !== lastCard && c) showBanner(root, view, c);
      lastCard = ck;
      const rv = latestReveal(view, client);
      if (lastReveal !== undefined && rv && rv.i > lastReveal) showRevealBanner(root, rv.html, rv.priv);
      lastReveal = Math.max(lastReveal ?? -1, rv?.i ?? -1);

      const er = (view as GameView & { lastEventResult?: EventResult }).lastEventResult;
      if (er) {
        if (lastEvent !== undefined && er.actionCount !== lastEvent) { open = er; ui.eventResultOpen = true; }
        lastEvent = er.actionCount;
        return;
      }
      // Fallback: open event → snapshot; snapshot's event gone → derive from the log.
      const ev = view.activeEvent;
      const key = ev ? `${view.round}:${view.currentPlayer}:${ev.card.id}` : '';
      if (snap && snap.key !== key) {
        if (lastEvent !== undefined) { open = deriveEvent(view, snap); ui.eventResultOpen = true; }
        snap = null;
      }
      if (ev && !snap) {
        let from = view.log.length;
        for (let i = view.log.length - 1; i >= 0; i--) if (view.log[i].text.startsWith(`Event — ${ev.card.title}`)) { from = i; break; }
        snap = { ev, from, player: view.currentPlayer, key };
      } else if (ev && snap) snap.ev = ev; // keep votes/outcome fresh
      lastEvent = 0;
    },
  };
}

export const resultActions: Handlers = {
  'eo-close': (_el, c) => { ui.eventResultOpen = false; c.render(); },
};
