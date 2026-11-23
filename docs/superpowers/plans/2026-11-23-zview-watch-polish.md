# zview Watch Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Day title "Monday, 23 November" vertically centred, endless event list, correct clip duration while streaming, and a playback speed menu.

**Architecture:** Small changes to existing components: `DayNav` + `lib/dashboard/day.ts`, `EventList`, `Player` (+ the props Watch passes). No server change. The relay config change (§5 of the spec) is applied by the controller at deploy time.

**Tech Stack:** Svelte 5, TypeScript, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-zview-watch-polish-design.md`

## Global Constraints

- Strict TDD (AGENTS.md). From `web/`: `pnpm vitest run <file>`; before each commit `pnpm vitest run`, `pnpm check`, `pnpm lint`; run `pnpm playwright test` when the task touches layout or the list.
- Tokens only, no new colours; 44 px targets on phones; mandated copy unchanged.

## Review Focus

1. A clip whose sidecar has no `duration_ms` (incomplete) must not show a made-up length. → Task 3 test.
2. The browser's real duration, once known, wins over the sidecar value. → Task 3 test.
3. The speed stays when auto-advance loads the next clip (the engine may reset `playbackRate` on load). → Task 3 test.
4. Endless loading must not fire repeatedly when all rows are shown, and must stop when the list is exhausted. → Task 2 test.
5. The day title must not wrap or push the arrows on a 390 px phone with a problem status showing. → existing e2e phone top-bar test must stay green (Task 1).

---

### Task 1: Day title format and vertical centring

**Files:** Modify `web/src/lib/dashboard/day.ts` (`dayTitle`, `dayTitleShort`), `web/src/lib/dashboard/day.test.ts`, `web/src/lib/components/DayNav.svelte`, `web/src/lib/components/DayNav.test.ts`; update any test that asserts the old title text (grep `web/src` and `web/e2e` for "Monday 23 November"-style strings, e.g. "Friday 6 November", "Fri 6 Nov").

- [ ] Failing tests: `dayTitle('2026-11-23', '2026-11-23')` → `'Monday, 23 November'`; another year → `'Monday, 23 November 2025'`-style with the year (keep today's year rule); `dayTitleShort` → `'Mon, 23 Nov'`. DayNav: the subtitle is a separate element below the title on desktop (not inline); the title button uses `items-center`/column layout (no `items-baseline`).
- [ ] Implement; the top bar row and DayNav are `items-center`; title block is a column (title, then `text-xs text-muted` subtitle, subtitle hidden on phones as today).
- [ ] Update other tests/e2e strings for the new format. Run vitest, check, lint, and `pnpm playwright test e2e/dashboard.spec.ts e2e/firstrun.spec.ts`.
- [ ] Commit `fix(web): day title reads "Monday, 23 November" and sits centred in the top bar`.

### Task 2: Endless event list

**Files:** Modify `web/src/lib/components/EventList.svelte` (today: `pageSize = 50` prop and a "Show {pageSize} more" button, ~line 130), `web/src/lib/components/EventList.test.ts`; e2e assertions on "Show 50 more" in `web/e2e/dashboard.spec.ts`.

**Interfaces:** `EventList` props unchanged. The scroll root is the nearest scrolling ancestor (Watch's rows scroller); pass it explicitly if needed via an optional `scrollRoot?: HTMLElement` prop, or use `root: null` with the sentinel inside the scroller — implementer's call, documented in the report.

- [ ] Failing tests (mock `IntersectionObserver` in vitest): when the sentinel intersects, 50 more rows render; with all rows shown there is no sentinel and the observer is disconnected; "Showing N of M" text is present while more remain; without `IntersectionObserver` the "Show 50 more" button is rendered as fallback.
- [ ] Implement with `rootMargin: '200px'`; disconnect on destroy; reset the page count when `clips` changes to a new day/filter (keep today's behaviour for that).
- [ ] e2e: in `dashboard.spec.ts`, replace the "Show 50 more" click with scrolling the list to the bottom and expecting row 51 to appear (400-recording fixture).
- [ ] Run vitest, check, lint, playwright. Commit `feat(web): the event list loads more as you scroll`.

### Task 3: Duration while streaming, and playback speed

**Files:** Modify `web/src/lib/components/Player.svelte`, `web/src/lib/components/components.test.ts` (Player tests), `web/src/routes/watch/Watch.svelte` (pass `durationOf`), `web/src/routes/watch/Watch.test.ts`, `web/src/lib/components/Icon.svelte` only if a speed icon is used (text "1×" is enough).

**Interfaces:**
- `Player` new optional props: `durationOf?: (clipId: string) => number | null` (milliseconds, from the sidecar's `duration_ms`; Watch builds it from `data.rows` `durationMs`).
- Effective duration: `Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (durationOf?.(clipId) ?? 0) / 1000`.
- Speed: `SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const`; state `rate = 1` (component-level, survives clip changes); apply to `video.playbackRate` on change and again after each clip load / `loadedmetadata` / `play` (engines and MSE source swaps can reset it).

- [ ] Failing tests:
  - streaming: `video.duration = NaN`, `currentTime = 2`, `durationOf → 28_000` → the bar shows `0:02 / 0:28` and the Position slider is enabled with `max = 28`.
  - incomplete: `durationOf → null` and `duration = NaN` → shows `0:00` length and the slider stays disabled (Review Focus 1).
  - browser wins: `video.duration = 27.4`, `durationOf → 28_000` → length `0:27` (Review Focus 2).
  - speed (desktop): a "Playback speed" button showing "1×"; choosing 2× sets `video.playbackRate === 2` and the button shows "2×"; the menu marks the current speed.
  - speed persists across a new clip (simulate the engine emitting a new clip id and a reset `playbackRate = 1` + `loadedmetadata`) → `playbackRate` back to 2 (Review Focus 3).
  - compact: the speed choices are inside the "More" menu, not in the bar.
  - Watch: passes `durationOf` so a playing row's length appears in the bar before the browser knows it.
- [ ] Implement. Menu like the existing More menu (Escape closes, click outside closes); 44 px items on phones.
- [ ] Run vitest, check, lint, playwright (the compact one-row e2e at 390×844 and 844×390 must stay green). Commit `feat(web): playback speed menu; clip length shows while it streams`.
