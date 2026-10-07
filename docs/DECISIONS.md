# Office Politics — Implementation Decisions

Every place where the spec (`docs/SPEC.md`) was ambiguous, silent, or conflicted with a
practical constraint is recorded here: the issue, the options considered, what was chosen
and why. Change a decision → update the code path named in "Where".

---

## D1. Tech stack: Vite + TypeScript + three.js, HTML for all non-board UI

**Issue.** "Develop using three.js" — but cards, event modals, dashboards and logs are
text-heavy UI.

**Options.**
1. Everything in WebGL (three.js text/sprites for cards, menus, logs).
2. three.js for the board only; plain HTML/CSS overlays for everything else.
3. A UI framework (React/Svelte) on top of option 2.

**Chosen: 2.** The board (hex tiles, employee tokens, ownership colours, rebel/mole markers,
hover/pick) is the only part that benefits from 3D. Text UI in WebGL is slow to build, bad
for accessibility and bad for mobile later. No framework: the UI is a handful of panels
driven by one `render(view)` function; a framework adds build weight for no gain at this size.
The three.js canvas sits full-screen behind absolutely-positioned HTML panels.

**Where.** `src/board/` (three.js), `src/ui/` (DOM), `src/main.ts`.

---

## D2. Multiplayer: Firestore action log replayed by every client (no backend)

**Issue.** User requirement: client-side only, multiplayer via Firestore, no backend.
The game has hidden information (traits, moles, agendas, rebel inclinations, secret votes).

**Options.**
1. **Action-log replay.** Firestore holds `games/{id}` (config + seed) and
   `games/{id}/actions/{seq}`. Each client rebuilds the full `GameState` by replaying the
   ordered action list through the deterministic engine, then renders `game.view(mySeat)`.
2. **Host-authoritative state.** One client applies actions and writes the full state;
   others send requests. Hidden info stays on the host.
3. **Cloud Functions as the referee.** Real backend — excluded by requirement.

**Chosen: 1.** The engine is deterministic and seeded, so replay is trivially consistent
across clients and needs zero coordination. There is no "host went offline" failure.
Illegal/duplicate actions are rejected identically by every client's engine.

**Known trade-off.** Every client holds the full state in memory, so hidden information is
hidden only by the view layer; a player with dev tools could read it. Acceptable for a
friends-and-family casual game now. Upgrade path when it matters: option 3 (Cloud Function
validates actions and writes per-player filtered views) — the engine already produces
per-player views (`game.view(playerId)`), so this is a transport change, not a rules change.

**Details.**
- Ordering: `seq` = integer doc id written in a transaction (create-only); readers order by `seq`.
- Identity: Firebase Anonymous Auth (`uid`) — no sign-up, lets security rules require auth.
- Lobby: 6-letter room code; host picks mode/board/bots and starts; seats assigned in join order.
- Bots in online games are driven by the host's device (the device that created the room).
- Local hot-seat mode uses the same engine with `me` = whoever the engine is waiting on, with a
  pass-the-device curtain so hidden info isn't on screen when the device changes hands.

**Where.** `src/net/firestoreClient.ts`, `src/net/localClient.ts`, `src/net/firebase.ts`,
`firestore.rules`.

---

## D3. Loyalty "+2 / +1" and "-1 / -2" sub-scores dropped

**Issue.** §10 lists Favorable as "+2 / +1" and Skeptical as "-1 / -2", implying sub-levels,
but every other rule (§36 "moves 1 Loyalty state", §16, §18) talks only in whole states.

**Options.** (1) Implement a 9-point numeric score with state bands. (2) Five discrete
states; the score is display-only.

**Chosen: 2.** Every rule in the spec operates on states. A numeric score would make
"moves 1 state" ambiguous and double the test surface. `LOYALTY_SCORE` exists purely for the
employee panel.

**Where.** `src/engine/types.ts` (`LOYALTY_LADDER`, `LOYALTY_SCORE`).

---

## D4. Political owner semantics

**Issue.** §11/§12/§16 describe owner changes in prose. Needed exact rules for every move.

**Chosen.**
- A successful **positive** card by player P always sets `politicalOwner = P` (Neutral→Favorable
  establishes P; Rebel→Skeptical converts to P per §16; Skeptical→Neutral also switches to P
  so "another player can win them over" works).
- A **hostile** move that lands on **Neutral** clears the owner (`null`), per §12 "once an
  employee reaches Neutral, another player can win them".
- A positive card **cannot target** an employee who is Favorable/Loyal toward a *different*
  player (§12: "a rival cannot simply claim a Loyal employee"). They must be pushed down first.
- A hostile card cannot target an employee already at Rebel (nothing lower).
- Positive cards on a Rebel require spend ≥ 2 (§16); hostile cards on Loyal require ≥ 2 (§37).

**Where.** `src/engine/game.ts` → `legalTargets`, `applyLoyaltyMove`.

---

## D5. Mole abilities trigger automatically

**Issue.** §40 says the creator "secretly" uses the ability once; no UI/timing is specified.
Manual triggering in an asynchronous online game would stall the active player's turn waiting
on another player.

**Options.** (1) Interrupt the game to ask the mole owner. (2) Auto-trigger on the first
qualifying moment.

**Chosen: 2.** Silent Block fires on the first positive card played against the molé employee
by anyone other than the creator. Rebel Pressure fires the first time the department's rebel
count reaches 2 while the mole is active (making it a temporary 3 → leadership crisis check).
Both are one-use; the creator gets a private log line "Mole triggered".

**Where.** `src/engine/game.ts` → `resolveCard` (SilentBlock), `checkDeptThresholds` (RebelPressure).

---

## D6. How moles get discovered

**Issue.** §44/§81 mention "an Investigation Event" but no such event is defined.

**Chosen.** Two sources: the Global event *Company Audit* (option "Full Transparency" runs an
`investigate` effect on each player's department) and a dedicated Local event *Internal
Investigation*. `investigate` exposes one active, unexposed mole in that department (if any),
which starts the accusation flow (§44). If there is none, the event reveals a trait instead.

**Where.** `src/content/eventCards.ts`, `src/engine/game.ts` → `effectInvestigate`.

---

## D7. Global vote ties

**Issue.** §62 "majority wins unless the Event has a special tie rule" — 4-player 2–2 ties.

**Chosen.** The active player's (the player whose turn triggered the event) vote wins. Simple,
public, and gives the turn owner a small edge that compensates for being the one hit by the
event. No per-event tie rules in v1.

**Where.** `src/engine/game.ts` → `resolveGlobalVote`.

---

## D8. What "Unstable: worsened by one level" means

**Issue.** §17 says negative events on a 2-rebel department are "worsened by one level where
applicable" but §36 says nothing ever moves more than one state.

**Chosen.** For a department with ≥2 rebels, each negative `loyalty` event effect additionally
hits **one extra random non-rebel employee** in that department (-1). Same mechanism is reused
for a player's accumulated `severity` (Company Audit "Protect My Team"): each point adds one
more extra random target, then decays by 1. Keeps the "max one state per effect per employee"
invariant.

**Where.** `src/engine/game.ts` → `applyEventEffects`.

---

## D9. Bots

**Issue.** Spec forbids an AI decision engine *for employees* and says nothing about computer
opponents, but a 3–4 player game needs opponents to be testable solo.

**Chosen.** A small heuristic bot (`src/bot/bot.ts`): prefers cards whose primary trait matches
a known trait of a target; expands toward departments where it already has 2 aligned
employees; manages when it owns a department with ≥1 rebel; votes for the option with the best
immediate `influence`/`loyalty` delta for itself; saves nothing unless it has spare influence.
No lookahead, no learning. It only sees `game.view(botSeat)` so it cannot cheat.

**Where.** `src/bot/bot.ts`.

---

## D10. Full board is the default; mini prototype is a config switch

**Issue.** §82/§95 say "Mini Prototype before full 28-character game". The user asked for the
website version of "this game".

**Chosen.** The engine is data-driven, so both boards are the same code with different content
tables. `GameConfig.board = 'mini'` gives the §82 setup (4 departments, 16 employees, 3 players,
6 rounds, agendas and CEO off). The lobby defaults to `'full'`. Nothing is lost: the mini
prototype exists for balance testing and the headless simulator (`npm run sim`) can run
thousands of either.

**Where.** `src/engine/game.ts` → `Game.create`, `src/content/departments.ts`.

---

## D11. Deployment: GitHub Pages via Actions; domain is a one-line config

**Issue.** Deploy to thegeekdogs.com, but how that domain is hosted is unknown (whole domain
on Pages? a subpath? another host?).

**Options.** (1) Whole domain: repo has `public/CNAME` = `thegeekdogs.com`, base path `/`.
(2) Subpath: `https://thegeekdogs.com/office-politics/`, base path `/office-politics/`.
(3) Another host entirely: workflow uploads `dist/` elsewhere.

**Chosen: workflow for GitHub Pages with the base path as a repository variable
(`VITE_BASE`, default `/office-politics/`).** Switch to option 1 by setting `VITE_BASE=/` and
adding `public/CNAME`; option 3 by swapping the last step of the workflow. Firebase web config
comes from repository secrets `VITE_FIREBASE_*` so it never lives in git. See README.

**Where.** `.github/workflows/deploy.yml`, `vite.config.ts`, `README.md`.

---

## D12. Card content beyond the 20 named templates

**Issue.** §39 gives 20 templates; §85 asks for 72 cards in 6 categories with secondary
effects/backfires that are never enumerated.

**Chosen.** A closed vocabulary of secondary effects (`ripple, refund, reveal, promise, draw,
extraStep`) and backfires (`reverse, ripple, loseInfluence, exposeSelf`) implemented once in the
engine; content only picks from it. Categories: 10 positive templates get 5–6 copies each,
8 negative templates 4–5 copies each, plus 12 moles = 72. Each template keeps the spec's
primary/adverse affinity; the secondary affinity and effects are our choice. Balance is
tuned through `src/content/influenceCards.ts`, not the engine (§93).

**Where.** `src/content/influenceCards.ts`, `src/engine/types.ts` (`SecondaryEffect`, `Backfire`).

---

## D13. Negotiation: no in-game chat in v1

**Issue.** §55 negotiation is "unrestricted and public". Chat needs moderation, presence, etc.

**Chosen.** Players talk out of band (voice, Discord, same room). The game provides the two
mechanical pieces: `giveCard` (hand a reserve card to another player — two gifts make a
trade) and `exposeIntel` (publish a privately known trait). Both are available during the
play phase. A text chat can be added later as another Firestore subcollection without touching
the engine.

**Where.** `src/engine/game.ts`, `src/ui/`.

---

## D14. Promotion Promise mechanics

**Issue.** §52 says a Promise Promotion card "creates a promise" that lasts 3 rounds; the
secondary-effect model only fires on Strong Success, and expiry consequences are unspecified.

**Chosen.** The `promise` secondary effect is special-cased to fire on **any** success (so the
card always does what its name says). A promise that expires unresolved costs the employee
-1 loyalty state (resentment) — it is a commitment, not free. Promotion Season / Promise Review
events resolve promises via the `honorPromise` / `breakPromises` effects.

**Where.** `src/engine/game.ts` → `resolveCard`, `startRound` (expiry).

---

## D15. "Smallest adjacent team lead" for event-created rebels (§14A) and settlement (§18)

**Chosen.** "Smallest" = fewest controlled departments; ties random. The department's **own**
team lead is excluded (a rebel inclined toward the lead they rebelled against makes no sense).
"Adjacent team lead" = any player who owns at least one department adjacent to this one.

**Where.** `src/engine/game.ts` → `smallestAdjacentLead`.

---

## D16. Secret votes online are hidden by the view, not by the transport

Same trade-off as D2: votes are actions in the log, so a determined player could read them.
The view hides `votes` until every vote is in. Documented, accepted.

---

## D17. Leadership crisis (3 rebels) leaves the department Neutral with its rebels intact

**Issue.** §17 says the lead is "downsized" but not what the department becomes.

**Chosen.** `teamLead = null`; rebels, inclinations and other loyalties are untouched. If a 4th
rebel later appears, §18 settlement runs. If the department is instead recaptured by alignment
(3/4 Favorable/Loyal), normal capture applies. A player who loses their last department this
way is eliminated (§6).

---

## D18. Elimination cleanup

**Chosen.** When a player is eliminated, every employee Favorable/Loyal toward them becomes
**Neutral with no owner**, their hand/reserve go to the discard pile, and their moles expire.
Without this, a dead player's loyalists could permanently block a 3/4 capture.

---

## D19. Private Reveal cards do not occupy reserve slots

**Issue.** §29 says a Private Reveal "card" goes into the 3-slot reserve, competing with saved
cards. That would need a second card type flowing through the hand/save UI.

**Chosen.** Private intel lives in `player.intel` (unbounded) and the Information Broker
agenda counts `stats.privateReveals`. The 1-Influence cost stays. Revisit if intel hoarding
becomes a balance problem.

---

## D20. Art: procedural tokens instead of portraits

**Chosen.** No portrait assets exist. Employees render as coloured 3D discs with initials (canvas
texture), ring = loyalty state, badge = rebel/mole, tile colour = team lead. The §76 "visual
identity" strings appear in the employee panel. Portraits can be dropped into `public/portraits/`
and picked up by the token builder later.

**Where.** `src/board/board.ts`.

---

## D21. Reveal events pick randomly among unrevealed hidden traits

**Chosen.** Target = a random employee anywhere on the board with at least one hidden trait that
is not public and not already in the acting player's intel; then a random such trait.
If none exists the event is discarded with a log line.

---

## D22. Round/turn bookkeeping

- Mole planted in round R is active while `round < R + 3` (§41 example: planted R3, active R4–R5, expires start of R6).
- Promise created in round R expires at the start of round R + 3.
- The first-player marker rotates by one seat each round (§54), skipping eliminated players.
- Election mode ends after the last player's turn of the final round.

---

## D23. Agenda evaluation details

- *People Manager*: most Loyalists; ties count as completed.
- *Climber*: reached VP in any round `< maxRounds`.
- *Corporate Fixer*: a Local/Global event whose chosen option contains at least one negative
  effect counts as "negative"; it is "resolved without instability" if the management-cost check
  on that same turn did not trigger Internal Instability. Need 3.
- *Puppet Master*: `stats.maxActiveMoles >= 2` at any moment.
- *Survivor*: `!stats.lostStartingDept`.
- *Saboteur*: `stats.rebelsCreated >= 5` (rebels created by this player's cards or by events
  this player chose).

---

## D24. Owner overrides received during the build (2026-10-07)

- **Election scoring counts moles planted, not moles active at game end.** `ScoreBreakdown.molesPlanted`
  = `stats.molesPlanted × 3`. An exposed or expired mole still counts because it was planted.
  (`ELECTION_POINTS.molePlanted`). The "Active Moles" column in the end-game table is renamed "Moles Planted".
- **Roster names.** Three employees renamed, keeping role, department and permanent trait so balance is untouched:
  Arjun Mehta → **Sahib Singh** (Engineering), Tara Bansal → **Tanya Jain** (Product), Nandini: Meera Joshi → **Nandini Jain** (Finance).
  The same three names are the default seat names in the lobby (`DEFAULT_PLAYER_NAMES`). Swap the slots in
  `src/content/employees.ts` if you'd rather they sit in different departments.
