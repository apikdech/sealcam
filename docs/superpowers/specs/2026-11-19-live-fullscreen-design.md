# Live tile fullscreen — design (small change)

**Intent.** On the Live page, a viewer wants to watch one camera at full screen instead of
in the small grid tile. Asked for after the first real C220 live view (2026-11-19).

**Goals.**
- A "Fullscreen" button on every live tile, next to Mute (bottom right, same style). It shows
  in every tile state, not only `live`.
- Where the browser can make an element fullscreen (desktop, Android, iPad), the whole tile
  goes fullscreen, so the name, the state badge and Mute stay visible. The video scales to fit
  (`object-contain`, full height).
- On iPhone Safari, which can only make a `<video>` fullscreen, fall back to the video's own
  fullscreen player (`webkitEnterFullscreen`). Our overlays are not shown there.
- The button reads "Exit fullscreen" while the tile is fullscreen. Esc and system gestures exit
  too, and the label follows (`fullscreenchange` / `webkitfullscreenchange`).
- A double-click on the video toggles fullscreen.

**Non-goals.** No in-page "enlarged" mode, no fullscreen for the timeline player, no change to
the WHEP session (going fullscreen must not reconnect).

**Constraints.** TDD (tests first). No new dependencies. The CSP is unchanged.

**Approaches considered.**
1. *Tile fullscreen with an iPhone video fallback* — chosen: keeps the overlays where possible.
2. Video-only fullscreen everywhere — simplest, but loses the labels and Mute on desktop too.
3. In-page enlarged overlay — works everywhere, but is not real fullscreen.

**Left to the builder.** Where the fullscreen logic lives (`tile.ts` helper vs. the component),
the exact button text/aria, and the test seams for the Fullscreen API.
