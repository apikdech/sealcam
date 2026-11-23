# zview Watch screen polish

**Date:** 2026-11-23 · **Status:** approved by the user · **Builds on:** `2026-11-23-zview-watch-screen-design.md`

The user tried the Watch screen on the real camera and asked for five changes.

## 1. Day title format and vertical centring

- The day title reads "Monday, 23 November" (desktop) and "Mon, 23 Nov" (phone): day name, comma, date. A year is added only when the day is not in the current year (as today).
- On desktop the subtitle ("Jakarta time · today") sits on its own small line under the title, not on the same baseline.
- The title block, the ‹ › arrows and the rest of the top bar are vertically centred in the bar. (Today the title sits near the top of the bar on desktop because the button uses `md:items-baseline`.)

## 2. Endless event list

- The event list loads the next page (50) automatically when the user scrolls within about 200 px of its end. No "Show 50 more" button.
- A small muted line "Showing N of M" stays at the end while more remain.
- Implementation: an `IntersectionObserver` on a sentinel after the last row, with the list's own scroller as root. If `IntersectionObserver` is missing, keep the button as a fallback.
- Keyboard: moving focus to the last loaded row scrolls it into view and so loads more.

## 3. Duration shows 0:00 while a clip streams

**Cause:** playback is streamed (MSE). The browser's `video.duration` is unknown (NaN or Infinity) until the last chunk is appended and `endOfStream()` runs. On a slower connection the clip plays before that, so the bar shows "0:02 / 0:00" and the position slider is disabled.

**Fix:** the Player uses the clip's recorded length from its sidecar (`duration_ms`, the value the event list shows) as the duration whenever `video.duration` is not a finite positive number. Watch passes it in (an optional `durationOf?: (clipId: string) => number | null` prop, milliseconds, like `triggersOf`). When the sidecar has no length (an incomplete clip), keep today's behaviour. Once the browser knows the real duration, the browser's value wins.

## 4. Playback speed

- A speed button in the recording control bar shows the current speed ("1×") and opens a small menu: 0.25×, 0.5×, 1×, 1.5×, 2×, 4×. The current choice is marked.
- On phones (compact bar) the speed choice lives in the "⋯" (More) menu.
- The choice applies to `video.playbackRate`, stays when the player moves to the next clip (auto-advance or J/K), and resets to 1× on page reload. It is not stored.
- Accessible name "Playback speed"; menu items are buttons with `aria-pressed` (or `menuitemradio` with `aria-checked`).
- Live view has no speed control.

## 5. Shorter clips (configuration only)

`deploy/zrelay.yaml` (not in git): `pre_roll_seconds: 6`, `post_roll_seconds: 6` (was 15 and 10). The pre-roll starts at the newest keyframe at or before `now − 6 s`, so the real lead-in is 6 s plus up to one GOP (≤ 4 s). Takes effect on the next zrelay restart; existing clips do not change.

## Constraints

Strict TDD; tokens only; 44 px phone targets; no new colours; mandated copy unchanged; vitest, Playwright, check and lint green.
