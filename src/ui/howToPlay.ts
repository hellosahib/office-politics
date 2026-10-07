// "How to play": a rules guide overlay usable from the lobby and mid-game.
// It lives on <body>, outside every screen's slots, so opening/closing it never
// touches game state, re-renders, or the screen's own delegated click handler.

const k = (s: string) => `<kbd class="ht-k ht-${s}">${s}</kbd>`;
const L = k('Loyal'), F = k('Favorable'), N = k('Neutral'), S = k('Skeptical'), R = k('Rebel');

const SECTIONS: [id: string, title: string, html: string][] = [
  ['what', 'What is this game?', `
    <p>You are an outside hire who just joined the company as a Team Lead. You don't win territory — you win <b>people</b>: the 28 employees spread across 7 departments. Turn enough of them your way, take over their departments, and climb all the way to <b>CEO</b>.</p>
    <p>Every rival is doing the same thing, to the same people, at the same time.</p>`],

  ['win', 'How you win', `
    <h4>Takeover mode</h4>
    <p>The moment you control <b>N + 2 departments</b> you are CEO and the game ends: <b>5</b> in a 3-player game, <b>6</b> in a 4-player game. Being the last player standing also wins.</p>
    <h4>Election mode</h4>
    <p>Play a fixed <b>8, 10, 12 or 15 rounds</b>. Then every secret is revealed and the highest score becomes CEO. Each player also gets a <b>Secret Agenda</b>.</p>
    <table class="ht-t"><tr><th>Achievement</th><th>Points</th></tr>
      <tr><td>Each controlled department</td><td>+10</td></tr>
      <tr><td>Each ${L} employee aligned to you</td><td>+2</td></tr>
      <tr><td>Each ${F} employee aligned to you</td><td>+1</td></tr>
      <tr><td>Each ${R} in a department you lead</td><td>−2</td></tr>
      <tr><td>Each Mole you planted (even if caught or expired)</td><td>+3</td></tr>
      <tr><td>Secret Agenda completed</td><td>+8</td></tr></table>
    <p class="ht-note">Ties: most departments → most Loyal employees → fewest Rebels → most agenda conditions met.</p>`],

  ['board', 'The board', `
    <p>Seven departments sit in a hex: <b>Operations</b> in the centre, Engineering, Product, Sales, Marketing, Finance and People &amp; HR around it. Each holds <b>4 employees</b>. Each player starts leading one random department; the rest start Neutral (no lead).</p>
    <p>Each outer department touches Operations and its two outer neighbours. <b>Adjacency matters</b> for where Rebels lean and who inherits a department after a full rebellion.</p>
    <p class="ht-note">The <b>Mini prototype</b> board is 4 departments, 16 employees, 3 players, 6 rounds, with no CEO victory and no agendas — a sandbox for learning.</p>`],

  ['loyalty', 'Employees & loyalty', `
    <p>Every employee sits on a five-step ladder and moves <b>one step at a time</b>:</p>
    <table class="ht-t">
      <tr><td>${L}</td><td>Firmly yours. Hostile cards against them need at least 2 Influence.</td></tr>
      <tr><td>${F}</td><td>On your side, but persuadable.</td></tr>
      <tr><td>${N}</td><td>Nobody's. The next player to win them over claims them.</td></tr>
      <tr><td>${S}</td><td>Lost trust in their leadership. One step from revolt.</td></tr>
      <tr><td>${R}</td><td>Openly against their Team Lead. Belongs to no one.</td></tr></table>
    <p>An employee <b>belongs</b> to you only while ${F} or ${L} toward you. You can't sweet-talk a rival's ${F}/${L} employee directly — push them down to ${N} first.</p>
    <p>Get <b>3 of a department's 4</b> employees on your side and you capture it instantly; the old lead resigns.</p>`],

  ['traits', 'Traits — the information game', `
    <p>Personalities come from five dimensions, each with two poles:</p>
    <table class="ht-t"><tr><th>Dimension</th><th>Poles</th></tr>
      <tr><td>Drive</td><td>Ambitious / Lazy</td></tr><tr><td>Loyalty</td><td>Loyal / Disloyal</td></tr>
      <tr><td>Social</td><td>Gossip / Private</td></tr><tr><td>Recognition</td><td>Credit-hungry / By-the-book</td></tr>
      <tr><td>Risk</td><td>Risk-taking / Cautious</td></tr></table>
    <p>Each employee has <b>3 traits</b>: one <b>known</b> (+1, never changes), one <b>hidden worth +2</b> and one <b>hidden worth 0</b>. Hidden traits are reshuffled <b>every match</b> — last game's read is worthless.</p>
    <p>Reveal events show you a hidden trait. Choose <b>Public</b> (free, everyone sees it) or <b>Private</b> (1 Influence, only you know — it goes to your Private intel, and you can expose it later).</p>`],

  ['cards', 'Influence & cards', `
    <p><b>Influence</b> is the only resource. At the start of your turn you gain your rank's level (4 / 5 / 6 / 7). While it isn't your turn, the dashboard shows that per-turn amount. Owning departments costs upkeep from the same pool:</p>
    <table class="ht-t"><tr><th>Departments</th><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr>
      <tr><th>Cost per turn</th><td>0</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr></table>
    <p>You get <b>4 cards</b> a turn. A card's <b>direction</b> decides who it can target, shown on the card:</p>
    <ul><li><b>↑ Your team / unattached rivals</b> — positive cards work on your own departments, on Neutral departments, and on a rival's employees only while they are still Neutral or Skeptical. Once someone is Favorable or Loyal to a rival you must push them down first.</li>
      <li><b>↓ Other teams</b> — hostile cards work on rival players' departments (and Neutral ones).</li>
      <li><b>◉ Other teams</b> — moles are planted in rival players' departments.</li></ul>
    <p>A card with nobody it can reach says so (e.g. "No one on your team can be targeted right now").</p>
    <p><b>Reading a card:</b> cost (brass coin, top left) · direction (↑ positive, ↓ hostile, ◉ mole) · category art · who it targets · base effect · green trait affinities help, red ones hurt · <b>Strong</b> bonus · <b>Backfire</b> on failure.</p>
    <p class="ht-formula">Score = base + rank bonus + trait matches + event modifiers + random (−1 / 0 / +1)</p>
    <p>Matching a trait adds its weight (+1 known, +2 or 0 hidden); an adverse match subtracts it. The random roll is 0 most of the time (60%).</p>
    <table class="ht-t"><tr><th>Score</th><th>Result</th></tr>
      <tr><td>0–1</td><td>Failure — no move; backfire may trigger</td></tr>
      <tr><td>2–3</td><td>Success — move one step</td></tr>
      <tr><td>4+</td><td>Strong success — move one step + bonus effect</td></tr></table>
    <ul><li>You may target the <b>same employee only once</b> per turn.</li>
      <li>Hostile card on a ${L} employee: spend at least <b>2</b>. Winning back a ${R}: at least <b>2</b>.</li>
      <li>At turn end, save cards for <b>1 Influence each</b>, max <b>3</b> saved. Unsaved cards are discarded.</li></ul>`],

  ['turn', 'A turn, step by step', `
    <ol>
      <li><b>Event</b> — a card is drawn and resolved (see Events).</li>
      <li><b>Influence</b> — you gain your rank's amount.</li>
      <li><b>Management cost</b> — paid automatically. Can't pay it all? <b>Internal Instability</b>: two employees in one of your departments each drop a step.</li>
      <li><b>Draw</b> 4 cards.</li>
      <li><b>Negotiate</b> — out loud, by voice or in the room (there is no chat). Deals aren't binding. To trade, <b>give a saved card</b>; two gifts make a swap.</li>
      <li><b>Play</b> as many cards as you can afford: click a card and a <b>target window</b> opens.</li>
      <li><b>Save</b> up to 3 cards.</li>
      <li><b>End turn</b> — a summary shows everything that changed.</li></ol>`],

  ['events', 'Events', `
    <p>Every turn starts with an Event:</p>
    <ul><li><span class="badge badge-global">Global</span> Everyone votes secretly; majority wins. <b>Ties go to the active player.</b> Negotiate before locking in.</li>
      <li><span class="badge badge-local">Local</span> A dilemma for the active player, aimed at one of their departments at random. Usually two bad options.</li>
      <li><span class="badge badge-reveal">Reveal</span> You learn a hidden trait — reveal it publicly or pay 1 to keep it.</li></ul>
    <p><b>Unstable</b> departments get hit harder: each negative effect drags down one extra employee.</p>
    <p><b>Promotion promises</b> (★) last <b>3 rounds</b>. Honour them during Promotion Season or a review — if one expires unresolved, that employee drops a step in resentment.</p>`],

  ['rebels', 'Rebels & crises', `
    <p>Rebels come from events or from hostile cards pushing a ${S} employee over the edge. Each Rebel secretly <b>leans</b> toward a player — whoever pushed hardest, or (for event rebels) the smallest neighbouring lead.</p>
    <table class="ht-t"><tr><th>Rebels in dept</th><th>Effect</th></tr>
      <tr><td>2</td><td><b>Unstable</b> — events hit harder</td></tr>
      <tr><td>3</td><td><b>Leadership crisis</b> — the lead loses the department (eliminated if it was their last)</td></tr>
      <tr><td>4</td><td><b>Full rebellion</b> — if 3 of 4 lean to one player, they take over; otherwise the smallest adjacent lead does; otherwise it stays Neutral</td></tr></table>
    <p>To <b>convert</b> a Rebel, spend at least 2 on a positive card: they become ${S} and yours, and you work them up from there.</p>`],

  ['moles', 'Moles', `
    <p>Mole cards cost <b>3</b> and can be planted on anyone except a ${L} employee. Only the planter knows. A mole lasts <b>2 full rounds</b>, and while active the employee <b>can't move up</b> (Loyalty Lock).</p>
    <ul><li><b>Silent Block</b> — quietly cancels the first positive card someone else plays on that employee.</li>
      <li><b>Rebel Pressure</b> — when the department sits at 2 Rebels, counts as a third and triggers a leadership crisis.</li></ul>
    <p>Each fires automatically, once. Investigations can expose a mole; the department's lead then makes a public <b>accusation</b>. Right: the planter is exposed. Wrong: the planter stays hidden and the employee drops to ${S}.</p>`],

  ['ranks', 'Ranks & promotion', `
    <p>Rank follows how many departments you control, and sets your Influence and your bonus on every card.</p>
    <h4>3 players</h4>
    <table class="ht-t"><tr><th>Departments</th><th>Rank</th><th>Influence</th><th>Bonus</th></tr>
      <tr><td>1</td><td>Team Lead</td><td>4</td><td>+0</td></tr><tr><td>2</td><td>Manager</td><td>5</td><td>+1</td></tr>
      <tr><td>3–4</td><td>VP</td><td>6</td><td>+3</td></tr><tr><td>5</td><td>CEO</td><td colspan="2">wins</td></tr></table>
    <h4>4 players</h4>
    <table class="ht-t"><tr><th>Departments</th><th>Rank</th><th>Influence</th><th>Bonus</th></tr>
      <tr><td>1</td><td>Team Lead</td><td>4</td><td>+0</td></tr><tr><td>2</td><td>Manager</td><td>5</td><td>+1</td></tr>
      <tr><td>3</td><td>AVP</td><td>6</td><td>+2</td></tr><tr><td>4–5</td><td>VP</td><td>7</td><td>+3</td></tr>
      <tr><td>6</td><td>CEO</td><td colspan="2">wins</td></tr></table>`],

  ['tips', 'Things to watch out for', `
    <ul class="ht-tips">
      <li><b>Over-expansion bites.</b> Every department raises upkeep; one bad event can leave you short and trigger Instability.</li>
      <li>A hostile card on a ${L} employee costs at least 2 — pick softer targets.</li>
      <li>"Unknown trait may affect result" is a real warning: a hidden +2 can flip a prediction.</li>
      <li>A ${S} employee is one bad event from ${R}. Shore them up before it's too late.</li>
      <li>A mole freezes your best people — if someone won't budge, suspect one.</li>
      <li>Don't make promises you won't keep; expired promises cost loyalty.</li>
      <li>Count who has <b>2 of 4</b> in each department — that player is one card from a capture.</li>
      <li>The active player wins vote ties. Lobby accordingly.</li>
      <li>Elimination is permanent. Never let your last department reach 3 Rebels.</li></ul>`],

  ['screen', 'Reading the screen', `
    <ul><li><b>Top bar</b>: round, whose turn, current phase. On phones the menu and log icons open the side panels.</li>
      <li><b>Dashboard</b> (left): your rank, Influence meter, upkeep, saved cards, agenda and private intel; all players below.</li>
      <li><b>Hand</b> (bottom): click a card to open the <b>target window</b>. It lists everyone the card can reach, grouped by department (with its lead), each with loyalty, side and trait chips — green traits help the card, red ones hurt it, <b>???</b> is still hidden, 🔒 is private intel only you know. Hover or pick someone to see the forecast bar and the Influence it needs, then <b>Play card</b>. Highlighted employees on the board can be clicked too.</li>
      <li><b>After each card</b> a banner shows everyone what happened. <b>After each event</b> an outcome window shows the vote and what changed for each player's team.</li>
      <li><b>Events</b> show the team members they can affect under the card; click one to open their file.</li>
      <li><b>Log</b> (right): public history; purple lines are private to you. Click a department to filter it.</li>
      <li><b>Personnel file</b>: click any employee for their portrait, traits (striped bars = unknown), loyalty ladder, side and recent actions.</li></ul>
    <h4>On the board</h4>
    <ul><li>Each employee is a portrait card on a small plinth. The ring around the plinth is loyalty: ${L} gold, ${F} green, ${N} grey, ${S} orange, ${R} red.</li>
      <li>The card's edge and plinth take the colour of the player they side with. ${L} employees wear a gold halo; ${R}s turn away from you.</li>
      <li><span class="ht-sym" style="color:#e5484d">!</span> red badge = Rebel · <span class="ht-sym" style="color:#a487ff">purple shimmer</span> = a mole you know about · <span class="ht-sym" style="color:#ffd36b">★</span> star = active promise.</li>
      <li>A tile's glowing rim and floor light = the department's lead (brighter = yours). <span class="ht-sym" style="color:#ffb020">Amber flicker</span> = Unstable; red pulse = crisis. Rebels crack the floor.</li></ul>`],

  ['online', 'Online play', `
    <p>Create a room and share its <b>6-letter code</b>; friends join with it. The host picks the settings and presses Start. <b>Empty seats become bots</b>. Your screen only ever shows what your seat is allowed to know. In <b>Local</b> mode, a curtain hides private info while the device is passed around.</p>`],
];

let open: HTMLElement | null = null;

/** Opens the guide. Closing (✕, Escape, backdrop) restores focus to whatever opened it. */
export function openHelp(): void {
  if (open) return;
  const back = document.activeElement as HTMLElement | null;
  const opts = SECTIONS.map(([id, t], i) => `<option value="${id}">${i + 1}. ${t}</option>`).join('');
  const el = document.createElement('div');
  el.className = 'modal-backdrop ht';
  el.innerHTML = `<div class="modal ht-box" role="dialog" aria-modal="true" aria-labelledby="ht-title">
    <div class="ht-head"><h2 id="ht-title">How to play</h2>
      <select class="ht-select" aria-label="Jump to section">${opts}</select>
      <button type="button" class="close" data-ht="close" aria-label="Close">✕</button></div>
    <div class="ht-body">
      <nav class="ht-nav">${SECTIONS.map(([id, t]) => `<button type="button" class="link" data-ht="${id}">${t}</button>`).join('')}</nav>
      <article class="ht-art" tabindex="0">${SECTIONS.map(([id, t, h]) => `<section id="ht-${id}"><h3>${t}</h3>${h}</section>`).join('')}</article>
    </div></div>`;

  const close = () => {
    el.remove(); open = null;
    window.removeEventListener('keydown', onKey, true);
    back?.focus?.();
  };
  const go = (id: string) => el.querySelector(`#ht-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Capture phase + stop: Escape must not also reach the game's own Escape handler.
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  el.addEventListener('click', e => {
    if (e.target === el) return close();
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-ht]')?.dataset.ht;
    if (id === 'close') close(); else if (id) go(id);
  });
  el.querySelector('select')!.addEventListener('change', e => go((e.target as HTMLSelectElement).value));
  window.addEventListener('keydown', onKey, true);
  document.body.append(el);
  open = el;
  el.querySelector<HTMLElement>('[data-ht="close"]')!.focus();
}
