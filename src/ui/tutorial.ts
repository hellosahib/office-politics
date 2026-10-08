// Interactive tutorial: a real local game (full board, you + 2 bots, fixed seed) with a coach overlay.
// Each step spotlights one piece of UI and advances itself when the expected thing happens (read from
// the view, the pending decision and the UI state) or with Next when it is only informational.
// The coach never blocks the game: the spotlight is click-through, Skip ends it at any time.
import type { GameConfig, GameView } from '../engine/types';
import { esc, ui, type Ctx } from './helpers';

/** Seat 0 moves first; the first event is the Local "Client Complaint" (both options pick an employee)
 *  and the first hand has an affordable positive card. Found by running the engine over seeds 1…n. */
export const TUTORIAL_SEED = 4;
const DONE_KEY = 'op:tutorialDone';

export function tutorialConfig(name: string): GameConfig {
  return {
    playerCount: 3, mode: 'Takeover', seed: TUTORIAL_SEED, board: 'full',
    players: [{ name: name || 'You', isBot: false }, { name: 'Morgan', isBot: true }, { name: 'Riley', isBot: true }],
  };
}
export const tutorialDone = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; } };
const markDone = () => { try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode */ } };

// The lobby asks for a tutorial; the game screen that mounts next picks the request up.
let requested = false;
export const requestTutorial = () => { requested = true; };
export const takeTutorialRequest = () => { const r = requested; requested = false; return r; };

interface Step {
  /** Spotlight target: a selector, a rect, or nothing (centred card). */
  target?: (c: Ctx) => Element | DOMRect | null | string;
  title: string;
  body: (v: GameView) => string;
  /** Show only once this holds (otherwise the coach waits, hidden). */
  ready?: (v: GameView, c: Ctx) => boolean;
  /** Advance as soon as this holds. */
  done?: (v: GameView, c: Ctx) => boolean;
  /** Go back one step when this holds (e.g. the picker was cancelled). */
  back?: (v: GameView) => boolean;
  /** Show a Next button. */
  next?: boolean;
  enter?: (c: Ctx) => void;
  leave?: (c: Ctx) => void;
}

const has = (sel: string) => !!document.querySelector(sel);
const myDept = (v: GameView) => v.players[0]?.controlledDepartments[0] ?? null;
const deptName = (v: GameView) => esc(v.departments.find(d => d.id === myDept(v))?.name ?? 'your department');
const myTurn = (v: GameView) => v.currentPlayer === 0 && v.phase !== 'gameOver';
let mark = 0; // actionCount when a step started (card play detection)

const STEPS: Step[] = [
  {
    title: 'Welcome to Office Politics',
    body: () => `<p>You just joined the company as a <b>Team Lead</b>. Two rivals, Morgan and Riley (bots), want the same thing you do: the CEO's chair.</p>
      <p><b>Your goal:</b> win employees over, capture departments (3 of a department's 4 on your side), and control <b>5 departments</b> to become CEO.</p>
      <p>This tutorial walks you through your first turn. Then the game is yours.</p>`,
    next: true,
  },
  {
    target: () => '.intro',
    title: 'Meet your team',
    body: v => `<p>You lead <b>${deptName(v)}</b>. These four report to you. Each shows one <b>known trait</b>; two more are hidden.</p><p>Press <b>Let's go</b>.</p>`,
    done: () => ui.introFor === null,
  },
  {
    target: c => c.board.deptScreenRect?.(myDept(c.view) ?? '') ?? '#board',
    title: 'Your department on the board',
    body: v => `<p>This is <b>${deptName(v)}</b>. Each standee is an employee; the ring under them is their loyalty, the card edge the player they side with.</p>
      <p><b>Click one of your employees.</b></p>`,
    ready: () => !has('.cinema'),
    enter: c => { ui.eventMin = true; c.board.focusDept(myDept(c.view)); c.render(); },
    leave: c => { c.board.focusDept(null); },
    done: () => ui.inspect !== null,
  },
  {
    target: () => '.emp-card',
    title: 'The personnel file',
    body: () => `<p><b>Traits</b> decide how people react to your cards. Everyone has three: one <b>known</b> (+1), one hidden worth <b>+2</b> and one hidden worth <b>0</b>. Striped bars are traits you haven't learned yet.</p>
      <p><b>Loyalty</b> runs Rebel → Skeptical → Neutral → Favorable → Loyal. Someone is on your side (<b>political side</b>) while Favorable or Loyal to you.</p>`,
    next: true,
    leave: c => { ui.inspect = null; c.render(); },
    done: () => ui.inspect === null,
  },
  {
    target: () => '.event-panel',
    title: 'Every turn starts with an event',
    body: () => `<p>This is a <b>Local</b> event: a dilemma for one of your departments. The strip underneath shows <b>who it affects</b>; click a face to open their file.</p>
      <p><b>Pick an option.</b> Both ask you to choose an employee next.</p>`,
    enter: c => { ui.eventMin = false; c.render(); },
    ready: v => v.pending.kind === 'eventChoice' && !has('.cinema'),
    done: v => v.pending.kind !== 'eventChoice',
  },
  {
    target: () => '.picker',
    title: 'Choose the target',
    body: () => `<p>Pick an employee from the list (or click them on the board), check their loyalty and traits on the right, then press <b>Confirm</b>.</p>`,
    ready: v => v.pending.kind === 'eventTarget',
    done: v => v.pending.kind !== 'eventTarget' && v.pending.kind !== 'eventChoice',
  },
  {
    target: () => '.event-outcome',
    title: 'What happened',
    body: () => `<p>The outcome shows the option taken and what changed for each player's team: loyalty moves, Influence, protection. Everyone sees this.</p><p>Press <b>Continue</b>.</p>`,
    ready: () => ui.eventResultOpen,
    done: v => !ui.eventResultOpen && v.pending.kind === 'play',
  },
  {
    target: () => window.innerWidth <= 760 ? '.hand .hand-head' : '.dash .stat-infl',
    title: 'Influence',
    body: v => `<p><b>Influence</b> is your only resource: you get ${v.players[0]?.influenceMax ?? 4} each turn, minus upkeep for extra departments. Every card costs some.</p>`,
    ready: v => v.pending.kind === 'play' && !has('.cinema'),
    next: true,
  },
  {
    target: () => document.querySelector('.hand .card.dir-positive:not(.dim)')?.closest('.card-wrap') ?? '.hand .card-wrap',
    title: 'Reading a card',
    body: () => `<p><b>Cost</b> is the brass coin. The arrow is the <b>direction</b>: ↑ positive works on your team (and unattached rivals), ↓ hostile and ◉ mole hit other teams.</p>
      <p><span class="tchip sm plus">+Trait</span> affinities help when the target has that trait, <span class="tchip sm minus">−Trait</span> hurts. <b>Strong</b> is the bonus on a great roll; <b>Backfire</b> is what goes wrong on a failure.</p>`,
    next: true,
  },
  {
    target: () => '.hand .cards',
    title: 'Pick a card',
    body: () => '<p><b>Click a card that isn\'t dimmed</b>, ideally a ↑ positive one. Dimmed cards say why they can\'t be played.</p>',
    ready: v => v.pending.kind === 'play',
    enter: c => { ui.handOpen = true; mark = c.view.actionCount; c.render(); },
    done: () => ui.selectedCard !== null,
  },
  {
    target: () => '.picker',
    title: 'The target window',
    body: () => `<p>Everyone this card can reach, grouped by department. Trait chips turn <span class="tchip sm plus">green</span> when they help this card and <span class="tchip sm minus">red</span> when they hurt; <span class="tchip sm unknown">???</span> is still hidden.</p>
      <p>Hover or pick someone: the <b>forecast</b> shows the likely result. "Unknown trait may affect result" means a hidden +2 could swing it.</p>
      <p>Pick a target and press <b>Play card</b>.</p>`,
    back: v => !ui.selectedCard && v.actionCount === mark,
    done: v => v.actionCount > mark,
  },
  {
    target: () => '.card-banner',
    title: 'The result',
    body: () => `<p>Everyone sees this banner: <b>Failure</b> (score 0–1), <b>Success</b> (2–3, one step) or <b>Strong Success</b> (4+, one step plus the bonus). Your own "Why?" shows the score.</p>`,
    next: true,
  },
  {
    target: () => '[data-act="done-playing"]',
    title: 'Keep going or stop',
    body: () => `<p>Play more cards while you can afford them (one card per employee per turn). When you're done, press <b>Done playing</b>.</p>`,
    ready: v => v.pending.kind === 'play' && !has('.card-banner'),
    done: v => v.pending.kind !== 'play',
  },
  {
    target: () => '.save',
    title: 'Save for later',
    body: () => `<p>Unplayed cards are discarded at the end of your turn unless you <b>save</b> them: 1 Influence each, at most 3 in your reserve. Saved cards can also be <b>given</b> to rivals as part of a deal.</p><p>Tick any you want to keep and press <b>Confirm</b>.</p>`,
    ready: v => v.pending.kind === 'save',
    done: v => v.pending.kind !== 'save' && v.pending.kind !== 'play',
  },
  {
    target: () => '.report',
    title: 'End-of-turn report',
    body: () => '<p>Everything that changed this turn: Influence spent, cards played, loyalty moves, captures. Press <b>End turn</b> to hand over to the next player.</p>',
    ready: v => v.pending.kind === 'summary',
    done: v => !myTurn(v) || v.pending.kind !== 'summary',
  },
  {
    target: () => window.innerWidth <= 760 ? null : '.log',
    title: 'Watching the bots',
    body: v => `<p>Morgan and Riley take their turns now. Their events, card banners and outcomes play out on your screen, and the <b>Political log</b> keeps the history. Click any name in it to open a file.</p>
      <p>On a <b>Global</b> event everyone votes secretly, you included${v.pending.kind === 'eventChoice' && v.pending.player === 0 ? ': <b>cast your vote now</b>' : ''}.</p>`,
    ready: v => !myTurn(v),
    next: true,
    done: v => myTurn(v) && v.round > 1,
  },
  {
    title: 'A new turn',
    body: () => `<p>Each turn: an event, fresh Influence, 4 new cards. Things to watch:</p>
      <p><b>Moles</b> (◉) freeze a rival's employee. <b>Rebels</b> (!) break away; 3 in one department costs its lead the department. <b>Capture</b> a department with 3 of its 4 on your side.</p>
      <p><b>Takeover</b>: first to 5 departments is CEO. <b>Election</b>: highest score after 6, 8 or 10 rounds.</p>`,
    ready: v => myTurn(v) && v.round > 1 && !has('.cinema') && !ui.eventResultOpen,
    next: true,
  },
  {
    title: "You're on your own now",
    body: () => '<p>That\'s the whole loop. The game carries on from here. <b>How to play</b> (the ? in the top bar) has every rule. Good luck.</p>',
    next: true,
  },
];

/** Starts the coach over the mounted game. Returns stop(). */
export function startTutorial(root: HTMLElement, c: Ctx): () => void {
  const el = document.createElement('div');
  el.className = 'coach';
  el.innerHTML = '<div class="coach-spot"></div><div class="coach-card" role="dialog" aria-live="polite" aria-label="Tutorial"></div>';
  root.append(el);
  const spot = el.querySelector<HTMLElement>('.coach-spot')!;
  const card = el.querySelector<HTMLElement>('.coach-card')!;
  let i = -1, shown = '';

  const go = (n: number) => {
    STEPS[i]?.leave?.(c);
    i = n;
    shown = '';
    if (i >= STEPS.length) return stop();
    STEPS[i].enter?.(c);
  };
  card.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-coach]')?.dataset.coach;
    if (a === 'next') go(i + 1);
    else if (a === 'skip') stop();
  });

  function tick(): void {
    const v = c.view;
    const s = STEPS[i];
    if (!s) return;
    if (s.done?.(v, c)) return go(i + 1);
    if (s.back?.(v)) return go(i - 1);
    // Hidden while the step waits, during the deal/flip cinema, and under the hot-seat curtain.
    if ((s.ready && !s.ready(v, c)) || has('.cinema') || has('.curtain')) { el.hidden = true; return; }
    el.hidden = false;
    const key = `${i}:${v.pending.kind}:${'player' in v.pending ? v.pending.player : ''}`; // re-word when the decision moves
    if (shown !== key) {
      shown = key;
      card.innerHTML = `<div class="coach-kicker">Tutorial · ${i + 1}/${STEPS.length}</div>
        <h3>${esc(s.title)}</h3>${s.body(v)}
        <div class="coach-foot"><button type="button" class="link" data-coach="skip">Skip tutorial</button>
        ${s.next ? `<button type="button" class="primary" data-coach="next">${i === STEPS.length - 1 ? 'Finish' : 'Next'}</button>` : '<span class="coach-wait">Your move…</span>'}</div>`;
    }
    place(s.target?.(c) ?? null);
  }

  function place(t: Element | DOMRect | string | null): void {
    const target = typeof t === 'string' ? document.querySelector(t) : t;
    const r = target instanceof Element ? target.getBoundingClientRect() : target;
    const W = innerWidth, H = innerHeight, cr = card.getBoundingClientRect(), pad = 8, gap = 14;
    if (!r || !r.width) {
      spot.style.display = 'none';
      el.classList.add('dim');
      card.style.left = `${(W - cr.width) / 2}px`; card.style.top = `${(H - cr.height) / 2}px`;
      return;
    }
    el.classList.remove('dim');
    const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
    Object.assign(spot.style, { display: 'block', left: `${x}px`, top: `${y}px`,
      width: `${Math.min(W - 8, r.right + pad) - x}px`, height: `${Math.min(H - 8, r.bottom + pad) - y}px` });
    // Beside the target where there's room: below, above, then right/left; else pinned to the top.
    let top: number, left = Math.min(Math.max(8, r.left + r.width / 2 - cr.width / 2), W - cr.width - 8);
    if (H - r.bottom - pad - gap >= cr.height) top = r.bottom + pad + gap;
    else if (r.top - pad - gap >= cr.height) top = r.top - pad - gap - cr.height;
    else if (W - r.right - pad - gap >= cr.width) { left = r.right + pad + gap; top = Math.min(Math.max(8, r.top), H - cr.height - 8); }
    else if (r.left - pad - gap >= cr.width) { left = r.left - pad - gap - cr.width; top = Math.min(Math.max(8, r.top), H - cr.height - 8); }
    else top = r.top + r.height / 2 > H / 2 ? 8 : H - cr.height - 8;
    card.style.left = `${left}px`; card.style.top = `${top}px`;
  }

  // ponytail: polling at 4 Hz keeps the coach independent of render order; a hook per render would be tighter.
  const timer = window.setInterval(tick, 250);
  let stopped = false;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    STEPS[i]?.leave?.(c);
    clearInterval(timer);
    el.remove();
    markDone();
  }
  go(0);
  tick();
  return stop;
}
