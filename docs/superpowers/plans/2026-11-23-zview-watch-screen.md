# zview Watch Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace zview's Home and Timeline views with one fixed-height Watch screen (live and recordings in one player, full control bar, list beside the video), and add a System/Light/Dark theme switch, a dot-only recorder status and a key menu.

**Architecture:** A new `routes/watch/Watch.svelte` absorbs `routes/home/Home.svelte` and `routes/+page.svelte` and reuses the existing data layer (`createDayData`), shortcuts, `Timeline`, `EventList`, `Player` and `LiveGrid`/`LiveTile`. `Player` and `LiveTile` are reshaped to fill a stage and draw one control bar under it. The app shell (`App.svelte`) drops the tabs, renders a single top bar, and lets the Watch screen fill `100dvh` without scrolling.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-zview-watch-screen-design.md` (read it first; section numbers below refer to it). Approved mockup: `.superpowers/brainstorm/47034-1795408204/content/watch-v1.html` (open it in a browser for the look; it is not production code).

## Global Constraints

- Strict TDD (AGENTS.md): a failing test before any implementation code. Run tests from `web/`: `pnpm vitest run <file>`; before each commit also `pnpm check` and `pnpm lint` must pass.
- Mandated copy is unchanged (ui-spec §4.4, §4.8, §4.9): "Encrypted recording verified", the failure texts from `lib/player/status.ts`, "This saves an **unencrypted** copy on this device.", "New version available — reload".
- Keyboard map unchanged (ui-spec §4.7): `Space` play/pause, `←`/`→` ±10 s, `J`/`K` previous/next clip, `[`/`]` zoom, `T` jump to now. Shortcut dispatch stays in `lib/dashboard/shortcutDispatch.ts`.
- Never colour alone: trigger chips always show their glyph; a status that is not `ok` shows words.
- No `{@html}` with data; CSP stays `script-src 'self'` (`internal/zview/app.go`), so no inline scripts.
- Tokens only (`--z-*` / Tailwind `bg-ground`, `text-ink`, …); no new colours. DESIGN.md rules hold: 1 px rules, no shadows, no cards, 44 px touch targets on phones.
- Phone/desktop breakpoint: Tailwind `md` (768 px) for the side list; landscape rule in Task 7.
- Every existing behaviour tested in `routes/home/Home.test.ts`, `routes/page.test.ts` and `App.test.ts` keeps a test after the merge (move, don't drop).

## Review Focus

1. Storage that throws (Safari private mode, blocked site data) when reading or saving the theme: the app shows System and keeps working. → test in Task 1.
2. Entering recording mode must unmount the live tiles (frees the WHEP viewer slot), and the Live pill must remount them; a hidden page still closes them (existing tile behaviour). → test in Task 7.
3. Changing the day while a recording plays: today returns to live; a past day shows the empty stage, never a stale clip. → test in Task 7.
4. Auto-advance to the next clip: the badge time, clock and selected row follow the new clip. → test in Task 5.
5. A long camera name on a 390 px phone must not push the Recording badge under the Live pill (badge truncates). → e2e check in Task 9.

---

### Task 1: Theme preference and switch

**Files:**
- Create: `web/src/lib/theme/theme.ts`, `web/src/lib/theme/theme.test.ts`, `web/src/lib/theme/ThemeButton.svelte`, `web/src/lib/theme/ThemeButton.test.ts`, `web/static/theme-init.js`
- Modify: `web/src/app.css` (token blocks), `web/index.html` (head), `web/src/main.ts` (apply on start), `web/src/lib/timeline/Timeline.svelte:145-166` (redraw on theme change), `web/src/lib/components/Icon.svelte` (icons `theme-system`, `theme-light`, `theme-dark`)

**Interfaces:**
- Produces:
  - `type ThemeChoice = 'system' | 'light' | 'dark'`
  - `const THEME_KEY = 'zview.theme'`, `const THEME_EVENT = 'zview:theme'`
  - `loadTheme(storage?: Pick<Storage,'getItem'>): ThemeChoice` — unknown, missing or throwing → `'system'`
  - `saveTheme(c: ThemeChoice, storage?: Pick<Storage,'setItem'|'removeItem'>): void` — `'system'` removes the key; a throw is swallowed
  - `nextTheme(c: ThemeChoice): ThemeChoice` — system → light → dark → system
  - `applyTheme(c: ThemeChoice, doc?: Document): void` — sets `document.documentElement.dataset.theme` to `'light'`/`'dark'` or deletes it for system; sets `<meta name="theme-color">` to the resolved ground colour (`#0E1A1F` dark, `#EDE9DF` light); dispatches `THEME_EVENT` on `window`
  - `<ThemeButton />` — no props; one 44 px icon button, `aria-label` and `title` = `Theme: System|Light|Dark`

- [ ] **Step 1: Write failing unit tests** in `theme.test.ts`:

```ts
it('falls back to system when storage throws', () => {
  const bad = { getItem: () => { throw new Error('denied'); } };
  expect(loadTheme(bad)).toBe('system');
});
it('ignores unknown stored values', () => expect(loadTheme({ getItem: () => 'blue' })).toBe('system'));
it('cycles system → light → dark → system', () => {
  expect([nextTheme('system'), nextTheme('light'), nextTheme('dark')]).toEqual(['light', 'dark', 'system']);
});
it('saving system removes the key; a throwing setItem is swallowed', () => { /* spy removeItem called with THEME_KEY; setItem throwing does not throw */ });
it('applyTheme sets data-theme, theme-color and fires the event', () => {
  // light → dataset.theme === 'light', meta content '#EDE9DF', one THEME_EVENT; system → no data-theme attribute
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/theme/theme.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement `theme.ts`** with the signatures above. For `applyTheme('system')` the theme-color follows `matchMedia('(prefers-color-scheme: light)')`.
- [ ] **Step 4: Run** the test — expect PASS.
- [ ] **Step 5: Write failing `ThemeButton.test.ts`:** starts with `aria-label="Theme: System"` when storage is empty; one click → `Theme: Light`, `localStorage['zview.theme'] === 'light'`, `document.documentElement.dataset.theme === 'light'`; two more clicks → `Theme: System` and the key is removed.
- [ ] **Step 6: Implement `ThemeButton.svelte`** (icon only, class like the other top-bar icon buttons: `inline-flex size-11 items-center justify-center text-muted`) and the three icons in `Icon.svelte` (stroke icons: a screen, a sun, a moon — see the mockup's SVG paths). Run the test — PASS.
- [ ] **Step 7: CSS.** In `app.css` change the light block to apply when the user forced light or follows a light system:

```css
:root[data-theme='light'] { /* the nine light --z-* values */ }
@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) { /* same nine values */ } }
```

Also set `color-scheme: dark` under `[data-theme='dark']` and `color-scheme: light` under `[data-theme='light']`. Keep the light values in one place (a shared selector list is fine).
- [ ] **Step 8: Pre-paint.** `web/static/theme-init.js` (plain script, no module, ≤ 15 lines): read `localStorage['zview.theme']` in a try/catch and set `document.documentElement.dataset.theme` for `light`/`dark`. Add `<script src="/theme-init.js"></script>` in `index.html` `<head>` before the manifest link. In `main.ts` call `applyTheme(loadTheme())` before mounting (sets theme-color).
- [ ] **Step 9: Timeline redraw.** In `Timeline.svelte`'s mount effect, also listen to `window` `THEME_EVENT` with the same `onScheme` handler and remove it on teardown. Add a test to `lib/timeline/Timeline.test.ts`: dispatching `THEME_EVENT` calls the palette reader again (follow the file's existing pattern for the scheme `change` test, if any; otherwise spy on `getComputedStyle`).
- [ ] **Step 10: Light contrast test** (spec §11). Create `web/src/lib/theme/contrast.test.ts` that parses the light values from `app.css` (or `DESIGN.md` frontmatter, as `triggerContrast.test.ts` does) and asserts WCAG ratios: `ink` and `muted` ≥ 4.5:1 on `ground` and `plate`; `line`, `foil`, `amber`, `void` ≥ 3:1 on `ground` and `plate`; each trigger colour ≥ 3:1 against light `plate` (timeline bars, non-text). If a trigger fails, report it to the user rather than retinting (the Spec Colours Rule fixes them).
- [ ] **Step 11: Run** `pnpm vitest run src/lib/theme src/lib/timeline && pnpm check && pnpm lint` — PASS.
- [ ] **Step 12: Commit** `feat(web): theme switch (System, Light, Dark) kept per browser`.

### Task 2: Trigger chips with multi-select filtering

**Files:**
- Create: `web/src/lib/components/TriggerChips.svelte`, `web/src/lib/components/TriggerChips.test.ts`
- Modify: `web/src/lib/dashboard/data.ts:40-67` (`trigger: string` → `triggers: readonly string[]`), `web/src/lib/dashboard/dayData.svelte.ts:16-61`, their tests `data.test.ts`, `dayData.svelte.test.ts`

**Interfaces:**
- Consumes: `triggerStyle(t)` from `lib/timeline/model.ts` (colour, glyph, label).
- Produces:
  - `DayQuery.triggers: readonly string[]` (empty = all); `DayQueryInput.triggers?: readonly string[]`
  - `<TriggerChips selected={string[]} available={string[]} onChange={(next: string[]) => void} />` — renders "All" then one chip per type in the order person, vehicle, pet, motion, other; `other` only when it is in `available`. `role="group"`, `aria-label="Filter by trigger"`; each chip is a `<button aria-pressed>`.

- [ ] **Step 1: Failing test in `data.test.ts`:** `loadDay` with `triggers: ['person','pet']` calls `/api/v1/clips` with `query.trigger` equal to `['person','pet']`; with `[]` no `trigger` key is sent.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/dashboard/data.test.ts` — FAIL.
- [ ] **Step 3: Implement** the `triggers` field (`clipQuery` becomes `Record<string, QueryValue>`; send the array only when non-empty) and pass it through `createDayData` (cache key includes the sorted list). Update existing callers in tests.
- [ ] **Step 4: Run** dashboard tests — PASS.
- [ ] **Step 5: Failing `TriggerChips.test.ts`:** "All" is pressed when `selected=[]`; clicking "Person" calls `onChange(['person'])`; clicking a pressed chip removes it; clicking "All" calls `onChange([])`; each chip shows its glyph (`P`, `V`, `A`, `M`) next to its label; "Other" absent unless `available` contains `'other'`.
- [ ] **Step 6: Implement** chips: 32 px high desktop, 44 px min-height on phones, `rounded-full border border-rule`, pressed = `border-line bg-plate`. The row is `flex gap-1.5 overflow-x-auto` with `flex-wrap: nowrap` below `md` and `flex-wrap` at `md` (§7.6 "Phone list header").
- [ ] **Step 7: Run** tests, `pnpm check`, `pnpm lint` — PASS. **Commit** `feat(web): trigger chips filter the day by several triggers`.

### Task 3: Quiet recorder status dot

**Files:**
- Modify: `web/src/lib/components/StatusPill.svelte`, `web/src/lib/components/StatusPill.test.ts`

**Interfaces:**
- Consumes: `recorderWords(status, nowMs, zone)` from `lib/relayStatus.ts` (unchanged: levels `ok|warn|bad|unknown`, `short`, `details`).
- Produces: `StatusPill` with the same props; `data-testid="relay-status"` and `data-level` kept.

- [ ] **Step 1: Failing tests:** at level `ok` the button's visible text is empty, its `aria-label` is `Recorder OK` and `title` is the first detail line; at `bad` (stale) the visible text is `Recorder quiet 4 min`; at `unknown` it is `Status unavailable`; the dot is 10 px with a soft ring in every state. Replace the old `toContain('Recorder OK')` assertion.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/components/StatusPill.test.ts` — FAIL.
- [ ] **Step 3: Implement:** show `words.short` only when `level !== 'ok'`, in the level's ink (`text-amber`, `text-void`, `text-muted`); `aria-label={words.short}` always; ring = `box-shadow: 0 0 0 3px color-mix(in srgb, <ink> 25%, transparent)` (a ring, not a shadow — allowed); button keeps `min-h-11 min-w-11`. Details panel unchanged.
- [ ] **Step 4: Run** — PASS; `pnpm check && pnpm lint`. **Commit** `feat(web): recorder status is a dot when all is well, words when not`.

### Task 4: Key menu

**Files:**
- Create: `web/src/lib/components/KeyMenu.svelte`, `web/src/lib/components/KeyMenu.test.ts`

**Interfaces:**
- Produces: `<KeyMenu canLock={boolean} onLock={() => void} />` — a 44 px key-icon button (`aria-label="Key and lock"`, `aria-haspopup="menu"`, `aria-expanded`) opening a `role="menu"` with `Lock now` (`role="menuitem"`, disabled when `!canLock`, calls `onLock` and closes) and `Manage keys` (an `<a role="menuitem" href="#/key">`). Escape and an outside click close it; focus returns to the button.

- [ ] **Step 1: Failing tests** for each behaviour above.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/components/KeyMenu.test.ts` — FAIL.
- [ ] **Step 3: Implement** (menu panel: `bg-plate border border-rule rounded-[10px]`, items 44 px).
- [ ] **Step 4: Run** — PASS; check, lint. **Commit** `feat(web): key menu with Lock now and Manage keys`.

### Task 5: Player fills the stage and has one control bar

**Files:**
- Modify: `web/src/lib/components/Player.svelte`, `web/src/lib/components/components.test.ts` (Player tests)

**Interfaces:**
- Consumes: `describeIntegrity`, `Seal`, `formatClock`, `toggleFullscreen` (all existing).
- Produces: `Player` props change:
  - remove `onBack`; add `onLive?: () => void` — when set, a pill button `● Live` (`aria-label="Back to live"`) at the stage's top-right.
  - add `compact?: boolean` — the phone bar (§7.6).
  - The component root becomes `flex h-full min-h-0 flex-col`: a stage `div` (`relative min-h-0 flex-1 bg-black`, video `h-full w-full object-contain`) then the bar, then the integrity line / alerts. The `md:w-[min(100%,calc(56vh*16/9))]` cap is removed.
  - Stage overlays: top-left badge `Recording · <camera> <HH:MM:SS start> <glyph chips>` (`truncate`, `max-w-[calc(100%-6rem)]`); top-right Live pill.
  - Bar (desktop, left → right): Previous clip, Back 10 seconds, Play/Pause, Forward 10 seconds, Next clip, clock, Position slider (`flex-1`), Autoplay next checkbox, seal + integrity text (`data-testid="integrity"`), Export, sound (only when the video has an audio track; else omitted), Full screen. All existing `aria-label`s and titles stay.
  - Clock: wall time of the current frame `formatClock(header.startUnixMs + pos*1000, zone, true)` in `num text-[15px] font-semibold`, then `pos / duration` as `m:ss / m:ss` in `text-xs text-muted`. `compact` stacks them in two lines.
  - `compact` bar: Previous, Play/Pause, Next, clock, slider, sound, Full screen; then one line under the bar with the seal + integrity text and a `⋯` menu button (`aria-label="More"`) holding Back 10 s, Forward 10 s, Autoplay next, Export.
  - Full screen is available in both layouts (§7.6).

- [ ] **Step 1: Failing tests** (in the Player describe block of `components.test.ts`):
  - with `onLive`, a "Back to live" button is shown on the stage and calls it; without it, none.
  - the clock shows the frame's wall time: clip starting 11:17:12 (Asia/Jakarta) at `currentTime = 12` → `11:17:24` and `0:12 / 0:27`.
  - auto-advance to a new clip id updates the badge time and the clock (Review Focus 4).
  - `compact`: the bar has Previous clip, Play, Next clip, Position, Full screen; "Back 10 seconds" and "Export" are inside the `More` menu, not in the bar.
  - Full screen button exists while a recording plays (desktop and `compact`) when `fullscreenMode` is not `none`.
  - mandated integrity copy still renders (`Encrypted recording verified` on verified).
- [ ] **Step 2: Run** `pnpm vitest run src/lib/components/components.test.ts` — FAIL.
- [ ] **Step 3: Implement** the layout above, reusing the existing state (`pos`, `duration`, `playing`, `snap`, `header`, `exportable`). The over-video scrim with the slider goes away (the slider moves into the bar). The non-verified alert box stays under the bar.
- [ ] **Step 4: Run** — PASS; check, lint. **Commit** `feat(web): player fills its stage with one control bar, wall clock and Live pill`.

### Task 6: Live stage (single-camera bar, tap a tile to focus)

**Files:**
- Modify: `web/src/lib/live/LiveTile.svelte`, `web/src/lib/live/LiveGrid.svelte`, `web/src/lib/live/LiveTile.test.ts`, `web/src/lib/live/LiveGrid.test.ts`

**Interfaces:**
- Produces:
  - `LiveTile` new props: `single?: boolean`, `onFocus?: () => void`.
    - `single`: the tile is `flex h-full flex-col`; video `min-h-0 flex-1 object-contain`; a top-left badge over the video (`Live` badge once playing, name, `as of HH:MM:SS`); the bottom scrim is replaced by a bar under the video: `Live now` (muted) on the left, sound (when `canUnmute`) and Full screen on the right, same height and style as the Player bar.
    - not `single` (grid): today's overlay controls unchanged; a click on the video area (not on a button) calls `onFocus`; double-click fullscreen unchanged.
  - `LiveGrid` new props: `onFocus?: (cameraId: string) => void`, and it fills its parent (`h-full`). With one camera it renders `<LiveTile single …>`. With several it renders the grid plus a bar line `Live now · tap a camera to see it alone`.

- [ ] **Step 1: Failing tests:** `single` renders the bar with "Live now", "Full screen" and (when `canUnmute`) "Turn sound on", and no overlay scrim; grid tile click on the video calls `onFocus('cam1')`, click on its "Try now" does not; `LiveGrid` with one camera passes `single`; with two shows the hint line.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/live` — FAIL.
- [ ] **Step 3: Implement.** Keep every existing state text and button (Connecting…, Try now, Unlock, limit, offline) and the existing tests green.
- [ ] **Step 4: Run** — PASS; check, lint. **Commit** `feat(web): live stage with a control bar for one camera and tap-to-focus tiles`.

### Task 7: The Watch screen

**Files:**
- Create: `web/src/routes/watch/Watch.svelte`, `web/src/routes/watch/Watch.test.ts`, `web/src/lib/components/DayMenu.svelte`, `web/src/lib/components/DayMenu.test.ts`
- Delete (after moving their tests): `web/src/routes/home/Home.svelte`, `web/src/routes/home/Home.test.ts`, `web/src/routes/+page.svelte`, `web/src/routes/page.test.ts`, `web/src/lib/components/FilterBar.svelte`, `web/src/lib/components/FilterBar.test.ts`
- Modify: `web/src/lib/components/DayNav.svelte` (title opens `DayMenu`), `web/src/lib/components/EventList.svelte` (row height 56 px desktop / 64 px phone, "playing" mark on the selected row)

**Interfaces:**
- Consumes: `createDayData` (with `triggers`, Task 2), `TriggerChips` (Task 2), `Player` with `onLive`/`compact` (Task 5), `LiveGrid` with `onFocus` (Task 6), `Timeline`, `EventList`, `handleKeydown`/`runCommand`, `loadZonePref`/`saveZonePref`/`zoneChoices`.
- Produces:
  - `<Watch client? status nowMs? zone? profile? factory? exportEnv? topRight: Snippet />` — the props of today's Home plus `topRight`, a snippet the shell passes (status, theme, key menu) so the top bar is one row.
  - `<DayMenu day todayDay zone forcedZone browserZone cameras camera showCamera onDay onZone onCamera />` — a popover from the day title: date input, time zone select (moved from FilterBar, same options and `saveZonePref` behaviour), and the camera select when `showCamera`.
  - `data-testid="watch"` on `<main>`; `<h1 class="sr-only">Watch</h1>`.

**Layout (§7.3, §7.4):** `main` is `grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden` (top bar, notices slot from the shell, body). Body:
- `md` and up, or landscape with width ≥ 640 px (`@media (orientation: landscape) and (min-width: 640px)`): `grid-cols-[minmax(0,1fr)_380px]` (300 px list in landscape below `md`), `grid-rows-[minmax(0,1fr)_auto]`; stage+bar in row 1, timeline block in row 2, list spanning both rows with its own `overflow-y-auto`.
- Phone portrait: one column `grid-rows-[auto_auto_auto_minmax(0,1fr)]`: stage (`aspect-video`, `max-h-[calc(100dvh-<top>-<bar>-<timeline>-3*64px)]` so the list keeps three rows), bar, timeline (lanes 48 px, 32 px when `max-height: 700px`), list header + rows (`overflow-y-auto`).

**Top bar:** wordmark, `DayNav` (‹ title ›; title opens `DayMenu`), desktop camera select (only when `cameras.length > 1`), spacer, `{@render topRight()}`.

**Modes (§7.9):** `mode = $derived(selectedId === null ? (day === todayDay ? 'live' : 'idle') : 'recording')`.
- `live`: `<LiveGrid cameras={filtered} onFocus={(id) => (camera = id)} …/>` in the stage.
- `recording`: `<Player onLive={goLive} compact={phone} …/>`; the grid is unmounted.
- `idle` (past day, nothing picked): stage shows a muted sentence `Pick an event or a time on the timeline` and a `Go to today` button.
- `goLive()`: `selectedId = null; cue = null; day = todayDay`.
- `setDay(d)`: `day = d; selectedId = null; cue = null`.
- Timeline click at or after now on today → `goLive()` (pass an `onNow` to `Timeline` if it has no such callback, emit it when the clicked time ≥ `nowMs`). `T` / Now button on today → `goLive()` as well as `jumpToNow()`.

**Timeline block:** one row: zoom out, span label, zoom in, Now, legend (desktop; behind `?` on phones), `?` button (`aria-expanded`, `aria-controls="shortcuts"`) that toggles the shortcuts list (and the legend on phones). Then `<Timeline laneHeight={phone ? 48 : 40} …/>`.

**List block:** header `<h2>` `Today · N events` / `<Day title> · N events` + the `summary` from Home ("N not checked yet" / "All verified" / "N need a look"), `TriggerChips`, `EventList`.

- [ ] **Step 1: Move tests.** Create `Watch.test.ts` by moving every `it(...)` from `Home.test.ts` and `page.test.ts` into it, renaming `Home`/`Timeline page` to Watch and "Back to live" to the Live pill (`getByRole('button', { name: 'Back to live' })` still works — Task 5 kept the name). Delete duplicates (same behaviour tested twice) and note each removal in the commit message.
- [ ] **Step 2: Add failing tests:**
  - opening today shows the live grid and no Player; selecting an event unmounts the grid and shows the Player; "Back to live" remounts the grid (Review Focus 2).
  - with a recording playing, choosing the previous day shows `Pick an event or a time on the timeline` and no Player; choosing today again shows live (Review Focus 3).
  - trigger chips: pressing Person reloads the day with `trigger: ['person']` and the list shows only person rows.
  - the camera select is absent with one camera and present with two; tapping a tile with two cameras filters to that camera.
  - the time zone select is inside the day menu and keeps the `zview.zone` behaviour (move FilterBar's zone tests here or to `DayMenu.test.ts`).
  - `T` on today returns to live from a recording.
- [ ] **Step 3: Run** `pnpm vitest run src/routes/watch src/lib/components/DayMenu.test.ts` — FAIL.
- [ ] **Step 4: Implement** `DayMenu`, the `DayNav` change, the `EventList` row change, and `Watch.svelte` as specified above. Remove the old route and FilterBar files.
- [ ] **Step 5: Run** `pnpm vitest run` (whole suite) — PASS; check, lint.
- [ ] **Step 6: Commit** `feat(web): one Watch screen replaces Home and Timeline`.

### Task 8: App shell — routes, one top bar, notices slot

**Files:**
- Modify: `web/src/App.svelte`, `web/src/App.test.ts`

**Interfaces:**
- Consumes: `Watch` (Task 7), `StatusPill` (Task 3), `ThemeButton` (Task 1), `KeyMenu` (Task 4).

**Behaviour (§7.1, §7.2, §7.4a):**
- `route()` returns `'#/key' | '#/demo' | '#/'`; `#/timeline` and `#/live` map to `'#/'`.
- No tab navs (desktop or phone); remove the bottom padding for the tab bar.
- A `topRight` snippet: `<StatusPill …/> <ThemeButton /> <KeyMenu canLock={hasKey} onLock={() => void lock()} />`. Watch renders it in its top bar. Every other view (`#/key`, first run, the keys-failed message) gets a plain top bar: wordmark + the same snippet.
- Notices (`notice`, `lockFailed`, `UpdatePrompt`) render in one full-width slot directly under the top bar; on the Watch screen this slot is the grid's second row so the page still does not scroll.

- [ ] **Step 1: Failing tests in `App.test.ts`:** `#/timeline` and `#/live` render `data-testid="watch"`; there is no `navigation` landmark named "Views"; the key menu's Lock now calls `key.lock` and shows the locked notice; "Manage keys" navigates to `#/key`; the theme button is present on Watch and on Keys. Update or remove the old tab assertions (tab tests replaced by these).
- [ ] **Step 2: Run** `pnpm vitest run src/App.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole suite, check, lint — PASS. **Commit** `feat(web): one top bar with status, theme and key menu; no tabs`.

### Task 9: End-to-end tests

**Files:**
- Modify: `web/e2e/dashboard.spec.ts`, `web/e2e/timeline.spec.ts`, `web/e2e/live.spec.ts`, `web/e2e/playback.spec.ts`, `web/e2e/page/dashboard-page.ts`, `web/e2e/page/timeline-page.ts` (and their `.html` hosts) to the Watch structure.

- [ ] **Step 1: Add failing checks** (new `describe('fixed layout')` in `dashboard.spec.ts`, shell mode):

```ts
for (const [w, h] of [[1440, 900], [1280, 720], [390, 844], [844, 390]]) {
  test(`the page does not scroll at ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openShell(page);
    const { sh, ih } = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight }));
    expect(sh).toBeLessThanOrEqual(ih);
  });
}
test('on a phone the video stays in view after scrolling the list', async ({ page }) => {
  // 390×844: scroll the list's rows container to the bottom; the stage's boundingBox().y stays >= 0 and < 100
});
test('a long camera name does not run under the Live pill on a phone', async ({ page }) => {
  // 390×844, recording mode: badge and pill boxes do not intersect (Review Focus 5)
});
```

- [ ] **Step 2: Run** `pnpm playwright test` — the new checks and the outdated selectors FAIL.
- [ ] **Step 3: Update** page objects and specs to the new structure (no tabs; trigger chips; Live pill; key menu). Fix layout bugs the new checks find in the Watch screen.
- [ ] **Step 4: Run** `pnpm playwright test` (chromium and webkit) — PASS.
- [ ] **Step 5: Commit** `test(e2e): Watch screen structure and the no-scroll layout`.

### Task 10: Documents

**Files:**
- Modify: `docs/superpowers/specs/2026-11-06-zrelay-v2-design.md` (§7.2 navigation bullets; §11 add the four amendments from the Watch design §10), `DESIGN.md` (replace the tab-bar component and Home wording with the Watch layout, control bar, status dot, theme switch; keep the frontmatter tokens valid), `docs/family-onboarding.md` (Home/Timeline words → the one screen, the Live pill, the key menu), `.impeccable/design.json` only if it lists the tab bar.

- [ ] **Step 1:** Make the edits (simplified technical English for `family-onboarding.md`, per PRODUCT.md).
- [ ] **Step 2:** Verify no stale words remain: `grep -rn "Timeline tab\|Home tab\|Back to live\|bottom tab" docs DESIGN.md` returns only historical plan/spec files.
- [ ] **Step 3: Commit** `docs: record the Watch screen in the v2 design, DESIGN.md and family onboarding`.

### Task 11: Visual pass in both themes

- [ ] **Step 1:** `make demo` (or the project's dev command), open zview at 1440×900 and 390×844 in Dark, Light and System; compare with the mockup. Check the trigger bars on the light plate, seals, chips, the status dot in all four levels (use the e2e status fixtures), and the landscape phone layout.
- [ ] **Step 2:** Fix what does not match (each fix with a test where it is behaviour, not pure styling). Run `pnpm vitest run && pnpm playwright test && pnpm check && pnpm lint`.
- [ ] **Step 3: Commit** `fix(web): Watch screen visual pass in light and dark`.
