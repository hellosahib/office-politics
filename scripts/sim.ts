// Headless simulator + fuzzer (§92). npm run sim -- --games=200 --players=3|4 --board=full|mini --mode=Takeover|Election
import { Game } from '../src/engine/game';
import { createRng, next, nextInt, pick } from '../src/engine/rng';
import { MAX_RESERVE } from '../src/engine/types';
import type { Action, EventCard, GameConfig, GameState, InfluenceCard, PlayerId } from '../src/engine/types';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const GAMES = Number(arg('games', '200'));
const board = arg('board', 'full') as 'full' | 'mini';
const mode = arg('mode', 'Takeover') as GameConfig['mode'];
const playerCount = (board === 'mini' ? 3 : Number(arg('players', '3'))) as 3 | 4;
const ROUND_CAP = 40;
const SYNTHETIC = process.argv.includes('--synthetic');

// --synthetic: add cards exercising every EventEffect / SecondaryEffect / Backfire / mole kind (fuzz coverage
// while src/content holds stubs). Injected right after create, so replay must inject too.
const SYN_EVENTS: Omit<EventCard, 'id'>[] = [
  { templateId: 'syn-audit', type: 'Global', resolution: 'majority', title: 'Syn Audit', situation: '', options: [
    { id: 'A', label: 'A', text: '', chooseDept: true, chooseEmployee: true, effects: [{ kind: 'loyalty', target: 'chosen', delta: -1 }, { kind: 'reveal', target: 'chosen' }, { kind: 'investigate' }],
      minorityEffects: [{ kind: 'makeRebel', target: 'random' }, { kind: 'influence', delta: -1 }] },
    { id: 'B', label: 'B', text: '', effects: [{ kind: 'severity', delta: 1 }, { kind: 'rebelPressure' }], minorityEffects: [{ kind: 'draw', count: 1 }] }] },
  { templateId: 'syn-season', type: 'Global', resolution: 'individual', title: 'Syn Season', situation: '', options: [
    { id: 'A', label: 'A', text: '', chooseEmployee: true, effects: [{ kind: 'honorPromise' }] },
    { id: 'B', label: 'B', text: '', effects: [{ kind: 'breakPromises' }, { kind: 'actionBonus', delta: 1 }] }] },
  { templateId: 'syn-local1', type: 'Local', title: 'Syn Local 1', situation: '', options: [
    { id: 'A', label: 'A', text: '', effects: [{ kind: 'protectDept', rounds: 1 }, { kind: 'severity', delta: 1 }, { kind: 'actionBonus', delta: 1 }, { kind: 'draw', count: 1 }] },
    { id: 'B', label: 'B', text: '', effects: [{ kind: 'loyalty', target: 'all', delta: -1 }, { kind: 'loyalty', target: 'randomWithTrait', delta: 1, traits: ['Ambitious'] }, { kind: 'loyalty', target: 'twoRandom', delta: 1 }, { kind: 'loyalty', target: 'randomRebel', delta: 1 }, { kind: 'loyalty', target: 'promised', delta: -1 }] }] },
  { templateId: 'syn-local2', type: 'Local', title: 'Syn Local 2', situation: '', options: [
    { id: 'A', label: 'A', text: '', effects: [{ kind: 'investigate' }, { kind: 'influence', delta: 2 }] },
    { id: 'B', label: 'B', text: '', chooseEmployee: true, effects: [{ kind: 'makeRebel', target: 'chosen' }, { kind: 'loyalty', target: 'randomOther', delta: 1 }] }] },
];
const synCard = (i: number, c: Partial<InfluenceCard>): InfluenceCard => ({ id: `syn#${i}`, templateId: 'syn', name: `Syn ${i}`, cost: 1 + (i % 3),
  direction: 'positive', mode: 'Both', category: 'Social', baseEffect: 1, primary: 'Ambitious', secondary: 'Gossip', adverse: 'Cautious',
  secondaryEffect: 'none', backfire: 'none', text: '', ...c });
const SYN_CARDS: InfluenceCard[] = [
  ...(['ripple', 'refund', 'reveal', 'promise', 'draw', 'extraStep'] as const).flatMap((fx, k) => [0, 1].map((j) =>
    synCard(k * 2 + j, { secondaryEffect: fx, backfire: (['reverse', 'ripple', 'loseInfluence', 'exposeSelf'] as const)[(k + j) % 4], baseEffect: 1 + j * 2, mode: j ? 'Internal' : 'Both' }))),
  ...[0, 1, 2, 3].map((j) => synCard(20 + j, { direction: 'negative', backfire: (['reverse', 'ripple', 'loseInfluence', 'exposeSelf'] as const)[j], secondaryEffect: (['ripple', 'extraStep', 'refund', 'draw'] as const)[j], mode: j % 2 ? 'External' : 'Both', baseEffect: j })),
  ...[0, 1, 2, 3].map((j) => synCard(30 + j, { direction: 'mole', cost: 3, moleAbility: 'RebelPressure', primary: null, secondary: null, adverse: null, baseEffect: 0 })),
];
function makeGame(config: GameConfig): Game {
  const game = Game.create(config);
  if (SYNTHETIC) {
    const st = game.state;
    for (let k = 0; k < 3; k++) st.eventDeck.push(...SYN_EVENTS.map((e, i) => ({ ...e, id: `${e.templateId}#${k}${i}` } as EventCard)));
    st.influenceDeck.push(...SYN_CARDS);
    st.eventDeck.reverse(); // pop() draws from the end: put the synthetic ones on top first
  }
  return game;
}

function invariants(s: GameState): string[] {
  const bad: string[] = [];
  for (const p of s.players) {
    if (p.influence < 0) bad.push(`${p.name} influence ${p.influence}`);
    if (p.reserve.length > MAX_RESERVE) bad.push(`${p.name} reserve ${p.reserve.length}`);
    const owned = s.departments.filter((d) => d.teamLead === p.id).length;
    if (p.eliminated && owned) bad.push(`eliminated ${p.name} owns ${owned}`);
    if (!p.eliminated && !owned && s.phase !== 'gameOver') bad.push(`alive ${p.name} owns nothing`);
  }
  for (const d of s.departments) {
    if (d.employeeIds.length !== 4) bad.push(`${d.id} has ${d.employeeIds.length} employees`);
    if (d.teamLead !== null && d.employeeIds.filter((id) => s.employees.find((e) => e.id === id)!.loyalty === 'Rebel').length >= 3) {
      bad.push(`${d.id} led with ≥3 rebels`);
    }
  }
  for (const e of s.employees) {
    if (e.loyalty === 'Rebel' && e.politicalOwner !== null) bad.push(`rebel ${e.id} has owner`);
    if (e.loyalty !== 'Rebel' && e.rebelInclination !== null) bad.push(`non-rebel ${e.id} has inclination`);
    if (e.mole && s.players[e.mole.creator].eliminated) bad.push(`mole of eliminated player on ${e.id}`);
  }
  const ids = [...s.influenceDeck, ...s.influenceDiscard, ...s.players.flatMap((p) => [...p.hand, ...p.reserve])].map((c) => c.id);
  if (new Set(ids).size !== ids.length) bad.push('duplicate influence card');
  return bad;
}

const COVER = ['Investigation', 'Accusation correct', 'Accusation incorrect', 'promised', 'Ripple', 'Backfire', 'protected', 'Rebel pressure',
  'Full rebellion', 'Leadership crisis', 'eliminated', 'Mole triggered', 'Intel:', 'Revealed:', 'expired unfulfilled', 'Internal Instability', 'captured'];
const cover = new Map<string, number>();
const rng = createRng(12345);
const stats = { turns: 0, cards: 0, rebels: 0, moleTriggers: 0, molesPlanted: 0, instability: 0, capped: 0, rounds: 0,
  firstCapture: [] as number[], midDepts: [] as number[], winners: new Map<number, number>(), errors: 0, violations: 0 };

for (let g = 0; g < GAMES; g++) {
  const config: GameConfig = { playerCount, mode, board, seed: 1000 + g, rounds: 10,
    players: Array.from({ length: playerCount }, (_, i) => ({ name: `P${i}`, isBot: true })) };
  const game = makeGame(config);
  const s = game.state;
  const actions: Action[] = [];
  const act = (a: Action) => {
    const before = s.actionCount;
    const r = game.dispatch(a);
    if (r.error?.startsWith('Engine error')) { stats.errors++; console.error(`seed ${config.seed}: ${r.error}`); throw new Error(r.error); }
    if (r.ok) actions.push(a);
    else if (s.actionCount !== before) throw new Error('state changed on failed action');
    const bad = invariants(s);
    if (bad.length) { stats.violations++; console.error(`seed ${config.seed} after ${JSON.stringify(a)}: ${bad.join('; ')}`); throw new Error('invariant'); }
    return r.ok;
  };
  let turns = 0, played = 0, firstCapture = -1;
  const deptsAtRound: number[] = [];
  try {
    while (s.phase !== 'gameOver' && s.round <= ROUND_CAP) {
      const pd = s.pending;
      if (pd.kind === 'gameOver') break;
      const pid: PlayerId = pd.player;
      switch (pd.kind) {
        case 'eventChoice': act({ type: 'eventChoice', player: pid, optionId: next(rng) < 0.5 ? 'A' : 'B' }); break;
        case 'eventTarget': act({ type: 'eventTarget', player: pid, targetId: pick(rng, pd.candidates) }); break;
        case 'revealChoice':
          if (!act({ type: 'revealChoice', player: pid, mode: next(rng) < 0.5 ? 'private' : 'public' })) act({ type: 'revealChoice', player: pid, mode: 'public' });
          break;
        case 'accusation': {
          const others = s.players.filter((p) => !p.eliminated && p.id !== pid);
          act({ type: 'accuse', player: pid, accused: pick(rng, others).id });
          break;
        }
        case 'play': {
          const p = s.players[pid];
          if (!pd.focus) act({ type: 'focus', player: pid, focus: next(rng) < 0.5 ? 'Manage' : 'Expand' });
          for (let k = 0; k < 3 && s.pending.kind === 'play' && s.currentPlayer === pid; k++) {
            const options = [...p.hand, ...p.reserve].flatMap((c) => game.legalTargets(pid, c.id).map((t) => [c.id, t] as const));
            if (!options.length) break;
            const [cardId, targetId] = pick(rng, options);
            if (act({ type: 'playCard', player: pid, cardId, targetId })) played++;
          }
          // occasional negotiation actions
          if (s.pending.kind === 'play' && p.reserve.length && next(rng) < 0.1) {
            const to = s.players.filter((o) => !o.eliminated && o.id !== pid);
            if (to.length) act({ type: 'giveCard', player: pid, cardId: p.reserve[0].id, toPlayer: pick(rng, to).id });
          }
          if (s.pending.kind === 'play' && p.intel.length && next(rng) < 0.1) {
            const i = p.intel[0];
            act({ type: 'exposeIntel', player: pid, employeeId: i.employeeId, trait: i.trait });
          }
          if (s.pending.kind === 'play' && s.pending.player === pid) act({ type: 'donePlaying', player: pid });
          break;
        }
        case 'save': {
          const p = s.players[pid];
          const n = Math.min(nextInt(rng, 3), p.influence, MAX_RESERVE - p.reserve.length, p.hand.length);
          act({ type: 'save', player: pid, cardIds: p.hand.slice(0, Math.max(0, n)).map((c) => c.id) });
          break;
        }
        case 'summary': {
          turns++;
          if (s.turnSummary?.managementPenalty) stats.instability++;
          const round = s.round;
          act({ type: 'endTurn', player: pid });
          if (s.round !== round) deptsAtRound.push(s.departments.filter((d) => d.teamLead !== null).length / Math.max(1, s.players.filter((p) => !p.eliminated).length));
          break;
        }
      }
      if (firstCapture < 0 && s.players.some((p) => p.promotionPoints > 0)) firstCapture = turns + 1;
      if (actions.length > 20000) throw new Error('runaway game');
    }
  } catch (e) {
    console.error(`game seed ${config.seed} aborted: ${(e as Error).message}`);
    continue;
  }
  // determinism: replay must reproduce the exact state
  const replayed = makeGame(config);
  for (const a of actions) replayed.dispatch(a);
  if (JSON.stringify(replayed.state) !== JSON.stringify(s)) { stats.errors++; console.error(`seed ${config.seed}: replay mismatch`); }

  const capped = s.phase !== 'gameOver';
  if (capped) stats.capped++;
  else stats.winners.set(s.winner!, (stats.winners.get(s.winner!) ?? 0) + 1);
  stats.turns += turns;
  stats.cards += played;
  const maxR = board === 'mini' ? 6 : mode === 'Election' ? 10 : ROUND_CAP;
  stats.rounds += Math.min(s.round, maxR); // the counter sits at max+1 once a fixed-length game ends
  stats.rebels += s.log.filter((l) => l.tag === 'rebel' && l.visibility === 'public').length;
  stats.moleTriggers += s.log.filter((l) => l.tag === 'mole' && l.text.startsWith('Mole triggered')).length;
  stats.molesPlanted += s.players.reduce((n, p) => n + p.stats.molesPlanted, 0);
  for (const k of COVER) cover.set(k, (cover.get(k) ?? 0) + s.log.filter((l) => l.text.includes(k)).length);
  if (firstCapture > 0) stats.firstCapture.push(firstCapture);
  if (deptsAtRound.length) stats.midDepts.push(deptsAtRound[Math.floor(deptsAtRound.length / 2)]);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f = (x: number) => x.toFixed(2);
const done = GAMES - stats.capped;
console.log(`\n${GAMES} games · ${playerCount}p · ${board} · ${mode}${SYNTHETIC ? ' · synthetic content' : ''}`);
console.log(`avg game length (rounds)      ${f(stats.rounds / GAMES)}`);
console.log(`avg turns to first capture    ${f(avg(stats.firstCapture))} (${stats.firstCapture.length} games had a capture)`);
console.log(`avg rebels / game             ${f(stats.rebels / GAMES)}`);
console.log(`avg depts / player at midpoint ${f(avg(stats.midDepts))}`);
console.log(`mole trigger rate             ${f(stats.molesPlanted ? stats.moleTriggers / stats.molesPlanted : 0)} (${stats.moleTriggers}/${stats.molesPlanted})`);
console.log(`instability rate (per turn)   ${f(stats.turns ? stats.instability / stats.turns : 0)}`);
console.log(`avg cards played / turn       ${f(stats.turns ? stats.cards / stats.turns : 0)}`);
console.log(`games hitting ${ROUND_CAP}-round cap   ${stats.capped}`);
console.log(`winner by seat                ${[...Array(playerCount).keys()].map((i) => `P${i}: ${stats.winners.get(i) ?? 0}`).join('  ')} (of ${done})`);
console.log(`coverage: ${COVER.map((k) => `${k}=${cover.get(k) ?? 0}`).join(' · ')}`);
console.log(`engine errors ${stats.errors} · invariant violations ${stats.violations}`);
if (stats.errors || stats.violations) process.exit(1);
