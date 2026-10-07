// §66 political log: newest first, private entries styled apart, tag filter chips ("mine" = lines
// about the viewer), dept highlight. Lines render the engine's narrative text as-is; score
// breakdowns (tag 'explanation') never appear here — they live in the forecast and the card banner.
import type { GameView } from '../engine/types';
import type { GameClient } from '../client';
import { colourNames, esc, mentions, ui, type Handlers } from './helpers';

export function logHtml(view: GameView, client: GameClient): string {
  const lines = view.log.map((l, i) => ({ l, i })).filter(({ l }) => l.tag !== 'explanation');
  const tags = [...new Set(lines.map(({ l }) => l.tag).filter((t): t is string => !!t))].sort();
  const me = ui.canAct && client.me !== null ? view.players[client.me] : null;
  const chips = ['all', ...(me ? ['mine'] : []), 'private', ...tags].map(t =>
    `<button type="button" class="chip${ui.logTag === t ? ' on' : ''}" data-act="log-tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  const dept = view.departments.find(d => d.id === ui.logDept)?.name;
  const entries = lines
    // Local hot-seat: while a bot (or an un-curtained seat) is `me`, hide its private lines.
    .filter(({ l }) => ui.canAct || l.visibility === 'public')
    .filter(({ l }) => ui.logTag === 'all'
      || (ui.logTag === 'private' ? l.visibility !== 'public'
        : ui.logTag === 'mine' ? !!me && (l.visibility === me.id || mentions(l.text, me.name))
          : l.tag === ui.logTag))
    .reverse()
    .map(({ l, i }) => {
      const cls = `t-${esc(l.tag ?? 'none')}${l.visibility !== 'public' ? ' private' : ''}${dept && l.text.includes(dept) ? ' hl' : ''}`;
      return `<li class="${cls}" data-enter="log:${i}" data-anim="log"><span class="log-r">R${l.round}</span><span class="log-t">${l.visibility !== 'public' ? '<span class="tag-private">private</span> ' : ''}${colourNames(view, l.text)}</span></li>`;
    }).join('');
  return `<div class="log-head"><h3>Political log</h3>${dept ? `<button type="button" class="chip on" data-act="log-dept-clear">${esc(dept)} ✕</button>` : ''}</div>
    <div class="chips">${chips}</div>
    <ul class="log-list" data-scroll="log">${entries || '<li class="muted empty">Nothing on the record yet.</li>'}</ul>`;
}

export const logActions: Handlers = {
  'log-tag': (el, c) => { ui.logTag = el.dataset.tag!; c.render(); },
  'log-dept': (el, c) => { ui.logDept = ui.logDept === el.dataset.id ? null : el.dataset.id!; c.board.focusDept(ui.logDept); c.render(); },
  'log-dept-clear': (_el, c) => { ui.logDept = null; c.board.focusDept(null); c.render(); },
};
