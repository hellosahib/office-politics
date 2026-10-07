// Game-start and turn-start "table moments":
//  - "Meet your team" intro for the viewer's seat (once per seat per game, round 1).
//  - Influence deck riffle + new cards dealt one by one into the hand; old unsaved cards slide away.
//  - Event deck riffle + one card flying to the event modal position and flipping face-up.
// Detection is render-driven (diffs between views), so it works for local hot-seat and online alike.
// Web Animations API only; skippable by click; prefers-reduced-motion skips straight to the end state.
import type { CardId, EventCard, GameView, PlayerId } from '../engine/types';
import { TRAIT_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { portraitDataUrl } from '../board/portrait';
import { esc, loyChip, motionOK, ui, type Handlers } from './helpers';

// ---------------------------------------------------------------- intro ("Meet your team")
const INTRO_KEY = 'op:introSeen';
const introMem = new Set<string>();
const introId = (seed: number, seat: PlayerId) => `${seed}:${seat}`;
function introSeen(seed: number, seat: PlayerId): boolean {
  if (introMem.has(introId(seed, seat))) return true;
  try { return (JSON.parse(sessionStorage.getItem(INTRO_KEY) ?? '[]') as string[]).includes(introId(seed, seat)); } catch { return false; }
}
function markIntroSeen(seed: number, seat: PlayerId): void {
  introMem.add(introId(seed, seat));
  try {
    const all = JSON.parse(sessionStorage.getItem(INTRO_KEY) ?? '[]') as string[];
    sessionStorage.setItem(INTRO_KEY, JSON.stringify([...all, introId(seed, seat)].slice(-20)));
  } catch { /* private mode: memory only */ }
}

export function introHtml(view: GameView): string {
  const seat = ui.introFor;
  if (seat === null) return '';
  const me = view.players[seat];
  const d = view.departments.find(x => x.id === me?.controlledDepartments[0]);
  if (!me || !d) return '';
  const team = d.employeeIds.map(id => view.employees.find(e => e.id === id)!).filter(Boolean).map((e, i) => `
    <figure class="intro-emp" style="--i:${i}">
      <img src="${portraitDataUrl(e)}" alt="" width="96" height="120">
      <figcaption><b>${esc(e.name)}</b><span class="role">${esc(e.role)}</span>
        <span class="stamp sm">${TRAIT_LABEL[e.permanentTrait]} (+1)</span>
        <span class="intro-visual">“${esc(e.visual)}”</span>${loyChip(e.loyalty)}</figcaption>
    </figure>`).join('');
  const rivals = view.players.filter(p => p.id !== seat).map(p => {
    const rd = view.departments.find(x => x.id === p.controlledDepartments[0]);
    return `<li style="--pc:${esc(p.color)}"><span class="pname" style="--pc:${esc(p.color)}">${esc(p.name)}</span> <span class="muted">leads</span> ${esc(rd?.name ?? '—')}</li>`;
  }).join('');
  return `<div class="modal-backdrop intro-backdrop"><div class="sheet intro" role="dialog" aria-modal="true" aria-labelledby="intro-title" style="--pc:${esc(me.color)}" data-enter="intro:${seat}" data-anim="pop">
    <div class="sheet-kicker">Day one · ${esc(me.name)}</div>
    <h2 id="intro-title">Meet your team</h2>
    <p class="intro-lead">You lead <b>${esc(d.name)}</b>. These four report to you — for now. Keep them on your side while you reach for the rest of the company.</p>
    <div class="intro-team">${team}</div>
    <div class="intro-rivals"><span class="label">Across the floor</span><ul>${rivals}</ul></div>
    <div class="row sheet-foot"><span class="muted small">Hidden traits stay secret until revealed.</span>
      <button type="button" class="primary big-btn" data-act="intro-go">Let's go</button></div>
  </div></div>`;
}

// ---------------------------------------------------------------- animation sequencer
type Step = { kind: 'deal'; ids: CardId[] } | { kind: 'event'; card: EventCard };

export interface Cinema {
  /** Before painting: decide the intro, hide fresh cards, hold the event modal, slide discards away. */
  plan(view: GameView, client: GameClient): void;
  /** After painting: play queued steps (no-op while the intro is open or a sequence is running). */
  run(): void;
}

export function createCinema(root: HTMLElement, render: () => void): Cinema {
  const dealt = new Map<PlayerId, Set<CardId>>();
  let lastSeat: PlayerId | null = null;
  let lastEventKey: string | undefined;
  const queue: Step[] = [];
  let running = false, skipping = false;
  const live: Animation[] = [];

  const play = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions): Promise<unknown> => {
    if (skipping) return Promise.resolve();
    const a = el.animate(kf, { fill: 'forwards', ...o });
    live.push(a);
    return a.finished.catch(() => undefined);
  };
  const div = (cls: string, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
  const deckEl = (kind: 'influence' | 'event', y: number) => {
    const d = div(`deck deck-${kind}`, Array.from({ length: 6 }, (_, i) => `<i class="cback ${kind}" style="--i:${i}"></i>`).join('')
      + `<span class="deck-label">${kind === 'event' ? 'Event deck' : 'Influence deck'}</span>`);
    d.style.top = `${y}px`;
    return d;
  };
  async function riffle(deck: HTMLElement) {
    await play(deck, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.85)' }, { opacity: 1, transform: 'translate(-50%,-50%)' }], { duration: 160, easing: 'ease-out' });
    await Promise.all([...deck.querySelectorAll('.cback')].map((c, i) => {
      const side = i % 2 ? 1 : -1, base = `translate(${-i}px,${-i * 1.5}px)`;
      return play(c, [{ transform: base }, { transform: `translate(${side * 58}px,${-i * 1.5 - 6}px) rotate(${side * 9}deg)`, offset: 0.4 }, { transform: base }],
        { duration: 420, delay: i * 14, easing: 'cubic-bezier(.5,0,.3,1)' });
    }));
  }

  function reveal(id: CardId) {
    ui.undealt.delete(id);
    const w = root.querySelector<HTMLElement>(`.hand .card-wrap[data-card="${CSS.escape(id)}"]`);
    if (!w) return;
    w.classList.remove('undealt');
    if (!skipping) w.animate([{ transform: 'perspective(800px) rotateY(80deg)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
  }

  async function deal(overlay: HTMLElement, ids: CardId[]) {
    const deck = deckEl('influence', innerHeight * 0.52);
    overlay.append(deck);
    await riffle(deck);
    const from = deck.getBoundingClientRect();
    await Promise.all(ids.map(async (id, i) => {
      const w = root.querySelector<HTMLElement>(`.hand .card-wrap[data-card="${CSS.escape(id)}"]`);
      const r = w?.querySelector('.card')?.getBoundingClientRect();
      if (!r || !r.width || skipping) return reveal(id);
      const g = div('cback influence flying');
      Object.assign(g.style, { left: `${from.left + from.width / 2 - r.width / 2}px`, top: `${from.top + from.height / 2 - r.height / 2}px`, width: `${r.width}px`, height: `${r.height}px` });
      overlay.append(g);
      const dx = r.left - (from.left + from.width / 2 - r.width / 2), dy = r.top - (from.top + from.height / 2 - r.height / 2);
      await play(g, [{ transform: 'translate(0,0) rotate(-10deg) scale(.55)' }, { transform: `translate(${dx}px,${dy}px) rotate(0) scale(1)` }],
        { duration: 430, delay: i * 170, easing: 'cubic-bezier(.2,.8,.25,1)' });
      g.remove();
      reveal(id);
    }));
    await play(deck, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    deck.remove();
  }

  async function flipEvent(overlay: HTMLElement, card: EventCard) {
    const deck = deckEl('event', innerHeight * 0.5);
    overlay.append(deck);
    await riffle(deck);
    const from = deck.getBoundingClientRect();
    const f = div(`ev-flip ev-${card.type.toLowerCase()}`, `<div class="ev-flip-in">
      <div class="face back cback event"></div>
      <div class="face front"><span class="badge badge-${card.type.toLowerCase()}">${esc(card.type)}</span><b>${esc(card.title)}</b><span class="ev-flip-sit">${esc(card.situation)}</span></div></div>`);
    const W = 200, H = 270;
    Object.assign(f.style, { left: `${from.left + from.width / 2 - W / 2}px`, top: `${from.top + from.height / 2 - H / 2}px`, width: `${W}px`, height: `${H}px` });
    overlay.append(f);
    deck.querySelector('.cback:last-of-type')?.remove();
    const dy = Math.max(70, innerHeight * 0.18) + H / 2 - (from.top + from.height / 2);
    await play(f, [{ transform: 'translate(0,0) scale(.8)' }, { transform: `translate(0,${dy}px) scale(1.12)` }], { duration: 420, easing: 'cubic-bezier(.2,.8,.25,1)' });
    deck.remove();
    await play(f.firstElementChild!, [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: 460, easing: 'cubic-bezier(.3,.7,.3,1)' });
    await play(f, [{ opacity: 1, transform: `translate(0,${dy}px) scale(1.12)` }, { opacity: 1, offset: 0.6 }, { opacity: 0, transform: `translate(0,${dy}px) scale(1.3)` }], { duration: 520 });
    f.remove();
  }

  function skip() {
    skipping = true;
    for (const a of live) { try { a.finish(); } catch { /* already done */ } }
  }

  async function run() {
    // Wait for the intro and for a pending event outcome to be read first.
    if (running || ui.introFor !== null || ui.eventResultOpen || !queue.length) return;
    running = true; skipping = false; live.length = 0;
    const overlay = div('cinema', '<span class="cinema-skip">Click to skip</span>');
    overlay.addEventListener('click', skip);
    root.append(overlay);
    while (queue.length && !skipping) {
      const s = queue.shift()!;
      if (s.kind === 'deal') await deal(overlay, s.ids); else await flipEvent(overlay, s.card);
    }
    queue.length = 0;
    ui.undealt.clear();
    ui.holdEvent = false;
    overlay.remove();
    running = false;
    render();
  }

  function plan(view: GameView, client: GameClient) {
    const seat = ui.canAct ? client.me : null;
    const motion = motionOK();
    ui.introFor = seat !== null && view.round === 1 && view.phase !== 'gameOver' && !introSeen(view.config.seed, seat) ? seat : null;
    const intro = ui.introFor !== null;

    if (seat !== null) {
      const p = view.players[seat];
      const hand = p.hand ?? [];
      const keep = new Set([...hand, ...(p.reserve ?? [])].map(c => c.id));
      // Unsaved cards that left the hand: slide the old DOM copies away.
      if (lastSeat === seat && motion) {
        const gone = [...root.querySelectorAll<HTMLElement>('.hand .card-wrap[data-card]')]
          .filter(w => !keep.has(w.dataset.card!) && !ui.flown.has(w.dataset.card!));
        gone.forEach((w, i) => {
          const card = w.querySelector<HTMLElement>('.card');
          const r = card?.getBoundingClientRect();
          if (!card || !r?.width) return;
          const g = card.cloneNode(true) as HTMLElement;
          g.classList.add('card-ghost');
          Object.assign(g.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', zIndex: '55', pointerEvents: 'none' });
          document.body.append(g);
          g.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${innerWidth - r.left + 40}px, 60px) rotate(18deg) scale(.7)`, opacity: 0 }],
            { duration: 520, delay: i * 70, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).onfinish = () => g.remove();
        });
      }
      lastSeat = seat;
      let set = dealt.get(seat);
      if (!set) { set = new Set(intro ? [] : hand.map(c => c.id)); dealt.set(seat, set); }
      const fresh = hand.map(c => c.id).filter(id => !set!.has(id));
      fresh.forEach(id => set!.add(id));
      if (fresh.length && motion) { fresh.forEach(id => ui.undealt.add(id)); queue.push({ kind: 'deal', ids: fresh }); }
    }

    const ev = view.activeEvent;
    const turnKey = (view as GameView & { turn?: { number: number } }).turn?.number ?? `${view.round}:${view.currentPlayer}`;
    const key = ev ? `${turnKey}:${ev.card.id}` : '';
    if (key !== (lastEventKey ?? '') && ev) {
      const first = lastEventKey === undefined;
      lastEventKey = key;
      if (motion && seat !== null && (!first || intro) && (view.currentPlayer === seat || ev.card.type === 'Global')) {
        ui.holdEvent = true;
        queue.push({ kind: 'event', card: ev.card });
      }
    } else if (lastEventKey === undefined) lastEventKey = key;
  }

  return { plan, run: () => void run() };
}

export const cinemaActions: Handlers = {
  'intro-go': (_el, c) => {
    if (ui.introFor !== null) markIntroSeen(c.view.config.seed, ui.introFor);
    ui.introFor = null;
    c.render();
  },
};
