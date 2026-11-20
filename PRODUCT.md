# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences are equally important:

- **Household family members.** They are not technical and share one master key (Contract D2). They use the installed PWA, mostly on phones. Some are relatives abroad who view in a forced display zone (for example `Asia/Jakarta`).
- **The operator.** This is the technical person who runs zrelay, MinIO and the deploy. They use zview on a desktop or a phone to check recordings, live cameras and relay health.

Both audiences open zview for two equally common jobs:

1. **Review what happened.** Find an event clip on the timeline and play it.
2. **Check live.** Look at the live cameras now.

## Product Purpose

zview is the private viewer for zrelay. zrelay records event clips (motion, person, vehicle, pet) from RTSP/ONVIF cameras, encrypts each clip in the `zrec` format and stores it in S3-compatible storage. zview shows those clips on a per-day timeline, decrypts and plays them in the browser, exports them, and shows live camera video over WebRTC (WHEP).

Success: a family member finds and plays the clip they want in a few taps, and anyone can see the live cameras at once. Users can trust that what they see is the real, verified recording.

## Positioning

zview is zero-knowledge. A Web Worker in the browser does all decryption. zview-server, the storage and the network never hold the key or plaintext video. Each clip is authenticated as it plays, and the UI reports its integrity state (verified, metadata mismatch, tampered, incomplete, unknown key). A typical NVR or cloud-camera viewer cannot truthfully make this claim.

## Operating Context

- Access goes only through Tailscale (`tailscale serve`, HTTPS). There is one origin, and zview-server serves both the SPA and `/api/v1/*`.
- First run: import the master key (`zk1-…`) by pasting it or scanning a QR code. The key is kept non-extractable in IndexedDB. An idle lock and a key/lock menu control it.
- Two top-level views: **Timeline** (ui-spec §4.6–4.7) and **Live** (design §7.2).
- Timeline: one lane per camera, a day ruler in the viewer's local zone (or a forced zone), trigger spans, coverage gaps marked "not monitored", and a now line. It zooms through 24 h → 1 min, pans, and has keyboard shortcuts.
- Live: a responsive grid of camera tiles, each with a live badge, a reconnecting state, tap-to-unmute, and a "viewer limit reached" state.
- Relay status: a dot that turns red when the relay status is older than 3 minutes or a camera is down.
- Export saves an unencrypted MP4 to the device, after a confirmation step.
- Production: read-only containers on a Mac mini, with MinIO on the NAS. Local testing uses `make demo` (a simulated camera) or `make local-up` (full stack with RustFS).

## Capabilities and Constraints

- **Normative specs win.** `docs/specs/` (`contract.md`, `relay-spec.md`, `ui-spec.md`) as amended by `docs/superpowers/specs/2026-11-06-zrelay-v2-design.md` §11. Integrity states, the export rules, the timeline behaviour, the layout and the keyboard map are defined there. Design work does not redefine them.
- **Mandated copy** (ui-spec §4.4, §4.8, §4.9), for example: "Encrypted recording verified", "This recording failed verification at ~mm:ss", "Recording was interrupted", "This saves an **unencrypted** copy on this device.", "New version available — reload".
- **Never color alone.** Trigger types have glyphs (`P` person, `V` vehicle, `A` pet, `M` motion, `•` other) in addition to their spec'd colors.
- **Untrusted data.** Strings render as text only. `{@html}` and `innerHTML` with data are forbidden. The CSP is strict (`connect-src 'self'`).
- **Service worker** precaches only the hashed app shell. It never caches data and never intercepts `/api` or `/live`.
- **Performance target:** 60 fps timeline pan/zoom with 500 clips/day × 4 cameras on a mid-range phone. The timeline is Canvas 2D.
- **Browser baseline:** Safari/iOS 17.1+ (`ManagedMediaSource`), Chrome/Edge and Firefox current −2, a Blob fallback for older iOS.
- **Stack:** Svelte 5, Vite, Tailwind 4, TypeScript (`web/`). Strict TDD: a failing test comes before implementation code.
- **Non-goals:** per-user accounts or permissions, continuous-recording playback, synchronized multi-camera playback, hiding metadata from storage.

## Brand Commitments

- Names: **zview** (viewer), **zrelay** (recorder), always lowercase.
- App icons exist in `web/static/icons/`. The manifest describes zview as "Private viewer for zrelay recordings and live cameras".
- Copy is plain, short English. Human-facing docs use a simplified technical English style.

## Evidence on Hand

- Test footage: `testdata/video/`, and the looping simulated camera from `make demo`.
- Real camera: a Tapo C220 in the operator's home (used with `make local-up`).
- There are no product screenshots, testimonials, user research or usage metrics. Do not fabricate them.

## Product Principles

1. **Trust is visible.** Every clip shows if it is verified, and failure states are honest and specific. Do not hide or soften an integrity problem.
2. **The key never leaks.** No design may move key material, plaintext or credentials out of the worker, onto disk or into logs. Plaintext export is always an explicit, confirmed act.
3. **Two audiences, one interface.** A non-technical family member on a phone and the operator on a desktop must both succeed without a separate "simple mode".
4. **The footage is the content.** Video and the timeline get the space. The chrome stays out of the way.
5. **Fast on a phone.** A mid-range phone over Tailscale is the reference device for responsiveness.

## Accessibility & Inclusion

- UI text is English only. No i18n is required now.
- Times show in the viewer's local zone or a forced display zone, using `Intl.DateTimeFormat`.
- Information is never carried by color alone (trigger glyphs, integrity badges with text).
- The full keyboard map in ui-spec §4.7 is required on desktop. Mobile needs larger timeline touch targets.
