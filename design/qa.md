# Cinematic UI implementation QA

prototype: `http://127.0.0.1:3100`  
source of truth: the 2026-09-05 UI/realism audit and implementation brief in this thread  
goal: grounded cinematic realism while preserving co-op clarity, physics behavior, and multiplayer resilience

## Captured states

- Landing, desktop: `../output/playwright/landing-desktop-after.png`
- Landing, mobile: `../output/playwright/landing-mobile-after.png`
- Game/lobby, desktop: `../output/playwright/game-desktop-final.png`
- Active game, mobile: `../output/playwright/game-mobile-final-collapsed.png`
- Invalid room-code state checked through the accessibility snapshot

## Visual conformance

- PASS — primary play and join actions are in the hero flow before explanatory content.
- PASS — landing and HUD share a restrained dark surface system and signal-green accent.
- PASS — custom monochrome role glyphs replace platform-dependent role emoji.
- PASS — surface texture variation is subtle; bump detail, atmospheric sky/fog, animated water, filtered shadows, fill/rim light, vignette, and grain are present.
- PASS — all five role tabs fit on desktop; mobile retains horizontal safety at narrow widths.
- PASS — mobile timer, team status, navigation, and controls do not collide at 390 × 844.
- PASS — mobile lobby uses a readable bottom sheet with internal scrolling and sticky actions.
- PASS — results are constrained to the viewport and scroll internally.

## Behavioral conformance

- PASS — create, solo, join, ready, and start flows remain functional.
- PASS — invalid room code stays on the page and exposes an inline alert.
- PASS — connection/loading states expose retry actions.
- PASS — clipboard failures are handled instead of reporting unconditional success.
- PASS — the mobile controls panel starts collapsed and can be expanded; desktop keeps controls available.
- PASS — production game/lobby and active play produced no browser-console or shader errors.

## Requirements conformance

- PASS — existing Rapier physics and multiplayer interfaces were preserved.
- PASS — no new runtime dependencies or remote visual/audio assets were added.
- PASS — audio now includes ambience, reverb, dynamics control, and richer procedural impacts.
- PASS — quality remains bounded through capped pixel ratio, modest water geometry, compact procedural textures, and no heavy postprocessing chain.
- LIMIT — strict photorealism still requires authored glTF characters/environment pieces and scanned PBR texture assets. This implementation targets the agreed grounded-cinematic tier.

## Accessibility sanity check

- PASS — associated form labels, inline errors, canvas description, mute state, live regions, dialog semantics, visible focus, and minimum control targets are present.
- PASS — reduced-motion and reduced-transparency preferences are supported.
- MANUAL — a complete screen-reader and switch-control pass is still required for formal WCAG conformance.

## Verification

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — pass (rooms, remote input, route/SSE, and network resilience)
- `npm run build` — pass
- `git diff --check` — pass

verdict: **READY for the grounded-cinematic scope.** No blocking visual, behavioral, or build issues found.

