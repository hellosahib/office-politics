// Game screen: board behind, DOM panels in front. One render() per client tick,
// one delegated click listener, panels only re-painted when their HTML changes.
import type { Action, GameView } from '../engine/types';
import type { GameClient } from '../client';
import { createBoard, type BoardOptions } from '../board/board';
import { esc, isMine, markEntered, motionOK, runEnter, setHtml, tweenMeters, ui, type Ctx, type Handlers } from './helpers';
import { canPlay, handActions, handHtml } from './hand';
import { pickerActions, pickerHtml } from './picker';
import { cinemaActions, createCinema, introHtml } from './cinema';
import { createResults, eventResultHtml, resultActions } from './results';
import { saveHtml, summaryActions, summaryHtml } from './summary';
import { eventActions, eventHtml } from './eventModal';
import { employeeActions, employeeHtml } from './employeePanel';
import { dashboardActions, dashboardHtml, topbarHtml } from './dashboard';
import { logActions, logHtml } from './log';
import { accusationActions, accusationHtml } from './accusation';
import { curtainActions, curtainHtml } from './curtain';
import { confetti, endGameActions, endGameHtml } from './endGame';
import { openHelp } from './howToPlay';
import { play as sfx, toggleMute } from './sound';

const handlers: Handlers = {
  ...handActions, ...summaryActions, ...eventActions, ...employeeActions, ...dashboardActions,
  ...logActions, ...accusationActions, ...curtainActions, ...endGameActions, ...pickerActions, ...cinemaActions, ...resultActions,
  'toast-close': (_el, c) => { ui.error = null; c.render(); },
  'help': () => openHelp(),
  'mute': (_el, c) => { toggleMute(); c.render(); },
};

/** Mounts the game into `root`. Returns a dispose function. `onExit` is called by Leave / Back to lobby. */
/** The board paints every trait the view knows; private intel only while this seat may see private info. */
function boardView(view: GameView): GameView {
  if (ui.canAct || view.phase === 'gameOver') return view;
  return { ...view, employees: view.employees.map(e => ({ ...e,
    hiddenTrait1: e.hiddenTrait1Public ? e.hiddenTrait1 : null, hiddenTrait2: e.hiddenTrait2Public ? e.hiddenTrait2 : null })) };
}

export function mountGame(root: HTMLElement, client: GameClient, onExit: () => void): () => void {
  Object.assign(ui, { acceptedMe: null, inspect: null, logDept: null, logTag: 'all', error: null, selectedCard: null, selectedTarget: null, giveCard: null,
    hoverTarget: null, eventPick: null, introFor: null, holdEvent: false, eventResultOpen: false });
  ui.undealt.clear(); ui.flown.clear();
  root.innerHTML = `<div class="game">
    <div id="board" class="board"></div>
    <header class="topbar" data-slot="topbar"></header>
    <aside class="panel dash" data-slot="dash" aria-label="Dashboard"></aside>
    <aside class="panel log" data-slot="log" aria-label="Political log"></aside>
    <section class="hand" data-slot="hand" aria-label="Hand"></section>
    <div data-slot="emp"></div>
    <div data-slot="event"></div>
    <div data-slot="modal"></div>
    <div data-slot="toast"></div>
    <div data-slot="curtain"></div>
  </div>`;
  const el = root.querySelector<HTMLElement>('.game')!;
  const slot = (name: string) => el.querySelector<HTMLElement>(`[data-slot="${name}"]`)!;
  const board = createBoard(el.querySelector<HTMLElement>('#board')!);
  let lastKey = '';
  let lastEvent = '';
  let disposed = false;
  let toastTimer = 0;
  let firstPaint = true;
  let logSeen = -1, turnSeen = '';
  /** Sounds for public log moments (capture, rebel) and a soft bell when a human's turn starts. */
  function moments(view: GameView): void {
    if (logSeen >= 0) for (const l of view.log.slice(logSeen)) {
      if (l.visibility !== 'public') continue;
      if (l.tag === 'capture') sfx('capture'); else if (l.tag === 'rebel') sfx('rebel');
    }
    logSeen = view.log.length;
    const t = `${view.round}:${view.currentPlayer}`;
    if (turnSeen && t !== turnSeen && view.phase !== 'gameOver' && !view.players[view.currentPlayer]?.isBot) sfx('turn');
    turnSeen = t;
  }
  const cinema = createCinema(el, () => render());
  const results = createResults(el, () => render());

  const ctx: Ctx = {
    get view() { return client.getView(); },
    client, board, render,
    async act(a: Action) {
      const r = await client.dispatch(a);
      if (!r.ok) { ui.error = r.error ?? 'Action rejected'; render(); }
      return r.ok;
    },
    exit() { dispose(); onExit(); },
  };

  function boardOptions(view: GameView): BoardOptions {
    const p = view.pending;
    if (isMine(view, client) && p.kind === 'eventTarget') {
      return p.choose === 'employee' ? { selectable: p.candidates, selected: null } : { highlightDepts: p.candidates };
    }
    if (ui.selectedCard && canPlay(view, client)) {
      return { selectable: client.legalTargets(ui.selectedCard), selected: ui.selectedTarget };
    }
    const hl = [ui.logDept, view.phase === 'event' ? view.activeEvent?.deptId : null].filter((d): d is string => !!d);
    return { selected: ui.inspect, highlightDepts: hl };
  }

  function render(): void {
    if (disposed) return;
    const view = client.getView();
    // A new decision point invalidates half-made choices.
    const key = `${view.actionCount}:${client.me}`;
    if (key !== lastKey) {
      lastKey = key;
      ui.selectedCard = ui.selectedTarget = ui.giveCard = ui.hoverTarget = ui.eventPick = null;
      ui.saveIds.clear();
    }
    const evId = view.activeEvent?.card.id ?? '';
    if (evId !== lastEvent) { lastEvent = evId; ui.eventMin = false; }

    moments(view);
    const curtain = curtainHtml(view, client); // also sets ui.canAct
    setHtml(slot('curtain'), curtain);
    if (curtain) {
      // Nothing private may sit under the curtain.
      for (const s of ['hand', 'emp', 'event', 'modal', 'dash']) setHtml(slot(s), '');
      board.update(boardView(view), {});
      return;
    }
    cinema.plan(view, client);
    results.check(view, client);
    setHtml(slot('topbar'), topbarHtml(view, client));
    setHtml(slot('dash'), dashboardHtml(view, client));
    setHtml(slot('log'), logHtml(view, client));
    setHtml(slot('hand'), handHtml(view, client));
    setHtml(slot('emp'), employeeHtml(view));
    setHtml(slot('event'), eventHtml(view, client));
    // One centred modal at a time. The event outcome is read before the active player's next controls appear.
    setHtml(slot('modal'), endGameHtml(view) || introHtml(view) || eventResultHtml(view, results.current())
      || saveHtml(view, client) || summaryHtml(view, client) || accusationHtml(view, client) || pickerHtml(view, client));
    setHtml(slot('toast'), ui.error
      ? `<div class="toast" role="alert">${esc(ui.error)} <button type="button" class="link" data-act="toast-close" aria-label="Dismiss">✕</button></div>` : '');
    if (ui.error) { clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { ui.error = null; render(); }, 4000); }
    // Entrance animations run once per new element key; the log backlog on mount stays still.
    if (firstPaint) { markEntered(slot('log')); firstPaint = false; }
    const fresh = runEnter(el);
    if (fresh.some(k => k.startsWith('endgame'))) { confetti(el, view.players.map(p => p.color)); sfx('end'); }
    tweenMeters(el);
    el.classList.toggle('show-dash', ui.showDash);
    el.classList.toggle('show-log', ui.showLog);
    el.classList.toggle('has-hand', slot('hand').innerHTML !== '');
    el.classList.toggle('hand-collapsed', !ui.handOpen);
    board.update(boardView(view), boardOptions(view));
    cinema.run();
  }

  board.onEmployeeClick(id => {
    const view = client.getView();
    const p = view.pending;
    if (isMine(view, client) && p.kind === 'eventTarget' && p.choose === 'employee' && p.candidates.includes(id)) {
      ui.eventPick = id; // selects in the picker; Confirm dispatches
      render();
      return;
    }
    if (ui.selectedCard && canPlay(view, client) && client.legalTargets(ui.selectedCard).includes(id)) ui.selectedTarget = id;
    else ui.inspect = id;
    render();
  });
  board.onDeptClick(id => {
    const view = client.getView();
    const p = view.pending;
    if (isMine(view, client) && p.kind === 'eventTarget' && p.choose === 'dept' && p.candidates.includes(id)) {
      ui.eventPick = id;
      render();
      return;
    }
    ui.logDept = ui.logDept === id ? null : id;
    board.focusDept(ui.logDept);
    render();
  });

  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('emp-backdrop')) { ui.inspect = null; render(); return; }
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    handlers[t.dataset.act!]?.(t, ctx);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // The details card sits on top of everything: close it first, leave the picker/event as they were.
    if (ui.inspect) ui.inspect = null;
    else if (ui.selectedTarget) ui.selectedTarget = null;
    else if (ui.selectedCard) ui.selectedCard = null;
    render();
  };
  const onResize = () => board.resize();
  // Picker rows preview their forecast on hover.
  const onHover = (e: PointerEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-hover]')?.dataset.hover ?? null;
    if (id && id !== ui.hoverTarget) { ui.hoverTarget = id; render(); }
  };
  slot('modal').addEventListener('pointerover', onHover);
  // Hover tilt on hand cards (fine pointers only); the CSS reads --rx/--ry.
  const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  const onTilt = (e: PointerEvent) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.hand .card');
    if (!card || !motionOK()) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--rx', `${(0.5 - (e.clientY - r.top) / r.height) * 10}deg`);
    card.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 12}deg`);
  };
  const onTiltOut = (e: PointerEvent) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.hand .card');
    card?.style.removeProperty('--rx'); card?.style.removeProperty('--ry');
  };
  if (fine) { slot('hand').addEventListener('pointermove', onTilt); slot('hand').addEventListener('pointerout', onTiltOut); }
  el.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  const unsub = client.subscribe(render);
  render();

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    clearTimeout(toastTimer);
    unsub();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    board.dispose();
  }
  return dispose;
}
