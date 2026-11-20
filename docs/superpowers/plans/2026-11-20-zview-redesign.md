# zview Redesign ("Intaglio Seal") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace zview's default-Tailwind UI with the "Intaglio Seal" world and fix every finding of the 2026-11-20 critique: a combined Home (live + the day's events), per-clip verification seals, honest live/key states, phone-first controls.

**Architecture:** Design tokens in `app.css` (dark and light, chosen by `prefers-color-scheme`) feed Tailwind 4 utilities and the canvas palette. New pure modules (`seal/rosette.ts`, `relayStatus.ts` words, `dashboard/day.ts`, live `tile.ts` states) carry the logic and are unit-tested; Svelte components stay thin. The app shell (`App.svelte`) owns routing, relay status polling, Lock and first run; pages receive what they need as props.

**Tech Stack:** Svelte 5 (runes), Vite 8, Tailwind 4, TypeScript, Vitest + Testing Library (jsdom), Playwright e2e, Go for one CSP line.

**Spec:** `docs/superpowers/specs/2026-11-06-zrelay-v2-design.md` §7.2 (as amended in f2b7675) and `docs/specs/ui-spec.md` §4. Design authority: the direction contract in `.impeccable/surfaces/web-src-app-svelte.md` and the chosen sketch `.impeccable/mocks/decision/assigned.html` (both gitignored, read them in the worktree). Product truth: `PRODUCT.md`.

## Global Constraints

- TDD, strictly: a failing test exists and was seen failing before any implementation line (AGENTS.md).
- Every task ends with `pnpm test`, `pnpm check` (0 errors, 0 warnings) and `pnpm lint` clean, run in `web/`.
- No `{@html}` or `innerHTML` with data (ui-spec §4.5; the lint rule enforces it).
- Mandated copy stays verbatim: "Encrypted recording verified", "This recording failed verification at ~mm:ss", "Recording was interrupted", "This saves an **unencrypted** copy on this device.", "New version available — reload", "typo in key", "This key doesn't match recent recordings", "not monitored".
- Trigger glyphs and colours unchanged (ui-spec §4.6): person `P` #f97316, vehicle `V` #22c55e, pet `A` #a855f7, motion `M` #3b82f6, other `•` #9ca3af. Never colour alone.
- Tokens (exact): dark ground #0E1A1F, plate #132429, rule #22393F, line (ink teal) #5FA8A0, ink (text) #E6E2D6, muted #93A6A4, foil #C9A44C, amber #D9A441, void #D2554A; light ground #EDE9DF, plate #E3DED1, rule #C9C2B1, line #2F6F73, ink #1B2A2E, muted #56656A, foil #8A6A1F, amber #9A6A12, void #A8322A. Dark mode has a brightness ceiling: no text or fill lighter than #E6E2D6, no pure white anywhere.
- One face: Atkinson Hyperlegible Next, self-hosted woff2 in `web/src/assets/fonts/`, weights 400 and 600, `font-variant-numeric: tabular-nums` on every time and duration.
- Icons: `web/src/lib/components/Icon.svelte` only (authored SVG paths, 1.75 px stroke, 24 px grid). No emoji or Unicode symbols as icons; the spec's trigger letters are text, not icons.
- Every tap target ≥ 44×44 CSS px on phones (`max-md`).
- No cards, no drop shadows, no gradients except the live video's bottom scrim; no eyebrow/kicker labels above headings; fine 1 px rules separate regions.
- Times are always formatted in the display zone with `formatClock(ms, zone)` from `lib/timeline/timezone.ts`; never UTC in the UI.
- Commit messages: conventional (`feat(web): …`).

## Review Focus

1. A day with no events, an empty camera list, or a failed cameras request: Home and Timeline show a sentence and a next step, never a blank region (tests in Tasks 12 and 13).
2. A busy day (2,000 events across 4 cameras): the DOM stays bounded; the list renders 50 rows and a "Show 50 more" button (test in Task 7).
3. A camera reported `down` while its tile is open, then `up` again: the tile shows "Camera offline", stops retrying, and reconnects when the status recovers (test in Task 5).
4. The key auto-locks while Home is open: tiles show "Key locked" with an Unlock link instead of "Reconnecting…" forever, and the list error links to Keys (tests in Tasks 5 and 12).
5. A forced display zone different from the browser zone (Asia/Jakarta viewed from Europe/Amsterdam): the day label, the live "as of" clock, list times and the mismatch banner all use the display zone (tests in Tasks 4, 6 and 9).

---

### Task 1: Tokens, font, icons and the CSP font source

**Files:**
- Modify: `web/src/app.css`
- Create: `web/src/assets/fonts/AtkinsonHyperlegibleNext-Regular.woff2`, `…-SemiBold.woff2`, `web/src/assets/fonts/LICENSE.txt` (OFL)
- Create: `web/src/lib/components/Icon.svelte`, `web/src/lib/components/Icon.test.ts`
- Modify: `internal/zview/app.go` (CSP), its test file in `internal/zview/`
- Modify: `docs/superpowers/specs/2026-11-06-zrelay-v2-design.md` §11 (`ui-spec.md` §2.4 line)

**Interfaces:**
- Produces: CSS custom properties `--z-ground --z-plate --z-rule --z-line --z-ink --z-muted --z-foil --z-amber --z-void` and the trigger colours `--z-person --z-vehicle --z-pet --z-motion --z-other`, mapped in a Tailwind `@theme` block to utilities `bg-ground bg-plate border-rule text-ink text-muted text-line text-foil text-amber text-void` (and `bg-*`/`border-*` variants); a `.num` utility (`font-variant-numeric: tabular-nums; letter-spacing: .02em`).
- Produces: `<Icon name={IconName} size?={number} label?={string} />`; `export type IconName = 'play' | 'pause' | 'prev' | 'next' | 'back10' | 'fwd10' | 'chevron-left' | 'chevron-right' | 'sound-on' | 'sound-off' | 'fullscreen' | 'fullscreen-exit' | 'lock' | 'key' | 'camera' | 'qr' | 'image' | 'retry' | 'zoom-in' | 'zoom-out' | 'now' | 'download' | 'close' | 'check' | 'home' | 'timeline'`. Without `label` the SVG is `aria-hidden="true"`; with it, `role="img"` and `aria-label`.

- [ ] **Step 1: Write the failing tests**
  - `Icon.test.ts`: `renders every IconName as an svg with at least one path` (iterate an exported `ICON_NAMES` array); `is aria-hidden without a label`; `has role img and the label when labelled`; `uses currentColor and stroke-width 1.75`.
  - In the Go CSP test: assert the header contains `font-src 'self'`.
- [ ] **Step 2: Run them to see them fail** — `cd web && pnpm vitest run src/lib/components/Icon.test.ts` (FAIL: module not found); `go test ./internal/zview/ -run CSP` (FAIL: missing font-src).
- [ ] **Step 3: Implement**
  - Fetch the font: `impeccable font-fetch "Atkinson Hyperlegible Next"`; keep only 400 and 600 woff2 and the OFL text; `@font-face` with `font-display: swap`.
  - `app.css`: tokens on `:root` (dark) and `@media (prefers-color-scheme: light)`; `color-scheme: dark light`; body uses `--z-ground`/`--z-ink` and the font; theme the browser surfaces from the palette: `::selection` (line at 35 %), `caret-color: var(--z-foil)`, thin scrollbars (`scrollbar-color: var(--z-rule) transparent`), `:focus-visible { outline: 2px solid var(--z-foil); outline-offset: 2px }`, links `text-underline-offset: 3px`.
  - `Icon.svelte`: path data adapted from Lucide (ISC; credit in a one-line comment), `viewBox="0 0 24 24"`, `fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`.
  - CSP: add `"font-src 'self'; "` after `img-src`.
  - Design doc §11, `ui-spec.md` block: add `* §2.4: add font-src 'self' (the self-hosted UI face).`
- [ ] **Step 4: Run the tests to see them pass**, then `pnpm test && pnpm check && pnpm lint` and `go test ./internal/zview/`.
- [ ] **Step 5: Commit** — `feat(web): Intaglio Seal tokens, self-hosted face and icon set`

### Task 2: The seal (rosette) module and component

**Files:**
- Create: `web/src/lib/seal/rosette.ts`, `web/src/lib/seal/rosette.test.ts`, `web/src/lib/seal/Seal.svelte`, `web/src/lib/seal/Seal.test.ts`

**Interfaces:**
- Consumes: `IntegrityState` from `lib/player/engine` (`'verifying' | 'verified' | 'mismatch' | 'tampered' | 'incomplete' | 'unknown-key'`).
- Produces:
  - `export type SealState = IntegrityState | 'unchecked'`
  - `export interface RosetteParams { petals: number; inner: number; offset: number; phase: number }` (petals 5–11 integer, inner 0.25–0.6, offset 0.3–0.9, phase 0–2π)
  - `export function rosetteParams(seed: string): RosetteParams` — deterministic from an FNV-1a 32-bit hash of `seed`.
  - `export function rosettePath(p: RosetteParams, size: number, steps?: number): string` — closed SVG path (`M … Z`) of a hypotrochoid scaled to fit `size` with a 1 px margin; `steps` default 360.
  - `export function sealLabel(state: SealState): string` — exact strings: unchecked "Not checked yet. Play it to verify."; verifying "Verifying…"; verified "Encrypted recording verified"; incomplete "Recording was interrupted"; mismatch "Metadata mismatch"; tampered "Failed verification"; unknown-key "Recorded with another key".
  - `<Seal seed={string} state={SealState} size?={number /*32*/} showLabel?={boolean} />` — root `<span data-seal-state={state}>` with an `<svg role="img" aria-label={sealLabel(state)}>`; `showLabel` adds the label as visible text after the svg.

Drawing per state (one world, read the sketch): unchecked = outer ring only, dashed, `--z-muted`; verifying = rosette at 40 % opacity with a slow rotation (disabled under `prefers-reduced-motion`); verified = full rosette + ring in `--z-line`; incomplete = rosette clipped to a 240° arc (stroke-dasharray), `--z-amber`; mismatch = full rosette in `--z-amber`; tampered = ring in `--z-void` with the word VOID repeated diagonally inside a clipPath (text, 5 px, no rosette); unknown-key = rosette in `--z-muted` with a broken ring.

- [ ] **Step 1: Write the failing tests**
  - `rosette.test.ts`: `same seed gives identical params`; `params stay in range for 500 random seeds`; `different seeds differ (≥ 95 % distinct petal/inner/offset triples over 200 clip ids)`; `path starts with M, ends with Z, has no NaN, and every coordinate lies within [0, size]`; `sealLabel returns the exact copy for all seven states`.
  - `Seal.test.ts`: `has data-seal-state and an accessible name per state`; `shows the label text only with showLabel`; `tampered renders the VOID pattern and no rosette path`; `unchecked renders no rosette path`.
- [ ] **Step 2: Run them to see them fail** — `pnpm vitest run src/lib/seal` (FAIL).
- [ ] **Step 3: Implement** the module and component as specified; colours via the Task 1 tokens only.
- [ ] **Step 4: Run them to see them pass**, then the full gate (`pnpm test && pnpm check && pnpm lint`).
- [ ] **Step 5: Commit** — `feat(web): per-clip guilloché seal drawn from verification state`

### Task 3: Recorder status in words

**Files:**
- Modify: `web/src/lib/relayStatus.ts`, `web/src/lib/relayStatus.test.ts`
- Create: `web/src/lib/components/StatusPill.svelte`, `web/src/lib/components/StatusPill.test.ts`

**Interfaces:**
- Consumes: `relayHealth(status, nowMs)`, `STALE_AFTER_MS`, `formatClock`.
- Produces:
  - `export interface RecorderWords { level: HealthLevel; short: string; details: string[] }`
  - `export function recorderWords(status: Status | null, nowMs: number, zone: string): RecorderWords`. `short` rules, first match wins: null → "Status unavailable"; stale → `Recorder quiet ${n} min` (n = whole minutes since `updated_at`; ≥ 120 min → `Recorder quiet ${h} h`); any camera `rtsp: 'down'` → `${name} offline` (two or more → `${k} cameras offline`); degraded or events not up → `${name} degraded`; storage breaker not closed → "Storage delayed"; else "Recorder OK". `details`: one plain sentence per finding with times as `formatClock(…, zone)`, e.g. "Front Door has been offline since 21:04.", "The recorder last checked in at 21:43.", "Saving to storage is delayed since 20:58."; for ok: "The recorder checked in at 21:46."
  - `<StatusPill status={Status | null} nowMs={number} zone={string} />` — a `<button aria-expanded>` showing a level dot and `short`; clicking toggles a disclosure region (`id`-linked, not a modal) listing `details`; Escape closes it. `data-testid="relay-status"` and `data-level`.
  - Keep `relayHealth` exported (the level rules do not change).

- [ ] **Step 1: Write the failing tests** — `recorderWords`: one test per `short` rule above with exact strings; `details use the display zone` (status at 2026-11-20T14:04Z, zone Asia/Jakarta → "21:04"); `ok details`. `StatusPill`: `shows short text and level`; `toggles details with aria-expanded`; `Escape closes`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): recorder status in plain words with details on tap`

### Task 4: Day navigation

**Files:**
- Create: `web/src/lib/dashboard/day.ts`, `web/src/lib/dashboard/day.test.ts`, `web/src/lib/components/DayNav.svelte`, `web/src/lib/components/DayNav.test.ts`

**Interfaces:**
- Consumes: `localDayOf(ms, zone)`.
- Produces:
  - `export function shiftDay(day: string, delta: number): string` (YYYY-MM-DD, calendar arithmetic, month/year rollover).
  - `export function zoneCity(zone: string): string` ("Asia/Jakarta" → "Jakarta", "America/Argentina/Buenos_Aires" → "Buenos Aires", "UTC" → "UTC").
  - `export function dayTitle(day: string): string` ("2026-11-20" → "Friday 20 November"; year appended when not the current year of `todayDay`: use `dayTitle(day, todayDay)` → "Friday 20 November 2025").
  - `export function daySubtitle(day: string, todayDay: string, zone: string): string` → "Jakarta time · today" / "· yesterday" / no suffix otherwise.
  - `<DayNav day={string} todayDay={string} zone={string} onDay={(d: string) => void} />` — two 44 px icon buttons ("Previous day", "Next day"; next disabled when `day === todayDay`), the title as a button that opens a native `<input type="date">` picker (`showPicker()` where available, labelled "Choose a date"), the subtitle under it.

- [ ] **Step 1: Write the failing tests** — the exact examples above; `shiftDay('2026-12-31', 1) === '2027-01-01'`; `shiftDay('2026-03-01', -1) === '2026-02-28'`; DayNav: `next is disabled on today`; `previous calls onDay with the previous day`; `picking a date calls onDay`; `an empty picker value is ignored`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** (format with `Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })` on the noon-UTC instant of `day`).
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): day navigation with plain day titles`

### Task 5: Live tile states that tell the truth

**Files:**
- Modify: `web/src/lib/live/tile.ts`, `web/src/lib/live/tile.test.ts`

**Interfaces:**
- Produces:
  - `export type TileState = 'connecting' | 'live' | 'reconnecting' | 'limit' | 'locked' | 'offline'`
  - `TileSnapshot` gains `retryAt: number | null` (epoch ms of the next attempt, null when none is scheduled).
  - `Tile` gains `tryNow(): void` (cancel the timer, reset the backoff, open now; no-op while `live`, `locked` or `offline`) and `setOffline(down: boolean): void`.
  - `TileOptions` gains `now?: () => number` (default `Date.now`).
- Behaviour changes: `live` is set when the `<video>` fires `playing` (listener added in `createTile`, removed in `destroy`), not on ICE `connected`; ICE `connected` only resets `attempt`. An error with `name === 'ErrNoKey'` or `status === 401` → `locked`, no retry until `tryNow()`. `setOffline(true)` → tear down the session, state `offline`, no retries; `setOffline(false)` while `offline` → `connecting` and open. Hidden tab behaviour unchanged.

- [ ] **Step 1: Write the failing tests** — `stays connecting after ICE connected until the video plays`; `goes live on the playing event`; `ErrNoKey gives locked and schedules no retry`; `401 gives locked`; `tryNow from locked opens immediately`; `tryNow during reconnecting cancels the timer and opens`; `retryAt is now + backoff while reconnecting and null when live`; `setOffline(true) closes the session and never retries`; `setOffline(false) reconnects` (Review Focus 3); `destroy removes the playing listener`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): live tiles go live on playback and stop retrying when they cannot succeed`

### Task 6: Live tile and live grid views

**Files:**
- Modify: `web/src/lib/live/LiveTile.svelte`, `web/src/lib/live/LiveTile.test.ts`
- Create: `web/src/lib/live/audioFocus.ts`, `web/src/lib/live/audioFocus.test.ts`, `web/src/lib/live/LiveGrid.svelte`, `web/src/lib/live/LiveGrid.test.ts`

**Interfaces:**
- Consumes: Task 5 `createTile`, `TileSnapshot`, `tryNow`, `setOffline`; Task 1 `Icon`; `formatClock`.
- Produces:
  - `audioFocus.ts`: `export function claimAudio(id: string, mute: () => void): () => void` — the newest claimant mutes the previous one; the returned function releases.
  - `<LiveTile cameraId name client zone offline?={boolean} />` — keeps `data-testid="live-tile"`, `data-camera`, `data-state`. Layout: 16:9 video; bottom scrim bar with the name, "as of HH:mm:ss" (display zone, ticking each second only while `live`), a "Live" badge (ink-teal fill, ground text) only in `live`; sound and fullscreen icon buttons (44 px, labels "Turn sound on"/"Turn sound off", "Full screen"/"Exit full screen", no `aria-pressed`). Non-live states centre a message over the frame: connecting "Connecting…"; reconnecting "Can't reach the camera. Trying again in N s." + "Try now" button; limit "Too many people are watching. zview tries again in N s." + "Try now"; locked "Key locked." + link "Unlock" to `#/key`; offline "Camera offline. zview reconnects when it is back." The state sentence is in one `role="status"` element whose text does not include the countdown (the countdown is a separate `aria-hidden` span). Fullscreen is offered only in `live`.
  - `<LiveGrid cameras={Camera[]} client zone status={Status | null} />` — grid by count: 1 → one column; 2 → `md:grid-cols-2`; 3–4 → `grid-cols-2` from `sm`; passes `offline` per camera from `status.cameras[].rtsp === 'down'`.

- [ ] **Step 1: Write the failing tests** — LiveTile: `badge only when live`; `as-of clock uses the display zone` (Review Focus 5); `reconnecting shows Try now and calls tryNow`; `locked shows an Unlock link to #/key`; `offline prop calls setOffline`; `turning sound on in one tile turns it off in the other` (two tiles); `the status element text has no digits while counting down`. LiveGrid: `one camera → single column class`; `four cameras → two columns`; `a down camera's tile gets offline`. audioFocus: `claim mutes the previous claimant`; `release clears focus`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** (inject a fake tile factory in tests the way the existing `LiveTile.test.ts` does).
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): live tiles with honest states and a camera-count grid`

### Task 7: The event list (seals, keyboard, paging)

**Files:**
- Modify: `web/src/lib/components/EventList.svelte`, its tests in `web/src/lib/components/components.test.ts` (move EventList cases to a new `EventList.test.ts`)

**Interfaces:**
- Consumes: Task 2 `Seal`, `SealState`; `EventRow`, `formatDuration`, `triggerStyle`, `formatClock`.
- Produces: `<EventList clips={EventRow[]} selectedId zone integrity onSelect pageSize?={number /*50*/} />`. Virtualization is removed; `ROW_HEIGHT` becomes 64 and stays exported. Keeps `role="listbox"` with accessible name "Recordings" and `role="option"` rows with `aria-selected`.
  - Row anatomy: time `HH:mm` in 20 px semibold `.num`; trigger chips (letter on the trigger colour, ground-coloured text); camera name; length; `Seal` (seed = clip id, state = `integrity[id] ?? 'unchecked'`, `incomplete` when `status === 'incomplete'` and nothing better is known).
  - Keyboard: roving tabindex (the selected row, else the first row, has `tabindex=0`); ArrowUp/ArrowDown move focus, Home/End jump, Enter/Space select.
  - Paging: renders the first `pageSize` rows; a "Show 50 more" button below (hidden when all are shown); the count line "Showing 50 of 400".
  - Empty: "No recordings on this day." in muted text.

- [ ] **Step 1: Write the failing tests** — `renders at most 50 options for 2000 clips and a Show 50 more button` (Review Focus 2); `Show 50 more adds 50`; `the first row is tabbable when nothing is selected`; `ArrowDown moves focus to the next row`; `End focuses the last rendered row`; `Enter selects`; `a row without integrity shows the unchecked seal`; `an incomplete clip shows the incomplete seal`; `empty list shows the sentence`; `times use the display zone`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): event list with seals, arrow keys and paging`

### Task 8: Timeline canvas in the new world

**Files:**
- Modify: `web/src/lib/timeline/render.ts`, `render.test.ts`, `model.ts`, `model.test.ts`, `Timeline.svelte`, `Timeline.test.ts`

**Interfaces:**
- Produces:
  - `render.ts`: `Palette` gains `mismatch`, `tampered`, `foil`; `export const DARK: Palette` and `export const LIGHT: Palette` from the Task 1 hex values; `export function readPalette(el: Element): Palette` (reads the `--z-*` custom properties, falls back to `DARK`). `DrawOptions` gains `integrity: Readonly<Record<string, IntegrityState | undefined>>`.
  - Drawing: lane names are drawn after the bars on a plate-coloured label backing; a tampered clip bar is outlined in `tampered` with a diagonal hatch; a mismatch bar is outlined in `mismatch` with a small filled triangle at its start (ui-spec §4.4 "timeline marker flagged"); the selection outline uses `foil`; the now line uses `foil`.
  - `model.ts`: `LayoutInput` gains `laneHeight?: number` (default `LANE_HEIGHT` 44); phones pass 56.
  - `Timeline.svelte`: new props `integrity`, `laneHeight`, `onSpan?: (spanMs: number) => void` (called whenever the view span changes, for the readout); `stepZoom(dir)` anchors on the selected clip's start when it is inside the current view, else on now; the canvas `aria-label` lists both `+`/`-` and `[`/`]`.
  - `export function spanLabel(spanMs: number): string` in `zoom.ts`: "24 h", "6 h", "1 h", "10 min", "1 min", and in-between values rounded ("3 h", "25 min", "90 s").

- [ ] **Step 1: Write the failing tests** — `readPalette reads custom properties`; `tampered bar is stroked with the tampered colour` (spy ctx); `mismatch draws a marker`; `lane name is drawn after the bars`; `laneHeight changes the layout height`; `stepZoom keeps the selected clip in view`; `onSpan reports the new span`; `spanLabel` examples.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement**; `Timeline.svelte` calls `readPalette` on mount and on `prefers-color-scheme` change, then redraws.
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): timeline canvas draws integrity markers in the new palette`

### Task 9: Player integrity, transport and export

**Files:**
- Modify: `web/src/lib/player/status.ts`, `status.test.ts`, `web/src/lib/components/Player.svelte`, `ExportDialog.svelte`, the Player/ExportDialog cases in `components.test.ts`
- Delete: `web/src/lib/components/IntegrityBadge.svelte` (replaced by `Seal`) and its tests

**Interfaces:**
- Consumes: Task 2 `Seal`; Task 1 `Icon`; `formatClock`.
- Produces:
  - `describeIntegrity(s: PlayerState, ctx: { zone: string; cameraName: (id: string) => string }): IntegrityView` — mismatch text: "This recording's description disagrees with its encrypted header. Showing the header's values: {cameraName(h.cameraId)}, started {formatClock(h.startUnixMs, zone, true)}." ; tampered keeps "This recording failed verification at ~mm:ss" and adds `next: 'Export is turned off for this recording.'`; unknown-key: "Recorded with key {fingerprint}; add that key to play" (ui-spec §4.4) with `next` rendered as a link "Open Keys" to `#/key`. `IntegrityView` gains `next: string | null`.
  - `Player` props gain `cameraName: (id: string) => string` and `onBack?: () => void` (renders a "Back to live" button with the home icon when set). The Seal (`showLabel`) sits under the video with the clip time; banners use the seal colours with a full 1 px border (no side bars). Transport is one compact group of icon buttons under the video: previous, back 10 s, play/pause (label reflects state: "Play"/"Pause"), forward 10 s, next; `title` keeps the shortcut hint. Export sits apart at the far end of the row, separated by space (destructive isolation), label "Export".
  - `ExportDialog`: keeps the mandated sentence; after a save it shows "Saved." in a `role="status"` line for 4 s instead of closing silently; errors show "Could not save the file. Try again." (never `e.message`).

- [ ] **Step 1: Write the failing tests** — `mismatch text uses the display zone and camera name` (Review Focus 5); `tampered has the next line`; `unknown-key next links to Keys`; Player: `Back to live calls onBack`; `play button label follows the state`; `export is disabled for tampered`; ExportDialog: `shows Saved after a save`; `shows the fixed error text`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): player shows the seal, plain integrity messages and an isolated export`

### Task 10: Remember a key after import (worker)

**Files:**
- Modify: `web/src/worker/protocol.ts`, `web/src/worker/keystore.ts`, `keystore.test.ts`, `web/src/worker/worker.ts`, `worker.test.ts`
- Modify: design doc §11 `ui-spec.md` block

**Interfaces:**
- Produces: request `{ type: 'key.remember'; keyId: string }` → `KeyListResult`. `Keys.remember(keyId: string): Promise<void>` stores the in-memory non-extractable base `CryptoKey` in IndexedDB and marks the entry remembered; throws `Error` named `ErrNoKey` when the key is not in memory.
- Design doc §11 `ui-spec.md`: add `* §4.1: "Remember this device" is asked right after a successful import; the worker message key.remember {keyId} stores the in-memory base key.`

- [ ] **Step 1: Write the failing tests** — `remember stores the base key and list reports remembered`; `remember of an unknown key rejects with ErrNoKey`; `after remember and lock, the key reloads`; worker: `key.remember round-trips and returns the key list`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): remember a key after import`

### Task 11: Keys: first run, import, success, lock and forget

**Files:**
- Create: `web/src/routes/onboarding/KeyImport.svelte`, `KeyImport.test.ts`, `web/src/routes/onboarding/FirstRun.svelte`, `FirstRun.test.ts`
- Modify: `web/src/routes/onboarding/Onboarding.svelte` (becomes the Keys page), `Onboarding.test.ts`, `Scanner.svelte`, `Scanner.test.ts`
- Modify: `docs/family-onboarding.md` (steps match the new screens; plain STE style)

**Interfaces:**
- Consumes: Task 2 `Seal`, `rosette` (the key fingerprint rosette uses `seed = keyId`, state `verified`); Task 10 `key.remember`; `checkKeyInput`, `fingerprint`, `keyMismatch`; `createDecoder` from `lib/qr/scan`.
- Produces:
  - `<KeyImport client scanner? onImported?={(keyId: string) => void} />` — the form and its result:
    - Field labelled "Family key" (placeholder "zk1-…"), 16 px text, `aria-invalid` on typo, validation text linked by `aria-describedby` inside an `aria-live="polite"` region. Messages: typo → "typo in key. Copy it again or scan the QR code."; format → "Not a complete key yet."; valid → "Key looks right." A "Show"/"Hide" toggle masks the field (`type=password` when hidden; default shown).
    - On phones (`max-md`) "Scan QR code" is the primary button and "Add key" secondary; on desktop the reverse. A third action "Use a photo of the QR code" is a file input (`accept="image/*"`), decoded locally through `createImageBitmap` → canvas → `createDecoder()`; failure says "No QR code found in that photo."
    - A successful scan or photo decode imports immediately (no extra tap).
    - Success panel (`role="status"`, focus moves to its heading "Key added"): the key's rosette (64 px) with "Fingerprint 12ef-6ec4-d10c-dbc6" labelled; the recent-recordings check as one line ("Checking recent recordings…" / "Matches recent recordings." / mismatch alert with "This key doesn't match recent recordings", both fingerprints with their rosettes and a "Remove this key" button / rejected "The server did not accept this key." with "Remove this key"); then the remember choice: two buttons "Keep it on this phone" (calls `key.remember`) and "Only for now"; then a primary link "Open Home" (`#/`).
  - `<FirstRun client scanner? onImported />` — one screen for a device with no key: the wordmark, "Add the family key", one sentence "The key stays on this device. The server never sees it or your video.", then `KeyImport`.
  - Keys page (`Onboarding.svelte`): heading "Keys"; `KeyImport`; the keyring as rows with each key's rosette, fingerprint and "Kept on this phone"/"Only for now" text; "Forget" asks inline ("Forget this key on this device? You need the QR code or key text to add it again." with "Forget key" and "Cancel"), isolated at the row end; Lock section: button "Lock now" disabled with no key; result text — remembered key: "Locked. Opening a recording unlocks it again on this device."; session-only key: "Locked. Add the key again to watch."; after Forget: "Key removed from this device."; idle select labelled "Lock when zview is in the background".
  - `Scanner.svelte`: an instruction line "Point the camera at the QR code.", a square reticle over the video, a status line "Looking for a QR code…", and on camera denial "zview can't use the camera. Allow camera access in your browser settings, or use a photo of the QR code."

- [ ] **Step 1: Write the failing tests** — KeyImport: `typo sets aria-invalid and the message`; `validation text is linked by aria-describedby`; `a scanned code imports without another tap`; `a photo with no QR shows the message` (fake decoder); `success panel takes focus and shows the fingerprint`; `Keep it on this phone sends key.remember`; `mismatch offers Remove this key, which sends key.forget`. FirstRun: `states the privacy sentence and renders the form`. Keys page: `Lock now is disabled with no key`; `lock message for a remembered key`; `lock message for a session-only key`; `Forget asks first and Cancel keeps the key`; `after Forget shows Key removed`. Scanner: `shows the instruction and the denial message`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement**; update `docs/family-onboarding.md` to the new labels ("Family key", "Scan QR code", "Use a photo of the QR code", "Keep it on this phone").
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): first run, key import with fingerprint seal, honest lock and forget`

### Task 12: Home

**Files:**
- Create: `web/src/routes/home/Home.svelte`, `web/src/routes/home/Home.test.ts`

**Interfaces:**
- Consumes: Task 4 `DayNav`, `shiftDay`; Task 6 `LiveGrid`; Task 7 `EventList`; Task 8 `Timeline` (`laneHeight`, `integrity`); Task 9 `Player` (`onBack`, `cameraName`); `loadDay`, `localDayOf`, `toTimelineClip`, `loadZonePref`, `browserZone`.
- Produces: `<Home client status={Status | null} zone?={string} nowMs?={number} profile? factory? exportEnv? />`. Composition top to bottom (phone): `DayNav`; the live area (`LiveGrid`) or, after an event is selected, `Player` with `onBack` restoring the live area (the grid unmounts while the player shows, which frees the viewer slots); the 24 h strip (`Timeline` with all cameras, `laneHeight` 56 on phones); a heading "Today · N events" (or "{dayTitle} · N events" for other days) with "All verified" / "{k} not checked yet" summary from the integrity map; `EventList`. Desktop (`md:`): live or player plus the strip on the left, the list on the right (22rem), same order. Errors: no key → "Your key is locked." with link "Unlock" (`#/key`); cameras or recordings failure → "Could not load recordings." with a "Try again" button that reloads; no cameras → "No cameras are set up yet." Keyboard shortcuts (`commandFor`) work on Home as on Timeline.

- [ ] **Step 1: Write the failing tests** (use `test-support/dashboard-fakes.ts`) — `shows the live grid and today's events newest first`; `selecting an event shows the player and Back to live restores the grid`; `a day with no events shows the sentence` (Review Focus 1); `no cameras shows the sentence`; `a recordings failure shows Try again, which reloads`; `ErrNoKey shows the Unlock link` (Review Focus 4); `previous day loads that day's events`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): Home with live tiles above the day's events`

### Task 13: Timeline page

**Files:**
- Modify: `web/src/routes/+page.svelte`, `web/src/routes/page.test.ts`
- Create: `web/src/lib/components/FilterBar.svelte`, `FilterBar.test.ts`
- Delete: `web/src/lib/components/Header.svelte`, `StatusDot.svelte` and their tests (orphaned: status moves to the shell)

**Interfaces:**
- Consumes: Tasks 4, 7, 8, 9; `zoneChoices`, `saveZonePref`.
- Produces:
  - `<FilterBar cameras camera trigger forcedZone browserZone onCamera onTrigger onZone />` — three labelled selects always visible (no Menu): "Camera", "Trigger", "Time zone"; zone options show the city (`zoneCity`) with the IANA id as the value; on phones they scroll horizontally in one row.
  - Timeline page: props unchanged except `status` is removed (the shell owns it). Layout: `DayNav` + `FilterBar`; player (with `cameraName`); a timeline toolbar right above the canvas with zoom out / span readout (`spanLabel`, `aria-live="polite"`) / zoom in / Now; `Timeline` with `integrity` and `laneHeight` 56 on phones; under the canvas a one-line legend (the four trigger chips with their words, a hatch swatch with "not monitored", a tampered and a mismatch swatch); a "Keyboard shortcuts" disclosure button in the toolbar listing the ui-spec §4.7 map; the list beside (desktop) or below (phone, in page flow, no bottom sheet). Empty and error states as Home.

- [ ] **Step 1: Write the failing tests** — `filters are visible without a menu`; `the legend names every trigger and not monitored`; `the shortcuts disclosure lists Space, J, K, [, ] and T`; `zone select shows city names`; `span readout updates after zoom`; `no bottom sheet: the list is in page flow on phones`; `a failed load shows Try again`; update existing page tests for the removed Header.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement**; remove `Header.svelte`/`StatusDot.svelte` once nothing imports them.
- [ ] **Step 4: Run them to see them pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(web): Timeline page with always-visible filters and a zoom readout`

### Task 14: App shell, routing and end-to-end tests

**Files:**
- Modify: `web/src/App.svelte`, `web/src/App.test.ts`, `web/src/lib/pwa/UpdatePrompt.svelte`, `UpdatePrompt.test.ts`
- Delete: `web/src/routes/live/+page.svelte` and `page.test.ts` (Home replaces it)
- Modify: `web/e2e/dashboard.spec.ts`, `firstrun.spec.ts`, `live.spec.ts`, `timeline.spec.ts`, `web/e2e/page/dashboard-page.ts`

**Interfaces:**
- Consumes: Task 3 `StatusPill`, `recorderWords`; Task 11 `FirstRun`, Keys page; Task 12 `Home`; Task 13 Timeline page.
- Produces: `App` props `{ updater?, client?: WorkerClient-like with call }`. Routes: `''`, `#/`, `#/live` → Home; `#/timeline` → Timeline; `#/key` → Keys; `#/demo` unchanged (not in nav). The shell:
  - polls `/api/v1/status` every 60 s and passes `status` to Home;
  - calls `key.list` on mount and after `FirstRun.onImported`; with no keys, Home's slot renders `FirstRun` (Timeline and Keys stay reachable);
  - top bar: wordmark "zview" (the "z" in ink, "view" in `--z-line`), `StatusPill`, and on desktop the tab links; a "Lock" icon button whose result text appears in a `role="status"` line (same copy as the Keys page);
  - phones: a bottom tab bar (Home / Timeline / Keys) with icons and labels, 64 px tall, safe-area padding; `aria-current="page"` on the active tab.
  - `UpdatePrompt` restyled in the world; copy unchanged.
  - e2e: replace selectors that changed (`link 'Live'` → Home is default; `Master key` → `Family key`; `button 'Import key'` → `Add key`; `relay-dot` → `relay-status`; `button /^Events/` removed; Menu removed); add `phone: the bottom tab bar is visible and the list is in page flow`; keep the fullscreen and WHEP checks on Home.

- [ ] **Step 1: Write the failing tests** — App: `default route renders Home`; `#/live renders Home`; `no keys renders FirstRun on Home`; `importing on FirstRun shows Home`; `Lock shows the result text`; `the active tab has aria-current`; e2e spec edits for the new selectors.
- [ ] **Step 2: Run them to see them fail** — unit: `pnpm vitest run src/App.test.ts`; e2e: `pnpm e2e` (FAIL on the new selectors).
- [ ] **Step 3: Implement**; delete `routes/live/+page.svelte` and its test.
- [ ] **Step 4: Run everything** — `pnpm test && pnpm check && pnpm lint && pnpm build && pnpm e2e`, and `go test ./internal/zview/`. All pass.
- [ ] **Step 5: Commit** — `feat(web): app shell with Home, recorder status and phone tab bar`

## After Task 14 (orchestrator, not a worker task)

Per the impeccable new-work flow (§7): capture `desktop.png` and `mobile.png` with `impeccable first-viewport` against a fixture stack, drive every state, run `impeccable detect --json` on `web/src`, spawn the finish reviewer with the direction contract and the chosen sketch, apply its fixes, then spawn the documenter to write `DESIGN.md` and `.impeccable/design.json`.
