// Game screen: board behind, DOM panels in front. One render() per client tick,
// one delegated click listener, panels only re-painted when their HTML changes.
import type { Action, GameView } from '../engine/types';
import type { GameClient } from '../client';
import { createBoard, type BoardOptions } from '../board/board';
import { esc, isMine, setHtml, ui, type Ctx, type Handlers } from './helpers';
import { canPlay, focusChooserHtml, handActions, handHtml } from './hand';
import { saveHtml, summaryActions, summaryHtml } from './summary';
import { eventActions, eventHtml } from './eventModal';
import { employeeActions, employeeHtml } from './employeePanel';
import { dashboardActions, dashboardHtml, topbarHtml } from './dashboard';
import { logActions, logHtml } from './log';
import { accusationActions, accusationHtml } from './accusation';
import { curtainActions, curtainHtml } from './curtain';
import { endGameActions, endGameHtml } from './endGame';
import { openHelp } from './howToPlay';

const handlers: Handlers = {
  ...handActions, ...summaryActions, ...eventActions, ...employeeActions, ...dashboardActions,
  ...logActions, ...accusationActions, ...curtainActions, ...endGameActions,
  'toast-close': (_el, c) => { ui.error = null; c.render(); },
  'help': () => openHelp(),
};

/** Mounts the game into `root`. Returns a dispose function. `onExit` is called by Leave / Back to lobby. */
export function mountGame(root: HTMLElement, client: GameClient, onExit: () => void): () => void {
  Object.assign(ui, { acceptedMe: null, inspect: null, logDept: null, logTag: 'all', error: null, selectedCard: null, selectedTarget: null, giveCard: null });
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
      ui.selectedCard = ui.selectedTarget = ui.giveCard = null;
      ui.saveIds.clear();
    }
    const evId = view.activeEvent?.card.id ?? '';
    if (evId !== lastEvent) { lastEvent = evId; ui.eventMin = false; }

    const curtain = curtainHtml(view, client); // also sets ui.canAct
    setHtml(slot('curtain'), curtain);
    if (curtain) {
      // Nothing private may sit under the curtain.
      for (const s of ['hand', 'emp', 'event', 'modal', 'dash']) setHtml(slot(s), '');
      board.update(view, {});
      return;
    }
    setHtml(slot('topbar'), topbarHtml(view, client));
    setHtml(slot('dash'), dashboardHtml(view, client));
    setHtml(slot('log'), logHtml(view));
    setHtml(slot('hand'), handHtml(view, client));
    setHtml(slot('emp'), employeeHtml(view));
    setHtml(slot('event'), eventHtml(view, client));
    setHtml(slot('modal'), endGameHtml(view) || focusChooserHtml(view, client) || saveHtml(view, client)
      || summaryHtml(view, client) || accusationHtml(view, client));
    setHtml(slot('toast'), ui.error
      ? `<div class="toast" role="alert">${esc(ui.error)} <button type="button" class="link" data-act="toast-close" aria-label="Dismiss">✕</button></div>` : '');
    if (ui.error) { clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { ui.error = null; render(); }, 4000); }
    el.classList.toggle('show-dash', ui.showDash);
    el.classList.toggle('show-log', ui.showLog);
    el.classList.toggle('has-hand', slot('hand').innerHTML !== '');
    el.classList.toggle('hand-collapsed', !ui.handOpen);
    board.update(view, boardOptions(view));
  }

  board.onEmployeeClick(id => {
    const view = client.getView();
    const p = view.pending;
    if (isMine(view, client) && p.kind === 'eventTarget' && p.choose === 'employee' && p.candidates.includes(id)) {
      void ctx.act({ type: 'eventTarget', player: client.me!, targetId: id });
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
      void ctx.act({ type: 'eventTarget', player: client.me!, targetId: id });
      return;
    }
    ui.logDept = ui.logDept === id ? null : id;
    board.focusDept(ui.logDept);
    render();
  });

  const onClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    handlers[t.dataset.act!]?.(t, ctx);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (ui.selectedTarget) ui.selectedTarget = null;
    else if (ui.selectedCard) ui.selectedCard = null;
    else ui.inspect = null;
    render();
  };
  const onResize = () => board.resize();
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
