# zview: one Watch screen, theme switch, quiet status

**Date:** 2026-11-23 · **Status:** approved by the user (mockup review) · **Amends:** v2 design §7.2, ui-spec §4.7

Mockup the user approved: `.superpowers/brainstorm/47034-1795408204/content/watch-v1.html` (layout A, the theme icon and the status dot).

## 1. Why

The user tried the Intaglio Seal build (merged 2026-11-23, `1ed2aec`) and found the layout bad:

- Home and Timeline are two screens that show almost the same thing. There is no reason to choose between them.
- The placement wastes the screen. On a wide desktop the video is capped at about 60 % width, the event list floats at the far right, and a large empty area sits under the timeline.
- The live player on Home looks like it has no controls and no timestamp. (It has small sound and fullscreen buttons and an "as of" clock over the video, but no play/pause, no scrubber and no clear time.)
- On Timeline the page scrolls. When the user scrolls the list or the timeline, the video moves out of view. The video is not the focus.

Goal in the user's words: "clean UI and nice UI UX".

## 2. Goals

1. One screen (the **Watch** screen) replaces Home and Timeline. Live is the "now" end of the same day, not a separate place.
2. The video is always visible. On desktop and on phones, the window does not scroll. Only the event list scrolls.
3. The player has full controls and a wall-clock timestamp, in live mode and recording mode.
4. A theme switch: System, Light, Dark. An icon only.
5. The recorder status in the top bar is a coloured dot when all is well, and a dot plus a short word when it is not.

## 3. Non-goals

- No new visual language. The Intaglio Seal system (DESIGN.md) stays: tokens, seals, glyphs, the one face, 1 px rules, no shadows or cards. This is a layout and interaction change.
- No server or API changes. No change to playback, crypto, worker, export rules, live (WHEP) behaviour or the timeline canvas renderer, except where the layout needs a new size or a new prop.
- No synchronized multi-camera playback (still a v2 non-goal).
- No per-household theme setting stored on the server.

## 4. Anti-goals (a failure even if it works)

- The page scrolls on desktop, or the video can scroll out of view on a phone.
- A problem state (recorder quiet, camera offline) is shown by colour alone, or needs a hover to be noticed.
- Mandated copy (ui-spec §4.4, §4.8, §4.9) is reworded or dropped.
- The light theme breaks contrast on trigger chips, seals or the timeline.
- Any keyboard shortcut in ui-spec §4.7 stops working.

## 5. Constraints

- Specs in `docs/specs/` as amended by the v2 design §11 still hold. This document adds amendments (§10 below), which go into v2 design §11.
- Strict TDD (AGENTS.md). Existing component and e2e tests are updated or replaced, never deleted without a replacement that covers the same behaviour.
- CSP stays as is. No `{@html}` with data.
- 60 fps timeline pan and zoom target is unchanged.
- One live WHEP viewer slot per tile while the Watch screen is visible and in live mode (v2 design §7.2 rules on `visibilitychange` still apply).

## 6. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **Merge into one screen, reusing existing parts** (Player, EventList, Timeline canvas, LiveGrid / LiveTile, DayNav, StatusPill) | Most code and tests survive. The route files `routes/+page.svelte` and `routes/home/Home.svelte` collapse into one. | **Chosen.** |
| Keep Home and Timeline, restyle both | Does not answer "why two screens"; scroll and placement problems would need fixing twice. | Rejected. |
| Rewrite the screen from scratch | Throws away tested playback, shortcut and live code. | Rejected. |

Layouts compared in the mockup: **A** (event list always beside the video) and **B** (video full width, list in a drawer). The user chose **A**.

## 7. The Watch screen

### 7.1 Routes and navigation

- `#/` is the Watch screen. `#/timeline` and `#/live` are aliases of `#/` (old bookmarks and the installed PWA keep working).
- `#/key` (Keys) stays as its own view. It is opened from the key icon in the top bar, not from a tab.
- The bottom tab bar (phone) and the Home / Timeline / Keys tabs (desktop) are removed.
- `#/demo` is unchanged.
- With no key, `#/` shows first run, as today.

### 7.2 Top bar (one row, 52 px)

Left to right:

1. **zview** wordmark.
2. **Day navigator:** `‹` previous day, the day title ("Monday 23 November") with "today · Jakarta time" beside it, `›` next day (disabled on today). Tapping the day title opens a small menu with the date picker and the **time zone** choice (today a select on Timeline: "My time (…)" or the forced zone). Behaviour of the zone preference does not change.
3. **Camera filter** (a select, "All cameras" or one camera). Shown only when there is more than one camera. *Builder's call:* hiding it with one camera follows "chrome stays out of the way".
4. Space.
5. **Recorder status** (§8).
6. **Theme** icon button (§9).
7. **Key** icon button: opens a small menu with **Lock now** (the one-tap lock that is in the top bar today) and **Manage keys** (opens `#/key`). Chosen by the user over a separate lock button.

Phone: the same row, compressed. The wordmark, `‹`, a short day title ("Mon 23 Nov"), `›`, the status dot, the theme icon, the key icon. The camera filter moves into the day-title menu on phones.

### 7.3 Desktop layout (layout A)

The app fills the window (`100dvh`) and never scrolls.

```
┌ top bar ─────────────────────────────────────────────────────────────┐
├──────────────────────────────────────────────┬───────────────────────┤
│ video stage (takes all remaining height,     │ list header           │
│ letterboxed, LIVE / RECORDING badge top-left)│ Today · 115 events    │
│                                              │ [All][P][V][A][M]     │
├──────────────────────────────────────────────┤───────────────────────│
│ control bar                                  │ rows (own scroll)     │
├──────────────────────────────────────────────┤                       │
│ timeline: zoom · legend · ruler · lanes      │                       │
└──────────────────────────────────────────────┴───────────────────────┘
```

- Grid: columns `minmax(0, 1fr) 380px`; rows `minmax(0, 1fr) auto auto`. The list spans all three rows.
- Below about 900 px wide, use the phone layout (§7.4). *Builder's call:* exact breakpoint.

### 7.4 Phone layout

Single column, the window does not scroll:

1. Top bar.
2. Video stage, 16:9, full width, pinned.
3. Control bar (compact: fewer buttons, §7.6).
4. Timeline (one lane per camera, lane height 48 px for touch).
5. List header with the trigger chips.
6. Event rows: the only scrolling area, filling the rest of the height.

This replaces ui-spec §4.7's "event list is a bottom sheet" and "header collapses into a menu" (§10).

**Short screens** *(builder check, my call)*: the event list keeps a minimum height of three rows. When the stack would push it below that, the video shrinks first (its height is capped so the list keeps three rows), then the lanes shrink to 32 px. When the window is wider than it is tall and at least 640 px wide (a phone in landscape, a short laptop window), use the desktop layout (§7.3) with a 300 px list instead of the phone stack. The "never scrolls" checks run at 1440×900, 1280×720, 390×844 and 844×390.

### 7.4a Notices

The one-line notices that exist today (the lock notice, "Could not lock", the update prompt "New version available — reload", "N recordings could not be read") appear in one slot directly under the top bar, full width, one line each, and take their height from the stage (the stage shrinks; the page still does not scroll). Their copy and behaviour do not change.

### 7.5 Video stage

- One stage for both modes. The video is `object-fit: contain` on a dark stage in both themes (the stage is always dark; it is a screen, not paper).
- A badge at top-left over the video:
  - Live: the existing "Live" badge (text "Live"; upper-case only through styling, if at all), only once video plays, as today; camera name; "as of 11:23:24" style wall time.
  - Recording: a "Recording" badge, camera name, the clip's wall-clock time, trigger glyph chips.
- **Several cameras, live mode, "All cameras":** the stage shows the existing live grid (1 fills, 2 side by side, 3–4 as 2×2). Each tile keeps its own over-video buttons (sound, fullscreen, "Try now") and its double-click fullscreen, as today. A single tap on the tile's video area (not on its buttons) sets the camera filter to that camera. With one camera selected (or only one camera), the stage shows that one tile.
- **Recording mode:** the stage shows the one clip being played, as today.
- Live tile states (connecting, reconnecting with "Try now", viewer limit, key locked, camera offline) keep their current behaviour and copy.

### 7.6 Control bar

One bar directly under the stage, always visible (not an overlay that hides).

**The Live button lives on the video, not in the bar.** In recording mode, a "● Live" pill sits at the top-right corner of the stage (the top-left has the Recording badge). Tapping it returns to live mode; it replaces "Back to live". In live mode the pill is not shown (the top-left badge already says Live). Same place on desktop and phones. *(User feedback on the phone mockup: a Live button in the control bar wrapped to its own line and looked out of place.)*

**Recording mode (desktop),** left to right: previous event (J), back 10 s (←), play/pause (Space), forward 10 s (→), next event (K), **clock** (wall time of the current frame in large tabular figures, e.g. `11:19:24`, followed by the small clip position `0:12 / 0:28`), scrubber (the existing position slider), **Autoplay next** toggle, the seal with the integrity text (mandated copy, e.g. "Encrypted recording verified"), Export, sound, fullscreen.

**Recording mode (phone),** one row that fits 390 px without wrapping: previous, play/pause, next, clock (wall time over the small clip position, two lines), scrubber, sound, **fullscreen**. Fullscreen is available in both modes on phones (the user could not find it in recording mode). The integrity text sits on one line under the bar (it is mandated copy and must stay visible). Back/forward 10 s, Export and Autoplay next move into a `⋯` menu or the integrity line. *Builder's call:* the exact overflow placement, as long as the row does not wrap.

**Phone list header:** the trigger chips stay on one line and scroll sideways if they do not fit (they must not wrap to two lines).

**Live mode:** no live pause (it does not exist today and was not asked for). The bar shows a muted line "Live now" (with "All cameras" and several tiles: "Live now · tap a camera to see it alone"), and, when exactly one tile is on the stage, that tile's sound (tap-to-unmute rules unchanged) and fullscreen controls move from over the video into the bar. With several tiles, the bar has no sound or fullscreen buttons; each tile keeps its own. No scrubber. *(Builder check, my call.)*

Every control keeps its existing accessible name and shortcut title.

### 7.7 Timeline area

- A thin row above the ruler: zoom out, the span readout ("24 h"), zoom in, **Now** (T; also switches to live mode when the day is today), the legend (trigger chips with names, "not monitored", failed verification, metadata mismatch) and a `?` button that opens the keyboard shortcut list (replaces the "Keyboard shortcuts" button).
- On phones the legend moves behind `?` with the shortcuts.
- The canvas timeline itself is unchanged: lanes per camera, hatched gaps, the foil now line, the playhead, zoom and pan.
- Clicking the timeline plays the recording at that time (as Timeline does today). Clicking at or after the now line goes live.

### 7.8 Event list

- Header: "Today · 115 events" (or the day name) and "N not checked yet".
- **Trigger chips** under the header: All, P Person, V Vehicle, A Pet, M Motion (and • Other when such clips exist). They replace the trigger select. Multi-select. "All" clears the selection. They filter the list and the timeline, like the select does today.
- Rows as today (time in serial figures, glyph chips, camera, length, seal), 56 px high on desktop, 64 px on phones. The selected row keeps the foil outline and gets a small "playing" mark.
- "Show more" paging stays.

### 7.9 Modes and state

- On open (today), the screen is in **live mode**.
- Selecting an event, a timeline position or a shortcut (J/K) enters **recording mode**.
- The **Live** button, **Now** on today, or clicking past the now line returns to live mode. Live sessions open again; recording playback stops.
- On a past day there is no live mode: the stage starts empty with a prompt ("Pick an event or a time on the timeline") and the Live button jumps to today. *Builder's call:* the exact empty-state copy, in the plain style of PRODUCT.md.
- WHEP sessions are open only in live mode and while the page is visible.

## 8. Recorder status

The four levels and their rules stay exactly as `lib/relayStatus.ts` computes them today (ui-spec §4.7). Only the presentation changes. *(Builder check: the mockup showed "recorder quiet" as amber; the spec and code make a stale status red, and that stays.)*

- **ok:** a 10 px dot in the line (teal) ink with a soft ring. No text. Accessible name and tooltip: the existing OK text.
- **warn** (a camera degraded, events not up, the storage breaker not closed): amber dot plus a short word taken from the existing summary, shortened for the bar (e.g. "Camera degraded", "Storage delayed").
- **bad** (status older than 3 minutes, or a camera `down`): VOID red dot plus a short word, e.g. "Recorder quiet 4 min" or "Camera offline".
- **unknown** (status cannot be read): muted grey dot plus "Status unavailable".
- Tapping the dot opens the existing status details (StatusPill's panel, full lines and `since`), on desktop and phones.
- *Builder's call:* the exact short words, as long as each is two or three plain words and the full text stays in the details.
- Teal, not green, for OK: green is the Vehicle trigger colour, and the Fixed Inks Rule gives teal the "genuine / OK" meaning.

## 9. Theme switch

- Three choices: **System** (follow `prefers-color-scheme`, the current behaviour and the default), **Light**, **Dark**.
- One icon button that cycles System → Light → Dark. Icons: a screen (System), a sun (Light), a moon (Dark). No text label. Accessible name and tooltip: "Theme: Dark" etc.
- The choice is stored per browser in `localStorage` (a display preference, not data; the service worker and the zero-disk rule are not affected). A missing or unreadable value means System.
- The choice applies before first paint to avoid a flash (a small inline script or a class on `<html>` set from the stored value; it must pass the strict CSP, so no inline script unless the CSP allows its hash. *Builder's call:* how, within the CSP).
- Implementation shape: the light tokens currently under `@media (prefers-color-scheme: light)` in `app.css` also apply under `:root[data-theme="light"]`, and `:root[data-theme="dark"]` forces the dark set. The timeline canvas (which reads tokens at draw time and watches the media query today) must also redraw when the theme changes.
- `color-scheme` and the PWA `theme-color` meta follow the active theme.

## 10. Spec amendments (to add to v2 design §11)

1. **v2 design §7.2 Navigation:** replace the three top-level views with: one **Watch** view at `#/` (live and recordings, ui-spec §4.6 timeline and §4.7 player, event list and transport), plus **Keys** at `#/key` opened from the top bar. `#/timeline` and `#/live` are aliases of `#/`. The "Back to live" control becomes the **Live** button.
2. **ui-spec §4.7 Layout, Mobile:** the player, its control bar and the timeline are pinned at the top; the event list fills the rest of the screen and is the only part that scrolls (no bottom sheet); the header stays one row (no menu collapse), with the camera filter and time zone in the day menu.
3. **ui-spec §4.7 Layout, Desktop:** the trigger filter is a row of chips above the event list; the time zone choice is in the day menu.
4. **ui-spec §4.7 Relay status:** the dot carries text when it is not OK; a theme switch (System / Light / Dark, per browser) is added to the header.

## 11. Testing

- Component tests (Vitest + Testing Library) for: the merged screen's modes (live → recording → live), the Live button, past-day empty state, trigger chips filtering, the status dot's three states and accessible names, the theme button cycling and persisting (and falling back to System when storage throws).
- Existing tests for Home and Timeline (`routes/home/Home.test.ts`, `routes/page.test.ts`, `App.test.ts`) are merged into the Watch screen's tests; every behaviour they cover today keeps a test.
- e2e (Playwright): update `dashboard`, `timeline`, `live` and `playback` specs and their page objects to the new structure; add a check that the document does not scroll at 1440×900 and 390×844 (`scrollHeight <= innerHeight`), and that the video stays in view after scrolling the list on a phone.
- Light theme: a new contrast test of the light tokens (ink, muted, line, foil, amber, void on ground and plate; trigger colours against the light plate for the timeline bars). The existing `triggerContrast.test.ts` only covers glyph-on-chip contrast. Plus a visual pass in both themes at the end.

## 12. Left to the builder

- Component boundaries inside the merged screen (for example a new `WatchScreen.svelte` plus `ControlBar.svelte`, or extending `Player.svelte`).
- The exact breakpoint between phone and desktop layouts.
- The phone overflow (`⋯`) set, within §7.6.
- How the theme is applied before first paint within the CSP.
- Updating DESIGN.md (tab bar and Home sections) and the family onboarding doc to match the new screen once it ships.
