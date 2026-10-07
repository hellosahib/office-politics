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
- **UI:** cards are dealt in at turn start and fly to the board when played, and the influence meter tweens.
  Event cards enter by type (broadcast, memo, dossier flip). The accusation room has a heartbeat, the
  summary slides in like a report, and the end game has a CEO reveal with confetti and credits.
- Entrance animations are keyed (`data-enter` + `data-anim`, run by `runEnter` in `src/ui/helpers.ts`), so a
  re-render never replays them.
- `prefers-reduced-motion` turns off CSS animation and transitions, the JS flights, tweens and confetti, and
  the board's bounces, sparks, camera settle and pulsing (states are still shown, statically).

## Board performance budget

All employees share one merged card mesh (portrait atlas) plus six instanced meshes (plinths, loyalty rings,
halos, stars, rebel badges, mole shimmer), about 10 draw calls for 28 tokens. The whole scene, including the
shadow pass, measured 59 draw calls per frame at 60 fps (1440×900). DPR is capped at 2, shadow maps drop to
1024 on small screens, and the render loop stops while the tab is hidden.
