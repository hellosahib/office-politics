# Design system: "office noir"

A premium board game about corporate intrigue: a dark office floor at night, lit by one warm desk
lamp. Materials are graphite, smoked glass and brass. Player colours appear only as *light*
(rim glow, floor spill, card edges), never as flat fills. Brass is the single interactive accent.

## Where to change things

| What | Where |
|---|---|
| Colours, fonts, type scale, spacing, radii, easing | `:root` tokens at the top of `src/style.css` |
| Light theme | `:root[data-theme="light"]` in `src/style.css` (toggle on the title screen, stored in `localStorage['officePolitics.theme']`) |
| Web fonts | `<link>` in `index.html`, `ui-dev.html`, `board-dev.html` (Archivo for display, Geist for UI, Geist Mono for numbers) |
| Board palette: floor tints, loyalty colours, rebel posture, lights | constants at the top of `src/board/board.ts` (`FLOOR`, `LOYALTY_COLOR`, `POSTURE_YAW`, `BRASS`) |
| Floor textures, name plates, crack/badge art | `src/board/textures.ts` |
| Character portraits (skin/hair/shirt palettes, outfit + prop rules from §76) | `src/board/portrait.ts` (`SKIN`, `HAIR`, `SHIRT`, `DEPT_TINT`, `PROP_RULES`) |
| Card category colours and glyphs | `.cat-*` in `src/style.css`, `CAT_GLYPH` in `src/ui/helpers.ts` |
| Entrance animations | `.anim-*` + `@keyframes` at the end of `src/style.css` |

Player colours themselves come from `PLAYER_COLORS` in the engine (`src/engine/types.ts`) and are not
part of the design system.

## Rules

- **Radius:** panels 16, cards 14, controls 10, chips and pills fully round.
- **Type:** Archivo 800–900 (expanded) for headings, names and the logo; Geist for text; Geist Mono for every
  number, kicker and stamp. Scale: 11 / 12.5 / 14 / 16 / 20 / 28 / 44.
- **Accent:** brass (`--brass`) is the only accent for actions, focus rings and "your move". Semantic colours
  (good, bad, warn, info, mole, gold) only carry game state.
- **Glass:** `.panel` / `.sheet` use `backdrop-filter`, with a solid fallback under `prefers-reduced-transparency`.

## Motion

Every animation answers "what changed?":

- **Board:** a loyalty change bounces the card and tweens the ring colour; a new rebel shakes and flashes the
  floor cracks red; a capture sweeps the new owner's colour across the tile and throws sparks; unstable floors
  flicker, crises pulse red. The camera settles on load and glides on `focusDept`.
- **UI:** cards are dealt from a shuffled deck at turn start (see Cinema below) and fly to the board when played, and the influence meter tweens.
  Event cards enter by type (broadcast, memo, dossier flip). The accusation room has a heartbeat, the
  summary slides in like a report, and the end game has a CEO reveal with confetti and credits.
- Entrance animations are keyed (`data-enter` + `data-anim`, run by `runEnter` in `src/ui/helpers.ts`), so a
  re-render never replays them.
- `prefers-reduced-motion` turns off CSS animation and transitions, the JS flights, tweens and confetti, and
  the board's bounces, sparks, camera settle and pulsing (states are still shown, statically).

## Components added after the second playtest

| Component | File | Notes |
|---|---|---|
| Target picker | `src/ui/picker.ts`, `.picker` / `.pk-*` | Centred modal for "play this card on whom?" and for event target picks (`pending.kind === 'eventTarget'`, titled by what the pick does, e.g. "Who gets the promotion?"). Rows grouped by department (yours, Neutral, rivals') with lead; portrait, loyalty chip, side, and trait chips. Hover or select shows the subject card + forecast. Board tokens stay clickable and select in the picker. |
| Trait chips | `traitChips()` in `src/ui/helpers.ts`, `.tchip` | Known (+1) and both hidden slots; `???` dashed when unknown. Green = matches the card's primary/secondary affinity, red = adverse. Hidden traits carry `public`, or 🔒 when only the viewer knows (private intel). |
| Board standees | `drawPortrait(c, e, x, y)` in `src/board/portrait.ts` | Name only (bottom band + prop chip). Traits live in the details card, the picker, the event team strip and the end-game grid, not on the board. |
| Cards on the table | `src/ui/endGame.ts`, `.reveal-all` | Game over: every department, its employees with portrait, final loyalty, owner colour and all three traits; hidden ones tagged `public` or `was hidden`. |
| Loyalty chip / mini flags | `loyChip()`, `empBadges()`, `.loy-chip`, `.mini-flag` | Pill in the loyalty colour; `!` rebel, `◉` mole (only when the screen may show it), `★` promise. |
| Card direction label | `.card-mode.tgt-*`, `TARGET_WORD` | "↑ Your team" / "↓ Other teams" / "◉ Other teams" replaces Internal/External/Both. |
| "Meet your team" intro | `src/ui/cinema.ts` `introHtml`, `.intro` | Once per seat per game (sessionStorage `op:introSeen`), round 1 only. Online: each client its own seat; hot-seat: each human the first time the device reaches them. |
| Cinema (deck riffle, deal, event flip) | `createCinema()` in `src/ui/cinema.ts`, `.cinema`, `.deck`, `.cback`, `.ev-flip` | Render-driven: new hand ids are hidden (`.card-wrap.undealt`) and dealt from the Influence deck; vanished unsaved cards slide off right; a new event (your turn, or any Global) holds the event modal (`ui.holdEvent`) until the Event-deck card has flown up and flipped. Whole sequence ≤ ~3.5 s, click to skip, skipped under reduced motion. Waits while the intro or an event outcome is open. |
| Team strip | `teamStripHtml` in `src/ui/eventModal.ts`, `.team-strip`, `.ts-*` | Under the event: the affected departments (`activeEvent.affectedDeptIds`, else the event dept, else your departments for Global). Click a person to open the dossier without closing the event. |
| Card result banner | `src/ui/results.ts`, `.card-banner` | Every client, after each card: "<Player> used <Card> on <Employee> of <Department>", the reaction large, status chips. Success: short confetti, brass glow. Failure/Blocked: falling 😢 ring, cool tint. Auto-dismiss ~3 s or click; the actor gets a collapsible "Why?" (score breakdown). Reduced motion: static. |
| Reveal banners | `src/ui/results.ts`, `.card-banner.reveal` | Public: "Trait disclosed … revealed by <Player>" for everyone. Private: "You now know … Only you can see this." for the revealer only. |
| Event outcome | `eventResultHtml` in `src/ui/results.ts`, `.event-outcome`, `.eo-*` | Centred modal after each event: votes (winner outlined), winning option + text, one section per player (colour, department, minority tag) with change rows (portrait + loyalty before→after, Influence, protection, reveals…), "No effect" when empty. Continue to dismiss; banners and the next cinema wait for it. |
| End-of-turn report | `src/ui/summary.ts`, `.rp-*` | "Round N — <Player>'s turn"; sections only when non-empty: Influence (spent / remaining / upkeep or Internal Instability), Cards played (card → employee (dept) → band, before→after), Loyalty changes by department, New Rebels, Departments, Promises, Mole activity (private), Promotion. |
| Your intel | `src/ui/dashboard.ts`, `.intel-item` | Newest first: portrait, name (opens dossier), department, trait chip, "Expose publicly". |

Other rules from this round:

- **Influence when it isn't your turn** is shown as the per-turn maximum in muted ink ("not your turn" / "next turn"), never as 0.
- **Log** renders engine narrative only (lines tagged `explanation` are never shown); department names are dotted buttons that filter the board/log; the `mine` chip keeps lines that mention you or are private to you.
- **Phones (≤ 760 px):** every `.float-center` modal, the intro and the event outcome become full-screen sheets (`sheet-up` entrance); the picker puts the forecast above the list.
- **Layering:** event panel 9 < dossier 11 < float-center modals 20–25 < event outcome 32 < card banner 42 < intro 45 < cinema 50 < curtain 100.

## Board performance budget

All employees share one merged card mesh (portrait atlas) plus six instanced meshes (plinths, loyalty rings,
halos, stars, rebel badges, mole shimmer), about 10 draw calls for 28 tokens. The whole scene, including the
shadow pass, measured 59 draw calls per frame at 60 fps (1440×900). DPR is capped at 2, shadow maps drop to
1024 on small screens, and the render loop stops while the tab is hidden.
