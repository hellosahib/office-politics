// §68 end game: CEO announcement, Takeover stats or Election scoring table, agendas revealed,
// political highlights rolling like credits.
import type { EmployeeView, GameView, TraitPole } from '../engine/types';
import { RANK_LABEL, TRAIT_LABEL } from '../engine/types';
import { portraitDataUrl } from '../board/portrait';
import { esc, colourNames, loyChip, motionOK, pname, weightLabel, type Handlers } from './helpers';

/** At game over the view fills in every hidden trait; hiddenTraitXPublic still says whether it was disclosed in play. */
function finalTraits(e: EmployeeView): string {
  const chip = (t: TraitPole | null, w: number, pub: boolean | null) =>
    `<span class="tchip sm${t ? '' : ' unknown'}">${t ? esc(TRAIT_LABEL[t]) : '???'} <span class="w">${weightLabel(w)}</span>${
      pub === null ? '' : `<span class="tmark${pub ? '' : ' was-hidden'}">${pub ? 'public' : 'was hidden'}</span>`}</span>`;
  return `<span class="tchips">${chip(e.permanentTrait, 1, null)}${chip(e.hiddenTrait1, 2, e.hiddenTrait1Public)}${chip(e.hiddenTrait2, 0, e.hiddenTrait2Public)}</span>`;
}

/** "Everyone's cards on the table": every department, its 4 employees, final loyalty, owner, all traits. */
function revealAllHtml(view: GameView): string {
  return `<div class="reveal-all">${view.departments.map(d => {
    const lead = d.teamLead === null ? null : view.players[d.teamLead];
    const emps = d.employeeIds.map(id => view.employees.find(e => e.id === id)).filter((e): e is EmployeeView => !!e).map(e => {
      const owner = e.politicalOwner === null ? null : view.players[e.politicalOwner];
      return `<li class="ra-emp" style="--pc:${esc(owner?.color ?? 'var(--line-2)')}">
        <img src="${portraitDataUrl(e)}" alt="" width="34" height="42" loading="lazy">
        <div class="ra-main"><div class="ra-name"><b>${esc(e.name)}</b>${loyChip(e.loyalty)}</div>
          <div class="ra-owner small muted">${owner ? pname(view, owner.id) : 'Unattached'}</div>${finalTraits(e)}</div></li>`;
    }).join('');
    return `<section class="ra-dept" style="--pc:${esc(lead?.color ?? 'var(--line-2)')}"><div class="ra-head"><b>${esc(d.name)}</b><span class="small muted">${lead ? `Lead ${pname(view, lead.id)}` : 'Neutral floor'}</span></div><ul>${emps}</ul></section>`;
  }).join('')}</div>`;
}

export function endGameHtml(view: GameView): string {
  if (view.phase !== 'gameOver') return '';
  const w = view.winner === null ? null : view.players[view.winner];
  const hero = w
    ? `<div class="ceo-kicker">Memo to all staff</div><h1 class="hero" style="--pc:${esc(w.color)}"><span class="hero-name">${esc(w.name)}</span><span class="hero-is">is the new CEO</span></h1>`
    : '<div class="ceo-kicker">Memo to all staff</div><h1 class="hero"><span class="hero-name">No CEO</span><span class="hero-is">this time</span></h1>';

  let table = '';
  if (view.scores) {
    const cols = ['Departments', 'Loyalists', 'Favorable', 'Rebels', 'Moles', 'Agenda', 'Total'];
    table = `<table class="scores"><thead><tr><th>Player</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>
      ${[...view.players].sort((a, b) => (view.scores![String(b.id)]?.total ?? 0) - (view.scores![String(a.id)]?.total ?? 0)).map(p => {
        const s = view.scores![String(p.id)];
        if (!s) return '';
        return `<tr class="${p.id === view.winner ? 'winner' : ''}"><td>${pname(view, p.id)}</td>
          <td>${s.departments}</td><td>${s.loyalists}</td><td>${s.favorable}</td><td>${s.rebels}</td><td>${s.molesPlanted}</td>
          <td>${s.agenda} ${s.agendaCompleted ? '<span class="good">✓</span>' : '<span class="bad">✗</span>'}</td><td class="total">${s.total}</td></tr>`;
      }).join('')}</tbody></table>`;
  } else {
    table = `<table class="scores"><thead><tr><th>Player</th><th>Rank</th><th>Departments</th><th>Loyalists</th><th>Favorable</th><th>Rebels</th><th>Active Moles</th></tr></thead><tbody>
      ${view.players.map(p => `<tr class="${p.id === view.winner ? 'winner' : ''}"><td>${pname(view, p.id)}${p.eliminated ? ' <span class="tag">out</span>' : ''}</td>
        <td>${RANK_LABEL[p.rank]}</td><td>${p.controlledDepartments.length}</td><td>${p.loyalists}</td><td>${p.favorable}</td><td>${p.rebels}</td><td>${p.activeMoles ?? '-'}</td></tr>`).join('')}
      </tbody></table>`;
  }

  const agendas = view.players.filter(p => p.agenda).map(p => {
    const done = view.scores?.[String(p.id)]?.agendaCompleted;
    return `<li style="--pc:${esc(p.color)}">${pname(view, p.id)} <b>${esc(p.agenda!.name)}</b> ${done === undefined ? '' : done ? '<span class="good">completed</span>' : '<span class="bad">failed</span>'}<div class="small muted">${esc(p.agenda!.objective)}</div></li>`;
  }).join('');
  const highlights = view.log.filter(l => l.visibility === 'public' && l.tag && l.tag !== 'event').slice(-6).reverse();

  return `<div class="modal-backdrop ceo-backdrop"><div class="modal endgame" role="dialog" aria-label="Game over" data-enter="endgame:${view.winner ?? 'none'}" data-anim="ceo">
    <div class="ceo-spot" aria-hidden="true"></div>
    ${hero}
    <div class="table-scroll">${table}</div>
    <div class="sec-title">Everyone's cards on the table</div>
    ${revealAllHtml(view)}
    ${agendas ? `<div class="sec-title">Secret agendas, declassified</div><ul class="agendas">${agendas}</ul>` : ''}
    ${highlights.length ? `<div class="sec-title">Political highlights</div><ul class="credits">${highlights.map((l, i) => `<li style="--i:${i}"><span class="log-r">R${l.round}</span><span>${colourNames(view, l.text)}</span></li>`).join('')}</ul>` : ''}
    <div class="row sheet-foot"><button type="button" class="primary" data-act="back-to-lobby">Back to lobby</button></div>
  </div></div>`;
}

/** Brass-and-player-colour confetti, ~3 s, canvas overlay. Skipped under reduced motion.
 *  `o` makes a short burst (card banner): fewer bits, shorter life, custom origin (0..1 of the viewport). */
export function confetti(host: HTMLElement, colors: string[], o: { count?: number; ms?: number; y?: number } = {}): void {
  if (!motionOK()) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  host.append(cv);
  const d = Math.min(window.devicePixelRatio || 1, 2);
  const W = (cv.width = innerWidth * d), H = (cv.height = innerHeight * d);
  const ctx = cv.getContext('2d')!;
  const palette = [...colors, '#d9ad62', '#f0c97f', '#ece7de'];
  const bits = Array.from({ length: o.count ?? 160 }, (_, i) => ({
    x: W * (0.2 + Math.random() * 0.6), y: H * (o.y ?? 0.35), vx: (Math.random() - 0.5) * 18 * d, vy: (-10 - Math.random() * 14) * d,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: (6 + Math.random() * 6) * d, h: (10 + Math.random() * 8) * d,
    c: palette[i % palette.length],
  }));
  const t0 = performance.now(), life = o.ms ?? 3600;
  const tick = (now: number) => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += 0.45 * d; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.scale(1, Math.cos(t / 120 + b.r));
      ctx.fillStyle = b.c; ctx.globalAlpha = Math.max(0, 1 - t / life); ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (t < life && cv.isConnected) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}

export const endGameActions: Handlers = {
  'back-to-lobby': (_el, c) => c.exit(),
};
