// §60 influence hand, §32 Manage/Expand chooser, card → target → prediction → play.
import type { EmployeeId, GameView, InfluenceCard, PlayerView } from '../engine/types';
import { MAX_RESERVE, TRAIT_LABEL } from '../engine/types';
import type { GameClient } from '../client';
import { bandRange, cardHtml, deptName, esc, isMine, pname, signed, ui, type Handlers } from './helpers';

/** Is it my play phase with a focus chosen? */
export function canPlay(view: GameView, client: GameClient): boolean {
  return isMine(view, client) && view.pending.kind === 'play' && view.pending.focus !== null;
}

/** Legal targets + a human reason when the card can't be played right now. */
export function cardStatus(view: GameView, client: GameClient, me: PlayerView, c: InfluenceCard): { targets: EmployeeId[]; reason: string | null } {
  const focus = view.pending.kind === 'play' ? view.pending.focus : null;
  const wanted = focus === 'Manage' ? 'Internal' : 'External';
  if (c.mode !== 'Both' && c.mode !== wanted) return { targets: [], reason: `${c.mode} only — not usable while ${focus === 'Manage' ? 'Managing' : 'Expanding'}` };
  if (c.cost > me.influence) return { targets: [], reason: `Needs ${c.cost} Influence (you have ${me.influence})` };
  const targets = client.legalTargets(c.id);
  return { targets, reason: targets.length ? null : 'No legal targets' };
}

/** Modal content when it's my play phase and focus is still null. */
export function focusChooserHtml(view: GameView, client: GameClient): string {
  if (!(isMine(view, client) && view.pending.kind === 'play' && view.pending.focus === null)) return '';
  return `<div class="float-center focus-chooser" role="dialog" aria-label="Choose turn focus">
    <h2>Choose your turn focus</h2>
    <p class="muted">You may negotiate first. This decides which employees you can target this turn.</p>
    <div class="focus-options">
      <button type="button" class="big-choice" data-act="focus" data-focus="Manage">
        <span class="big-label">MANAGE</span>
        <span>Target employees inside your own departments.</span>
        <ul><li>Repair loyalty</li><li>Prevent rebellion</li><li>Strengthen loyalists</li><li>Resolve internal problems</li><li>Prepare for Events</li></ul>
      </button>
      <button type="button" class="big-choice" data-act="focus" data-focus="Expand">
        <span class="big-label">EXPAND</span>
        <span>Target employees in Neutral or rival departments.</span>
        <ul><li>Recruit</li><li>Destabilize</li><li>Create Rebels</li><li>Break rival loyalty</li><li>Capture departments</li></ul>
      </button>
    </div>
  </div>`;
}

function targetsHtml(view: GameView, client: GameClient, card: InfluenceCard, targets: EmployeeId[]): string {
  const byDept = new Map<string, EmployeeId[]>();
  for (const id of targets) {
    const d = view.employees.find(e => e.id === id)?.deptId ?? '?';
    byDept.set(d, [...(byDept.get(d) ?? []), id]);
  }
  const list = [...byDept].map(([d, ids]) => `<div class="tgt-dept"><div class="tgt-dept-name">${deptName(view, d)}</div>
    ${ids.map(id => {
      const e = view.employees.find(x => x.id === id)!;
      return `<button type="button" class="chip${ui.selectedTarget === id ? ' on' : ''}" data-act="pick-target" data-id="${esc(id)}">${esc(e.name)} <span class="muted">${e.loyalty}</span></button>`;
    }).join('')}</div>`).join('');
  return `<div class="targets">
    <div class="targets-head"><b>${esc(card.name)}</b> — pick a target <span class="muted">(board or list)</span>
      <button type="button" class="link" data-act="cancel-card">Cancel</button></div>
    ${ui.selectedTarget ? predictionHtml(view, client, card, ui.selectedTarget) : ''}
    <div class="tgt-list">${list}</div>
  </div>`;
}

function predictionHtml(view: GameView, client: GameClient, card: InfluenceCard, target: EmployeeId): string {
  const p = client.predict(card.id, target);
  const parts = [`Base ${p.base}`, ...p.traitMods.map(m => `${TRAIT_LABEL[m.trait]} ${signed(m.value)}`), `Rank ${signed(p.rankBonus)}`];
  if (p.eventBonus) parts.push(`Event ${signed(p.eventBonus)}`);
  parts.push('Random −1 to +1');
  return `<div class="prediction" aria-live="polite">
    <div><b>${esc(card.name)}</b> → <b>${esc(view.employees.find(e => e.id === target)?.name)}</b> — Required spend: <b>${p.requiredSpend}</b></div>
    <div class="pred-line">${parts.map(esc).join(', ')}</div>
    <div>Known outcome range: <b>${p.min}–${p.max}</b> <span class="muted">(${bandRange(p.min, p.max)})</span></div>
    ${p.unknownTraitMayAffect ? '<div class="warn">Unknown trait may affect result</div>' : ''}
    ${p.legal ? '' : `<div class="bad">${esc(p.reason ?? 'Not playable')}</div>`}
    <div class="row"><button type="button" class="primary" data-act="play-card" ${p.legal ? '' : 'disabled'}>Play</button>
      <button type="button" data-act="cancel-target">Cancel</button></div>
  </div>`;
}

export function handHtml(view: GameView, client: GameClient): string {
  const me = client.me === null ? null : view.players[client.me];
  if (!ui.canAct || !me || !me.hand) return '';
  const playing = canPlay(view, client);
  const myPlay = isMine(view, client) && view.pending.kind === 'play';
  const all = [...me.hand, ...(me.reserve ?? [])];
  const selected = all.find(c => c.id === ui.selectedCard) ?? null;

  const status = new Map(all.map(c => [c.id, playing ? cardStatus(view, client, me, c) : { targets: [], reason: null }]));
  const one = (c: InfluenceCard, extra = '') => cardHtml(c, {
    act: playing ? 'card' : undefined,
    selected: c.id === ui.selectedCard,
    disabled: status.get(c.id)!.reason,
    extra,
  });

  const others = view.players.filter(p => p.id !== me.id && !p.eliminated);
  const reserve = (me.reserve ?? []).map(c => {
    if (!myPlay) return one(c);
    const give = ui.giveCard === c.id
      ? `<div class="give">Give to: ${others.map(p => `<button type="button" class="chip" data-act="give" data-id="${esc(c.id)}" data-to="${p.id}" ${p.reserveCount >= MAX_RESERVE ? 'disabled title="Reserve full"' : ''}>${pname(view, p.id)}</button>`).join('')}
         <button type="button" class="link" data-act="give-cancel">Cancel</button></div>`
      : `<button type="button" class="link give-btn" data-act="give-open" data-id="${esc(c.id)}">Give to…</button>`;
    return one(c, give);
  }).join('');

  const focus = view.pending.kind === 'play' && myPlay ? view.pending.focus : null;
  return `<div class="hand-head">
      <button type="button" class="hand-toggle" data-act="toggle-hand" aria-expanded="${ui.handOpen}">Hand (${me.hand.length}) · Reserve ${me.reserve?.length ?? 0}/${MAX_RESERVE}</button>
      <span class="muted">Influence <b class="infl">${me.influence}/${me.influenceMax}</b>${focus ? ` · Focus <b>${focus}</b>` : ''}</span>
      ${playing ? '<button type="button" class="primary" data-act="done-playing">Done playing</button>' : ''}
    </div>
    <div class="hand-body${ui.handOpen ? '' : ' collapsed'}">
      <div class="cards">${me.hand.map(c => one(c)).join('') || '<div class="muted empty">No cards in hand.</div>'}</div>
      ${me.reserve?.length ? `<div class="reserve"><div class="sec-title">Reserve</div><div class="cards">${reserve}</div></div>` : ''}
      ${playing && selected ? targetsHtml(view, client, selected, status.get(selected.id)!.targets) : ''}
    </div>`;
}

export const handActions: Handlers = {
  'focus': (el, c) => void c.act({ type: 'focus', player: c.client.me!, focus: el.dataset.focus as 'Manage' | 'Expand' }),
  'card': (el, c) => {
    if (el.getAttribute('aria-disabled')) return;
    ui.selectedCard = ui.selectedCard === el.dataset.id ? null : el.dataset.id!;
    ui.selectedTarget = null;
    c.render();
  },
  'pick-target': (el, c) => { ui.selectedTarget = el.dataset.id!; c.render(); },
  'cancel-target': (_el, c) => { ui.selectedTarget = null; c.render(); },
  'cancel-card': (_el, c) => { ui.selectedCard = ui.selectedTarget = null; c.render(); },
  'play-card': (_el, c) => {
    if (!ui.selectedCard || !ui.selectedTarget) return;
    void c.act({ type: 'playCard', player: c.client.me!, cardId: ui.selectedCard, targetId: ui.selectedTarget });
  },
  'done-playing': (_el, c) => void c.act({ type: 'donePlaying', player: c.client.me! }),
  'give-open': (el, c) => { ui.giveCard = el.dataset.id!; c.render(); },
  'give-cancel': (_el, c) => { ui.giveCard = null; c.render(); },
  'give': (el, c) => void c.act({ type: 'giveCard', player: c.client.me!, cardId: el.dataset.id!, toPlayer: Number(el.dataset.to) }),
  'toggle-hand': (_el, c) => { ui.handOpen = !ui.handOpen; c.render(); },
};
