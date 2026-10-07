// §66 political log: newest first, private entries styled apart, tag filter chips, dept highlight.
import type { GameView } from '../engine/types';
import { colourNames, esc, ui, type Handlers } from './helpers';

export function logHtml(view: GameView): string {
  const tags = [...new Set(view.log.map(l => l.tag).filter((t): t is string => !!t))].sort();
  const chips = ['all', 'private', ...tags].map(t =>
    `<button type="button" class="chip${ui.logTag === t ? ' on' : ''}" data-act="log-tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  const dept = view.departments.find(d => d.id === ui.logDept)?.name;
  const entries = view.log
    // Local hot-seat: while a bot (or an un-curtained seat) is `me`, hide its private lines.
    .filter(l => ui.canAct || l.visibility === 'public')
    .filter(l => ui.logTag === 'all' || (ui.logTag === 'private' ? l.visibility !== 'public' : l.tag === ui.logTag))
    .slice().reverse()
    .map(l => {
      const cls = `${l.visibility !== 'public' ? 'private' : ''}${dept && l.text.includes(dept) ? ' hl' : ''}`;
      return `<li class="${cls}"><span class="muted">R${l.round}</span> ${l.visibility !== 'public' ? '<span class="tag-private">private</span> ' : ''}${colourNames(view, l.text)}</li>`;
    }).join('');
  return `<div class="log-head"><h3>Political log</h3>${dept ? `<button type="button" class="chip on" data-act="log-dept-clear">${esc(dept)} ✕</button>` : ''}</div>
    <div class="chips">${chips}</div>
    <ul class="log-list">${entries || '<li class="muted">Nothing yet.</li>'}</ul>`;
}

export const logActions: Handlers = {
  'log-tag': (el, c) => { ui.logTag = el.dataset.tag!; c.render(); },
  'log-dept-clear': (_el, c) => { ui.logDept = null; c.board.focusDept(null); c.render(); },
};
