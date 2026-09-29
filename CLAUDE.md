# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Frontend for **K-Moneyball**, a KBO bullpen-decision tool. The user plays a "replay mode": load a real 2025 game, take over their team's defensive half-innings from a chosen inning onward, and choose which reliever to bring in for each plate appearance, guided by a Contextual Bandit model's "if you replace, who comes in" ranking. The full product/API contract (written by the frontend track for the two backend tracks) lives in `K-Moneyball_프론트엔드_백엔드_요구사항_명세.md` (Korean) — read it before making non-trivial changes to data shapes, session flow, or calculation ownership; it is the source of truth, not this file.

There is no backend yet. Everything runs against an in-memory mock API (`src/mocks/`) built to the same contract the real backend will implement.

## Commands

```
npm run dev       # vite dev server
npm run build     # tsc -b && vite build (type-check is part of the build, not a separate step)
npm run lint      # oxlint
npm run preview   # preview production build
```

There is no test runner configured. Type-check with `npm run build` (or `tsc -b` directly) and lint with `npm run lint` after changes.

## Architecture

### The mock backend is a real seam, not a stub to route around

`src/mocks/api.ts` implements the exact async function signatures the real `/api/v1/*` endpoints will have (see the spec §3): `getConfig`, `getTeams`, `getGames`, `createSession`, `recommend`, `simulatePa`, `undoLast`, `getWeTrace`, etc. Hooks and components call these functions, never the underlying mock engine directly. When the real backend exists, only `src/mocks/api.ts` (or its replacement) should need to change — do not let components reach past it into `src/mocks/session.ts` or `src/mocks/engine.ts`.

- `src/mocks/session.ts` — stateful session engine (`Map<sessionId, Session>`), mimics what a real backend session store would do: tracks bullpen usage, history (for undo), divergence from the actual game, and WE/LI curves.
- `src/mocks/engine.ts` — outcome sampling, base-running, LI/WE formulas (i.e., logic the spec assigns to the server; see below).
- `src/mocks/schedule.ts`, `roster.ts`, `teams.ts`, `names.ts`, `outcomes.ts`, `rng.ts` — deterministic fake data generation (seeded RNG so mock games are reproducible).
- `src/mocks/config.ts` — the mock `/config` response (LI bands).

### Client/server calculation split (spec §5 — the most load-bearing section)

The spec deliberately splits work so the same logic never lives in two places:

- **Server-owned** (mocked today in `src/mocks/engine.ts` / `session.ts`, will move to Track A/B's real services): Leverage Index, `quality_p`, the model ranking/scores (`modelScore`, `modelRank`), PA outcome probabilities/sampling, base-running, out/inning transitions, all WE/ΔWE values and perspective conversion.
- **Client-owned**: nothing recommendation-related. The frontend never computes or adjusts a score — it only displays what a `RecommendationSource` returns (`src/types/recommendation.ts`, `docs/api-recommendation.md`). The former utility-function ranking was retired; do not reintroduce client-side scoring.

When adding features, preserve this split: don't reimplement base-running or WE math on the client, and don't compute or re-rank recommendation scores on the client.

### Perspective conventions (spec §6-2)

Win-expectancy and score-diff values are perspective-sensitive and easy to get backwards:
- `scoreDiffAttacker` is already converted to the attacking team's perspective — don't re-flip it.
- `deltaWeDefender` is what the UI displays (the user is always on defense during their turn); `deltaWeAttacker` is its mirror.
- Every WE-bearing response carries an explicit `wePerspective`/`perspective` field naming whose perspective the number is in.

### Data flow: Context → hooks → pages → components

- `src/context/SessionContext.tsx` holds only the onboarding selection (`SessionParams`: teams, game, start inning) — not game state.
- `src/hooks/useGameSession.ts` owns the live session lifecycle: creates the session from `SessionParams`, holds `GameState`/`RecommendResponse`/`WeTraceResponse` in state, and exposes `simulate(pitcherId)` and `undo()`. Re-fetches `recommend` + `getRecommendations(state)` + `usageToday` + `usedTonight` + `weTrace` together (`refreshAll`) after every mutation.
- `src/hooks/useTeams.ts`, `useGames.ts`, `useInningOptions.ts` are thin one-shot fetchers for onboarding.
- `src/pages/OnboardingPage.tsx` (team/date/inning picker) and `src/pages/GameDashboardPage.tsx` (main game loop) are the only two routes (`src/App.tsx`). `GameDashboardPage` is the composition root for all `src/components/dashboard/*` cards — it owns `selectedId` (never pre-filled — the model's #1 is not auto-selected) and renders the model ranking from `getRecommendations`. The model has no score for the current pitcher (it ranks relievers for a decided change), so none is shown for them.

### Types are the contract

`src/types/api.ts` mirrors the spec's JSON shapes (in camelCase — the mock layer's job is exactly the snake_case→camelCase mapping a real fetch layer would also need to do). Keep this file in sync with the spec doc when the schema changes; components should never need to change when the mock layer is swapped for real HTTP calls, only when these types change.

### UI stack

React 19 + Vite, Tailwind (shadcn/ui "new-york" style, config in `components.json`, base components in `src/components/ui/`), `react-router-dom` for the two routes, `recharts` for WE/LI charts, `framer-motion` for animation. Path alias `@/*` → `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`).
