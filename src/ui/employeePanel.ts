// §59 employee card + §63 private mole panel.
import type { GameView, TraitPole } from '../engine/types';
import { TRAIT_LABEL } from '../engine/types';
import { colourNames, deptName, esc, pname, ui, weightLabel, type Handlers } from './helpers';

const trait = (t: TraitPole | null, w: number, isPublic = true) =>
  t ? `${TRAIT_LABEL[t]} <span class="muted">${weightLabel(w)}</span>${isPublic ? '' : ' <span class="tag-private">private</span>'}` : '<span class="muted">???</span>';

export function employeeHtml(view: GameView): string {
  const e = view.employees.find(x => x.id === ui.inspect);
  if (!e) return '';
  // Hide `me`'s private knowledge when this screen may not show it (bot seat in hot-seat).
  const mole = e.mole && (ui.canAct || e.mole.visibleBecause === 'exposed') ? e.mole : null;
  const h1 = ui.canAct || e.hiddenTrait1Public ? e.hiddenTrait1 : null;
  const h2 = ui.canAct || e.hiddenTrait2Public ? e.hiddenTrait2 : null;
  const recent = view.log.filter(l => l.visibility === 'public' && l.text.includes(e.name)).slice(-5).reverse();
  const rows: [string, string][] = [
    ['Department', deptName(view, e.deptId)],
    ['Permanent trait', trait(e.permanentTrait, 1)],
    ['Hidden trait 1', trait(h1, 2, e.hiddenTrait1Public)],
    ['Hidden trait 2', trait(h2, 0, e.hiddenTrait2Public)],
    ['Loyalty', `<span class="loy loy-${e.loyalty}">${e.loyalty}</span> <span class="muted">(${e.loyaltyScore > 0 ? '+' : ''}${e.loyaltyScore})</span>`],
    ['Political side', pname(view, e.politicalOwner)],
  ];
  if (e.rebelInclination !== null && ui.canAct) rows.push(['Rebel inclination', pname(view, e.rebelInclination)]);
  rows.push(['Promise', e.promise ? `by ${pname(view, e.promise.byPlayer)}, expires round ${e.promise.expiresRound}` : '—']);

  const molePanel = mole ? `<div class="mole-panel">
      <div class="mole-title">${mole.visibleBecause === 'exposed' ? 'MOLE EXPOSED' : 'MOLE ACTIVE'}</div>
      <div>Type: ${mole.ability === 'SilentBlock' ? 'Silent Block' : 'Rebel Pressure'}</div>
      <div>Ability: ${mole.ability === 'SilentBlock' ? 'Secretly blocks one positive Influence attempt' : 'Adds +1 Rebel Pressure during a team crisis'}</div>
      <div>Turns remaining: ${Math.max(0, mole.expiresRound - view.round)} round(s)</div>
      <div>Ability: ${mole.used ? 'used' : 'unused'}</div>
      ${mole.creatorRevealed || mole.visibleBecause === 'creator' ? `<div>Planted by ${pname(view, mole.creator)}</div>` : ''}
    </div>` : '';

  return `<div class="emp-panel panel" role="dialog" aria-label="${esc(e.name)}">
    <div class="emp-head"><div><h3>${esc(e.name)}</h3><div class="muted">${esc(e.role)}</div></div>
      <button type="button" class="link close" data-act="emp-close" aria-label="Close">✕</button></div>
    <div class="muted small">${esc(e.visual)}</div>
    <table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
    ${molePanel}
    <div class="sec-title">Recent public actions</div>
    ${recent.length ? `<ul class="recent">${recent.map(l => `<li><span class="muted">R${l.round}</span> ${colourNames(view, l.text)}</li>`).join('')}</ul>` : '<div class="muted small">Nothing yet.</div>'}
  </div>`;
}

export const employeeActions: Handlers = {
  'emp-close': (_el, c) => { ui.inspect = null; c.render(); },
};
