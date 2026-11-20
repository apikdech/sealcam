---
version: 1
slug: "web-src-app-svelte"
primary_target: "web/src/App.svelte"
related_targets: ["web/src/routes","web/src/lib"]
---

## Scope and mode

The whole zview SPA (`web/`): Home (new: live plus today), Timeline, Live fullscreen and the multi-camera grid, Keys / first run, export dialog, update prompt. Mode: Operate. Build path: code-led (no image generation). Replacement world; the old Tailwind-default look is anti-reference.

## Audience, job, constraints

Family members on phones (often half awake in a dark room, or abroad in daylight) and the operator at a desk. Two equally common jobs: "what happened today" and "what does the door look like now". Anti-goals: surveillance vibe, generic SaaS, techy jargon. Constraints live in PRODUCT.md and the specs (integrity copy, glyphs, CSP, worker boundary, TDD, 60 fps timeline).

## Decisions taken in shape (2026-11-20)

- Combined Home is the default view; tabs Home / Timeline / Keys (design §7.2 amended).
- Live on Home starts automatically and closes when the app is hidden (one WHEP viewer slot while open).
- Integrity is known only after a clip plays: a seal never claims more than was checked.

## Direction contract

THESIS: Every recording carries a seal. zview treats each clip like a stamped document: a guilloché rosette, drawn from the clip's own verification state, sits beside it everywhere it appears (list, timeline bar, player, key screen). It refuses the category default: a black NVR grid with a red REC dot and a dashboard of cards.

OWN-WORLD: Security printing (banknotes, the Indonesian meterai). Dark: intaglio blue-green ground (#0E1A1F, plate #132429, rules #22393F), ink-teal line (#5FA8A0) for verified and selection, gold foil (#C9A44C) for today/focus/current, warm amber (#D9A441) for degraded, VOID red for tampered; light: off-white security paper (#EDE9DF) with the same inks deepened. Fine 1 px intaglio rules, no cards, no shadows; tabular "serial" figures for every time; Atkinson Hyperlegible Next as the one face; authored stroke icons. Spec trigger colours and P/V/A/M glyphs unchanged.

STORY: The visitor learns at a glance whether the recorder is healthy (in words), sees the door now, and reads today's events newest first; each seal tells them which recordings were checked and genuine. They tap an event to play it in place of live, and come back to live in one tap.

FIRST VIEWPORT: Phone 390×844: top bar with the zview wordmark left and the recorder status in words right ("Recorder quiet 4 min", a button). Day row: 44 px ‹ ›, "Friday 20 November" with "Jakarta time · today" under it. Live front door full width (16:9), a bottom bar on the video with name, "as of 21:47:12", Live badge (only once playing), sound and fullscreen at 44 px. A 24 h strip under it with hatched gaps and a now line. "Today · N events" then rows (time in large serial figures, glyphs, camera, length, seal). Bottom tab bar Home / Timeline / Keys. Desktop: live plus timeline left, the day's list right, the same top bar.

FORM: Intaglio Seal; position 3 on the ordered grounded list (roll-assigned); seed:4ce8b3d6e7982640. Signature move: the per-clip guilloché seal (unchecked outline, verifying, verified, partial/incomplete, mismatch amber, tampered VOID, unknown key) and the key fingerprint drawn as the same rosette. Raises: night-vision brightness ceiling (star atlas); destructive isolation (developer console); registered frames (botanical folio); one shared 24 h grid (Crouwel grid); continuous zoom with a live span readout (variable font specimen).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Reference

Chosen sketch: `.impeccable/mocks/decision/assigned.html` (390×844). Critique snapshots: `.impeccable/critique/` in the main checkout (2026-11-20, Timeline 20/40, Live 20/40, Onboarding 18/40).
