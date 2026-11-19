# Live Tile Fullscreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Fullscreen button (and double-click) on every live tile that makes the whole tile fullscreen, or the video's native player on iPhone.

**Architecture:** A small DOM helper `web/src/lib/live/fullscreen.ts` picks the mode (element Fullscreen API on the tile, or `video.webkitEnterFullscreen` on iPhone), toggles it and reports changes. `LiveTile.svelte` renders the button, wires double-click and keeps its label in sync. The WHEP tile lifecycle in `tile.ts` is not touched.

**Tech Stack:** Svelte 5 (runes), TypeScript, Tailwind 4, Vitest + jsdom + @testing-library/svelte, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-live-fullscreen-design.md`

## Global Constraints

- TDD: a failing test exists before any implementation code (AGENTS.md).
- No new dependencies. The CSP is unchanged.
- Browser baseline (ui-spec §5): Safari macOS 17+ / iPadOS 17.1+, Chrome/Edge and Firefox current −2. All of these have the unprefixed Fullscreen API (`requestFullscreen`, `document.fullscreenElement`, `fullscreenchange`); iPhone Safari has none for elements (`document.fullscreenEnabled === false`) but has `HTMLVideoElement.webkitEnterFullscreen()` / `webkitExitFullscreen()` / `webkitDisplayingFullscreen` and the `webkitbeginfullscreen` / `webkitendfullscreen` events. Do not add `webkit`-prefixed element APIs.
- Going fullscreen must not reopen the WHEP session (no `tile.destroy()` / `start()` on toggle).
- Button copy: `Fullscreen` / `Exit fullscreen`. Same style as Mute: `rounded bg-black/60 px-3 py-1 text-xs`.

## Review Focus

1. Exiting with Esc or a system gesture (not the button): the label must return to `Fullscreen` — pinned in Task 1 (`fullscreenchange` with `fullscreenElement` null) and Task 2.
2. iPhone fallback exit via the native player's Done button: label returns — pinned in Task 1 (`webkitendfullscreen`).
3. A browser with neither API (old embedded webviews): the button is hidden, double-click does nothing, no exception — pinned in Task 1 (`mode === 'none'`) and Task 2.
4. `requestFullscreen()` rejects (no user gesture, policy): no unhandled rejection — pinned in Task 1.
5. Another element is fullscreen (e.g. a second tile): this tile's label stays `Fullscreen` — pinned in Task 1 (`isFullscreen` compares to its own element).

---

### Task 1: Fullscreen helper

**Files:**
- Create: `web/src/lib/live/fullscreen.ts`
- Test: `web/src/lib/live/fullscreen.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FullscreenMode = 'element' | 'video' | 'none';
  type FsDoc = Pick<Document, 'fullscreenEnabled' | 'fullscreenElement' | 'exitFullscreen' | 'addEventListener' | 'removeEventListener'>;
  export function fullscreenMode(video: HTMLVideoElement, doc?: FsDoc): FullscreenMode;
  export function isFullscreen(el: HTMLElement, video: HTMLVideoElement, doc?: FsDoc): boolean;
  export function toggleFullscreen(el: HTMLElement, video: HTMLVideoElement, doc?: FsDoc): void;
  /** Calls cb(isFullscreen(...)) on every change; returns an unsubscribe. */
  export function watchFullscreen(el: HTMLElement, video: HTMLVideoElement, cb: (on: boolean) => void, doc?: FsDoc): () => void;
  ```
  `doc` defaults to `document` (same seam style as `TileOptions.doc`).

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment jsdom`, a `FakeDoc extends EventTarget` with settable `fullscreenEnabled`, `fullscreenElement`, `exitFullscreen = vi.fn(async () => {})`, and a video with optional `webkitEnterFullscreen`/`webkitExitFullscreen` mocks and `webkitDisplayingFullscreen`):
  - `fullscreenMode`: `fullscreenEnabled: true` → `'element'`; `false` and video has `webkitEnterFullscreen` → `'video'`; neither → `'none'`.
  - `toggleFullscreen` in element mode calls `el.requestFullscreen()` when not fullscreen, and `doc.exitFullscreen()` when `doc.fullscreenElement === el`.
  - `toggleFullscreen` when `doc.fullscreenElement` is a *different* element calls `el.requestFullscreen()` (not exit).
  - `toggleFullscreen` when `requestFullscreen` returns a rejected promise: `await flush()`; no unhandled rejection (Vitest fails the run on one).
  - `toggleFullscreen` in video mode calls `video.webkitEnterFullscreen()`, and `webkitExitFullscreen()` when `webkitDisplayingFullscreen` is true.
  - `toggleFullscreen` in `'none'` mode does not throw.
  - `watchFullscreen`: dispatching `fullscreenchange` on doc with `fullscreenElement = el` calls `cb(true)`, then with `null` calls `cb(false)`; with another element calls `cb(false)`; `webkitbeginfullscreen` / `webkitendfullscreen` on the video call `cb(true)` / `cb(false)`; after unsubscribe, no further calls.

- [ ] **Step 2: Run to verify they fail**

  Run: `cd web && pnpm vitest run src/lib/live/fullscreen.test.ts`
  Expected: FAIL (module `./fullscreen` not found).

- [ ] **Step 3: Implement `web/src/lib/live/fullscreen.ts`**

  Element mode wins when `doc.fullscreenEnabled`. Swallow `requestFullscreen`/`exitFullscreen` rejections with `.catch(() => {})`. `isFullscreen` is `doc.fullscreenElement === el || video.webkitDisplayingFullscreen === true`. Declare the WebKit video members locally (an intersection type), not in a global `.d.ts`.

- [ ] **Step 4: Run to verify they pass**

  Run: `cd web && pnpm vitest run src/lib/live/fullscreen.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add web/src/lib/live/fullscreen.ts web/src/lib/live/fullscreen.test.ts
  git commit -m "feat(web): fullscreen helper for live tiles"
  ```

### Task 2: Fullscreen button and double-click on LiveTile

**Files:**
- Modify: `web/src/lib/live/LiveTile.svelte`
- Test: `web/src/lib/live/LiveTile.test.ts` (new, jsdom + @testing-library/svelte, following `src/lib/components/components.test.ts`)
- Modify: `web/e2e/live.spec.ts` (extend the Chromium test)

**Interfaces:**
- Consumes: `fullscreenMode`, `toggleFullscreen`, `watchFullscreen` from Task 1. `LiveTile` props are unchanged (`cameraId`, `name?`, `client`).

- [ ] **Step 1: Write the failing component tests** (render `LiveTile` with a `FakeClient` from `test-support/live-fakes`, stub `RTCPeerConnection`/`MediaStream` as in `tile.test.ts`; stub `document.fullscreenEnabled` and `HTMLElement.prototype.requestFullscreen`):
  - `fullscreenEnabled: true` → a button named `Fullscreen` is present while the tile state is `connecting` (before any peer connects).
  - Clicking it calls `requestFullscreen` on the element with `data-testid="live-tile"`.
  - Setting `document.fullscreenElement` to the tile and dispatching `fullscreenchange` → the button is named `Exit fullscreen` and has `aria-pressed="true"`; setting it back to `null` and dispatching again → `Fullscreen` (Esc path).
  - `dblclick` on the `<video>` calls `requestFullscreen` on the tile.
  - `fullscreenEnabled: false` and no `webkitEnterFullscreen` on the video → no `Fullscreen` button; `dblclick` on the video does not throw.
  - Toggling fullscreen creates no second `FakePeer` (`FakePeer.instances.length` unchanged): the session is not reopened.

- [ ] **Step 2: Run to verify they fail**

  Run: `cd web && pnpm vitest run src/lib/live/LiveTile.test.ts`
  Expected: FAIL (no button named `Fullscreen`).

- [ ] **Step 3: Implement in `LiveTile.svelte`**

  Bind the root `div` (`bind:this={root}`). In `onMount`, compute the mode once, subscribe with `watchFullscreen` into `let fullscreen = $state(false)` and unsubscribe on teardown. Put Mute and Fullscreen in one `absolute bottom-2 right-2 flex gap-2` container (Mute keeps its `{#if snap.canUnmute}`); Fullscreen renders when mode `!== 'none'`, with `aria-pressed={fullscreen}`. `ondblclick` on the video calls `toggleFullscreen`. While the tile is fullscreen the video fills the screen height: add `[&:fullscreen_video]:h-full [&:fullscreen_video]:aspect-auto` (or equivalent) to the root, keeping `object-contain`.

- [ ] **Step 4: Run to verify they pass**

  Run: `cd web && pnpm vitest run src/lib/live/`
  Expected: PASS (including the existing `tile.test.ts` and `whep.test.ts`).

- [ ] **Step 5: Extend the e2e test** in `web/e2e/live.spec.ts`, after the existing `videoWidth` assertion in the Chromium test:
  ```ts
  await tile.getByRole('button', { name: 'Fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid'))).toBe('live-tile');
  await tile.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(tile).toHaveAttribute('data-state', 'live');
  ```

- [ ] **Step 6: Run the full web gate**

  Run: `make web && make web-e2e`
  Expected: lint, check and all unit tests pass; Playwright passes (the live test on Chromium).

- [ ] **Step 7: Manual check (add to `docs/LIVE-CHECKS.md` as a new section, Status: not run)**

  With the real C220 (`.e2e/` setup): desktop Chrome and Safari — button, double-click, Esc, labels and badges visible in fullscreen; iPhone — the native player opens and Done returns to the grid with the label back to `Fullscreen`; iPad — whole-tile fullscreen.

- [ ] **Step 8: Commit**

  ```bash
  git add web/src/lib/live/LiveTile.svelte web/src/lib/live/LiveTile.test.ts web/e2e/live.spec.ts docs/LIVE-CHECKS.md
  git commit -m "feat(web): fullscreen button and double-click on live tiles"
  ```
