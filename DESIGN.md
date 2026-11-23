---
name: zview
description: Private viewer for zrelay recordings and live cameras, set like a stamped security document.
colors:
  ground: "#0e1a1f"
  plate: "#132429"
  rule: "#22393f"
  line: "#5fa8a0"
  ink: "#e6e2d6"
  muted: "#93a6a4"
  foil: "#c9a44c"
  amber: "#d9a441"
  void: "#d2554a"
  ground-light: "#ede9df"
  plate-light: "#e3ded1"
  rule-light: "#c9c2b1"
  line-light: "#2f6f73"
  ink-light: "#1b2a2e"
  muted-light: "#56656a"
  foil-light: "#8a6a1f"
  amber-light: "#9a6a12"
  void-light: "#a8322a"
  trigger-person: "#f97316"
  trigger-vehicle: "#22c55e"
  trigger-pet: "#a855f7"
  trigger-motion: "#3b82f6"
  trigger-other: "#9ca3af"
  on-trigger: "#071014"
typography:
  headline:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
  title:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  serial:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
    fontFeature: "tnum"
  day:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  body-field:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.333
  canvas:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
rounded:
  sm: "4px"
  frame: "8px"
  control: "10px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "16px"
  target: "44px"
  row: "64px"
components:
  button-primary:
    backgroundColor: "{colors.line}"
    textColor: "{colors.ground}"
    typography: "{typography.body-field}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "{spacing.target}"
  button-ghost:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "{spacing.target}"
  button-ghost-hover:
    backgroundColor: "{colors.plate}"
  button-icon:
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    size: "{spacing.target}"
  day-arrow:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "{spacing.target}"
  field:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.body-field}"
    rounded: "{rounded.sm}"
    padding: "12px"
  filter-select:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "{spacing.target}"
  trigger-chip:
    backgroundColor: "{colors.trigger-person}"
    textColor: "{colors.on-trigger}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 4px"
    width: "20px"
  live-badge:
    backgroundColor: "{colors.line}"
    textColor: "{colors.ground}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  event-row:
    textColor: "{colors.ink}"
    padding: "0 16px"
    height: "{spacing.row}"
  event-row-selected:
    backgroundColor: "{colors.plate}"
  over-video-button:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "{spacing.target}"
  control-bar:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "{spacing.target}"
  status-dot:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.full}"
  theme-button:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "{spacing.target}"
  key-menu:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
  live-pill:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
---

# Design System: zview

## Overview

**Creative North Star: "The Intaglio Seal"**

zview treats every recording like a stamped document from a security printer: banknotes, the Indonesian meterai. The ground is a deep intaglio blue-green in the dark theme and an off-white security paper in the light one; everything on it is drawn in fine 1 px rules and a few printing inks. Each clip carries its own guilloché seal, generated from the clip's id and drawn from its verification state, wherever the clip appears: event row, player, timeline bar, and the key screen, where the key's fingerprint is the same rosette.

The system is quiet so the footage and the timeline can own the space. Chrome is one top bar and a control bar under the video, separated by rules, never boxed into cards or lifted with shadows. Density is moderate and phone-first: 44 px targets, 64 px event rows, one face at a few sizes, and tabular "serial" figures for every time so a column of clock readings reads like a register.

The world rejects the category default (a black NVR grid with a red REC dot and a dashboard of cards) and the generic Tailwind look it replaced.

**Key Characteristics:**
- Dark intaglio ground by default; light security paper follows `prefers-color-scheme` until the theme button sets Light or Dark by hand.
- Four inks with fixed meanings: teal line (verified, selection, primary action), gold foil (focus, today, now), amber (degraded), VOID red (tampered).
- One face, Atkinson Hyperlegible Next; tabular figures for every time and duration.
- Flat: 1 px rules and tonal plates, no shadows, no cards.
- The per-clip guilloché seal is the signature; it never claims more than was checked.

## Colors

A low-chroma intaglio palette of ground, plate and rule, printed in four inks, with the spec's five trigger colours kept apart as a separate, fixed set.

All UI colours are custom properties on `:root` (`--z-ground` … `--z-void`, `--z-on-trigger`), exposed to Tailwind as `bg-ground`, `text-ink`, `border-rule` and so on. The dark values are the default; the `-light` tokens replace them under `@media (prefers-color-scheme: light)`, and under `:root[data-theme="light"]`; `:root[data-theme="dark"]` forces the dark set. The theme button stores its choice (System, Light, Dark) per browser. The canvas timeline reads the same custom properties at draw time and keeps a hard-coded copy of both palettes as a fallback.

### Primary
- **Ink-Teal Line** (`line` / `line-light`): the "verified" ink. Verified seals, timeline clip bars, the wordmark's "view", the Live badge, the primary button fill, `accent-color` and selection tint (35% mix). It means genuine or chosen, never decoration.

### Secondary
- **Gold Foil** (`foil` / `foil-light`): focus and the present. The 2 px focus ring on every control, the caret, the outline and "playing" mark of the selected event row, and the timeline's now line. Used sparingly, like foil on a note.

### Tertiary
- **Warm Amber** (`amber` / `amber-light`): degraded but not broken. Incomplete and mismatch seals, "could not be read" notices, warning status dot.
- **VOID Red** (`void` / `void-light`): tampered and failure. Tampered seals (VOID text), tampered timeline spans (hatched), error alerts, the bad status dot.

### Neutral
- **Intaglio Ground** (`ground` / `ground-light` security paper): the page background and the text colour on line-filled buttons and badges.
- **Plate** (`plate` / `plate-light`): one tonal step up. Field fills, timeline lanes, the control bar, the selected or hovered row, notices and the status details panel.
- **Rule** (`rule` / `rule-light`): every 1 px divider and control border, the timeline grid, scrollbar thumbs.
- **Ink** (`ink` / `ink-light`): primary text.
- **Muted Ink** (`muted` / `muted-light`): secondary text, the unchecked seal, the not-monitored hatch.

### Trigger colours (fixed by ui-spec §4.6)
`trigger-person` P, `trigger-vehicle` V, `trigger-pet` A, `trigger-motion` M, `trigger-other` •. Identical in both themes. Known limit: on the light plate all five are below 3:1 (recorded as known failures in `web/src/lib/theme/contrast.test.ts`), because the Spec Colours Rule forbids retinting them; the glyph on each chip keeps the meaning. The glyph is always printed on the colour in `on-trigger`, which holds at least 4.5:1 on all five (enforced by `triggerContrast.test.ts`).

### Named Rules
**The Fixed Inks Rule.** Each ink has one meaning: line is verified or chosen, foil is focus or now, amber is degraded, void is tampered. Never reuse an ink for decoration or brand emphasis.

**The Spec Colours Rule.** The five trigger colours, their glyphs and `on-trigger` are spec-fixed. Do not retint them per theme, and never show a trigger colour without its glyph.

**The Dark Over Video Rule.** Anything drawn over video (scrims, captions, buttons, the Live badge, reconnect panels) uses the dark values in both themes, set through the over-video variables (`--z-ov-ground`, `--z-ov-ink`, `--z-ov-muted`, `--z-ov-line`, `--z-ov-rule` from `lib/overVideo.ts`). Light paper on top of footage is never correct.

## Typography

**Body Font:** Atkinson Hyperlegible Next (self-hosted variable woff2, latin subset, weights 400–700, `font-display: swap`; fallback `ui-sans-serif, system-ui, sans-serif`)

**Character:** One legibility-first face carries everything, from the wordmark to the 11 px canvas labels. Hierarchy comes from size and a single step of weight (400 to 600), not from a second family.

### Hierarchy
- **Headline** (600, 24px, 1.333): the one `h1` on pages that show it (Keys, first run). The Watch screen's `h1` is screen-reader only.
- **Title** (600, 20px, 1.4): section heads ("Lock", "Key added") and the wordmark (with slight positive tracking).
- **Serial** (600, 20px, tabular, +0.02em): the start time in each event row; the largest figure on the Watch screen, with the clock in the control bar.
- **Day** (600, 17px): the day title in the day row ("Saturday 7 November").
- **Body field** (400, 16px, 1.5): inputs and selects that take typing on phones, and primary button text, so iOS never zooms.
- **Body** (400, 14px, 1.43): most UI text: list meta, status, notices, buttons, list headings (600).
- **Label** (400, 12px): field labels, the day subtitle ("Jakarta time · today"), trigger glyphs (700) and the Live badge (600, wider tracking).
- **Canvas** (400 and bold, 11px): timeline ruler, lane names and in-span glyphs.

### Named Rules
**The Serial Figures Rule.** Every time, duration, count and fingerprint uses tabular figures with +0.02em tracking (the `.num` class). A column of times must align digit for digit.

**The One Face Rule.** Atkinson Hyperlegible Next is the only face. Do not add a display face, a serif or a system mono for flavour.

## Layout

Phone first. The Watch screen fills the window and never scrolls. The page gutter is 16px; the top bar is one row: the wordmark, then the day navigator (arrows either side of the day title and its zone subtitle), the camera select (only with more than one camera), then the recorder status dot, the theme button and the key menu. There is no tab bar and no tab row; Keys opens from the key menu.

On phones the video (16:9), its control bar and the 24 h timeline are pinned at the top. The trigger chips and the event list fill the rest, and only the list scrolls. From about 900px wide it becomes two columns: video, control bar and timeline in a flexible column, the day's list in a fixed 380px column. The video is letterboxed in the space that is left, so a clip never pushes the controls below the fold. Form pages (Keys, first run) sit in a centred 36rem column.

Rhythm is the 4px Tailwind step: 8px and 12px gaps inside rows, 14px above the timeline and list heading, 64px event rows. Every interactive target is at least 44px on phones; some desktop controls tighten to 36–40px.

## Elevation & Depth

Flat. The system has no shadows. Depth is one tonal step (ground to plate) plus 1 px rules: plates mark fields, lanes, the control bar, the selected row and notices; rules separate bars, rows and lists. The only gradients are the scrims at the foot of video, a transparent-to-85% over-video ground, which exist to keep captions legible over footage.

### Named Rules
**The Printed Sheet Rule.** Surfaces are flat and separated by 1 px rules. No drop shadows, no elevated cards, no blur. If a region needs to stand out, it moves one tone to plate.

## Shapes

Corners are small and functional. Text buttons, fields, the key input, trigger chips and the Live badge use a 4px corner. The 44px square chrome controls (day arrows, theme button, over-video buttons) and the timeline filter selects use a slightly softer 10px corner. Video frames (live tiles and the player) use 8px with a 1 px rule border. The status dot is the only full circle besides the seal. Lines are 1 px everywhere; the seal itself is drawn at a 0.8 stroke.

Hatching is part of the form language: not-monitored gaps on the timeline are hatched in muted ink, tampered spans hatched in void.

## Components

### Buttons
Restrained and printed, not filled by default.
- **Shape:** 4px corner (`rounded.sm`), 44px minimum height.
- **Primary:** line fill with ground text, 600 weight. One per view at most (Add key, Scan QR code on phones).
- **Ghost (default):** transparent with a 1 px rule border and ink text; hover fills plate; disabled at 40% opacity.
- **Icon:** 44px square on phones (40px on desktop) with a 1 px rule border; icons at 22–24px.
- **Focus:** 2px foil outline, 2px offset, on every control.

### Inputs / Fields
- **Style:** plate fill, 1 px rule border, 4px corner, 16px text, 12px padding.
- **Selects:** the same plate fill; in the timeline filter bar they take the 10px corner, a muted chevron and a 12px label above.
- **Focus:** 2px outline (foil from the global rule; the key field overrides it to line).

### Navigation
- **Top bar:** ground, 1 px rule underneath, one row. Wordmark "z" in ink and "view" in line. No tabs.
- **Theme button:** 44px icon button, 10px corner, rule border. One press cycles System (screen icon), Light (sun), Dark (moon). Its name and tooltip read "Theme: System", "Theme: Light" or "Theme: Dark".
- **Key menu:** a key icon button that opens a small plate panel with a rule border and two items: "Lock now" and "Manage keys" (opens Keys).
- **Day navigator:** in the top bar; 44px arrow buttons with a 10px corner and rule border; a disabled "next day" fades to 50%.

### Event list
- **Trigger chips:** a row above the list: All, then one chip per trigger with its glyph. Multi-select; All clears. On phones the row stays on one line and scrolls sideways.
- **Row:** 64px minimum, three columns: serial start time; trigger chips plus camera (600, ink) and duration (muted); the seal at 38px. Rows are separated by 1 px rules.
- **Selected:** plate fill with a 1 px foil outline inset and a small "playing" mark. Hover fills plate.
- **Trigger chip:** 20px minimum, 4px corner, trigger colour with the glyph in `on-trigger`, 12px bold.

### Status dot
Recorder health: a 10px dot in line, amber, void or muted. When the status is not OK, a short phrase ("Recorder quiet 4 min") sits beside the dot; when it is OK there is no text, only the accessible name. Tapping it opens a plate panel with a rule border that lists the details in serial figures.

### Control bar
One plate bar directly under the video, always visible, 1 px rule above and below. In recording mode it holds previous and next event, back and forward 10 s, play and pause, the clock (the wall time of the frame in large serial figures, with the clip position beside it), the scrubber, the seal with its integrity sentence, Export, sound and fullscreen. On phones it fits one row without wrapping. In live mode it reads "Live now" and, with a single tile, that tile's sound and fullscreen.

### Live pill
In recording mode a "Live" pill with a small dot sits at the top right of the video; it returns to live. It uses the over-video values (ground fill, line dot), a 4px corner and the Label size. It is not shown in live mode, where the badge at the top left already says Live.

### Video and over-video controls
Video frames have an 8px corner and a rule border. The bottom scrim holds the camera name (600), "as of" time in serial figures (over-video muted), the Live badge (over-video line fill, ground text, shown only once playing) and 44px buttons: 1 px over-video rule border, 10px corner, 70% over-video ground fill. Reconnect and viewer-limit states fill the frame with a 70% over-video ground panel and a plain sentence.

### The Seal (signature component)
A per-clip guilloché seal, seeded from the clip id (or the key id), in an SVG at a 0.8 stroke.
- **Drawing:** at 44px and above, three concentric bands of phase-shifted sine strands woven into a lattice. Below 44px, a rosette of 8–14 rotated ellipses through the centre, because bands collapse into a bullseye at list size.
- **States:**
  - **unchecked:** a dashed muted ring, no rosette.
  - **verifying:** ring and rosette in line at 40% opacity; the rosette turns once every 12 s (stopped under reduced motion).
  - **verified:** ring and rosette in line.
  - **incomplete:** amber ring; the rosette drawn only in a 240° sector.
  - **mismatch:** amber rosette; the ring has one wide notch.
  - **tampered:** void ring filled with rows of "VOID" set at −35°; no rosette.
  - **unknown-key:** muted rosette; the ring broken by three small gaps.
- **Decorative variant:** the same rosette, drawn verified, hidden from assistive tech, used as a key's fingerprint (40px in the key list, 64px on "Key added") and as the faded empty-player mark.
- **Label:** when shown, the state's sentence sits beside it in 14px; the seal always has an accessible name unless decorative.

### Timeline (canvas)
One lane per camera on plate over ground, an 11px ruler, rule-coloured grid lines, line-coloured clip bars, trigger spans with glyphs when they fit, hatched not-monitored gaps, and a foil now line. It reads the live `--z-*` tokens so it follows the theme.

## Do's and Don'ts

### Do:
- **Do** separate regions with 1 px `rule` lines and one tonal step to `plate`.
- **Do** keep each ink to its meaning: `line` verified or chosen, `foil` focus or now, `amber` degraded, `void` tampered.
- **Do** set every time, duration and count in tabular figures (`.num`, +0.02em).
- **Do** give every phone target at least 44px, and use 16px text in fields.
- **Do** use the dark over-video values for anything drawn on footage, in both themes.
- **Do** show a seal beside every clip and draw it from what was actually checked; unchecked stays an empty dashed ring.
- **Do** print every trigger colour with its glyph in `on-trigger`.
- **Do** use the authored 24px stroke icons (1.75 stroke, round caps) from the Icon set.

### Don't:
- **Don't** use drop shadows, elevated cards, card grids or blur.
- **Don't** retint the trigger colours or `on-trigger` per theme; they are fixed by ui-spec §4.6.
- **Don't** put light-theme paper or ink on top of video.
- **Don't** let a seal or any copy claim more than was checked, or soften a tampered or mismatch state.
- **Don't** add a second typeface.
- **Don't** fall back to the black NVR grid with a red REC dot, or default Tailwind greys.
