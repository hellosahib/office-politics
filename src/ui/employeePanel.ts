// §59 employee card as a personnel dossier + §63 private mole panel.
import type { GameView, TraitPole } from '../engine/types';
import { LOYALTY_LADDER, TRAIT_LABEL } from '../engine/types';
import { portraitDataUrl } from '../board/portrait';
import { colourNames, deptName, esc, pname, ui, weightLabel, type Handlers } from './helpers';

/** Known trait = stamped chip; unknown = redacted bar. */
const trait = (label: string, t: TraitPole | null, w: number, isPublic = true) => `<div class="trait-row"><span class="trait-k">${label}</span>${t
  ? `<span class="stamp">${TRAIT_LABEL[t]} <span class="w">${weightLabel(w)}</span></span>${label === 'Known' ? '' : isPublic ? ' <span class="tag">public</span>' : ' <span class="tag-private">🔒 private</span>'}`
  : `<span class="redacted" title="Unknown trait (???)" aria-label="Unknown trait">███████</span><span class="w muted">${weightLabel(w)}</span>`}</div>`;

export function employeeHtml(view: GameView): string {
  const e = view.employees.find(x => x.id === ui.inspect);
  if (!e) return '';
  // Hide `me`'s private knowledge when this screen may not show it (bot seat in hot-seat).
  const mole = e.mole && (ui.canAct || e.mole.visibleBecause === 'exposed') ? e.mole : null;
  const h1 = ui.canAct || e.hiddenTrait1Public ? e.hiddenTrait1 : null;
  const h2 = ui.canAct || e.hiddenTrait2Public ? e.hiddenTrait2 : null;
  const recent = view.log.filter(l => l.visibility === 'public' && l.text.includes(e.name)).slice(-5).reverse();
  const step = LOYALTY_LADDER.indexOf(e.loyalty);
  const ladder = LOYALTY_LADDER.map((s, i) => `<span class="rung loy-${s}${i === step ? ' at' : ''}" title="${s}"></span>`).join('');

  const molePanel = mole ? `<div class="mole-panel">
      <div class="mole-title">${mole.visibleBecause === 'exposed' ? 'Mole exposed' : 'Mole active'}</div>
      <div class="kv-lite"><span>Type</span><b>${mole.ability === 'SilentBlock' ? 'Silent Block' : 'Rebel Pressure'}</b></div>
      <div class="kv-lite"><span>Ability</span><b>${mole.ability === 'SilentBlock' ? 'Secretly blocks one positive Influence attempt' : 'Adds +1 Rebel Pressure during a team crisis'}</b></div>
      <div class="kv-lite"><span>Turns remaining</span><b>${Math.max(0, mole.expiresRound - view.round)} round(s)</b></div>
      <div class="kv-lite"><span>Ability</span><b>${mole.used ? 'used' : 'unused'}</b></div>
      ${mole.creatorRevealed || mole.visibleBecause === 'creator' ? `<div class="kv-lite"><span>Planted by</span><b>${pname(view, mole.creator)}</b></div>` : ''}
    </div>` : '';

  return `<div class="emp-panel panel dossier" role="dialog" aria-label="${esc(e.name)}" data-enter="emp:${esc(e.id)}" data-anim="slide">
    <div class="dossier-tab">Personnel file</div>
    <button type="button" class="link close" data-act="emp-close" aria-label="Close">✕</button>
    <div class="dossier-head">
      <img class="portrait" src="${portraitDataUrl(e)}" alt="" width="96" height="120">
      <div class="dossier-id">
        <h3>${esc(e.name)}</h3>
        <div class="role">${esc(e.role)}</div>
        <div class="dept">${deptName(view, e.deptId)}</div>
        ${e.loyalty === 'Rebel' ? '<span class="flag rebel">Rebel</span>' : ''}${e.promise ? '<span class="flag promise">★ Promise</span>' : ''}${mole ? '<span class="flag mole">Mole</span>' : ''}
      </div>
    </div>
    <p class="visual">"${esc(e.visual)}"</p>
    <div class="loyalty-block">
      <div class="loy-head"><span class="label">Loyalty</span><span class="loy loy-${e.loyalty}">${e.loyalty}</span><span class="num muted">${e.loyaltyScore > 0 ? '+' : ''}${e.loyaltyScore}</span></div>
      <div class="ladder" aria-hidden="true">${ladder}</div>
      <div class="ladder-ends"><span>Rebel</span><span>Loyal</span></div>
    </div>
    <div class="traits">
      ${trait('Known', e.permanentTrait, 1)}
      ${trait('Hidden I', h1, 2, e.hiddenTrait1Public)}
      ${trait('Hidden II', h2, 0, e.hiddenTrait2Public)}
    </div>
    <div class="facts">
      <div class="kv-lite"><span>Political side</span><b>${pname(view, e.politicalOwner)}</b></div>
      ${e.rebelInclination !== null && ui.canAct ? `<div class="kv-lite"><span>Rebel inclination</span><b>${pname(view, e.rebelInclination)}</b></div>` : ''}
      <div class="kv-lite"><span>Promise</span><b>${e.promise ? `by ${pname(view, e.promise.byPlayer)}, expires round ${e.promise.expiresRound}` : '<span class="muted">none</span>'}</b></div>
    </div>
    ${molePanel}
    <div class="sec-title">Recent public actions</div>
    ${recent.length ? `<ul class="recent">${recent.map(l => `<li><span class="log-r">R${l.round}</span><span>${colourNames(view, l.text)}</span></li>`).join('')}</ul>` : '<div class="muted small">Nothing on file yet.</div>'}
  </div>`;
}

export const employeeActions: Handlers = {
  'emp-close': (_el, c) => { ui.inspect = null; c.render(); },
};
