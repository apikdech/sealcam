# Playback memory notes

This note records the memory use of the playback engine (`web/src/lib/player`). It is for the
engineers who run the playback checks.

The table gives the peak JS heap and the buffered bytes while the engine plays and seeks a 300 s
live clip, for each profile. The targets are from ui-spec §4.3.2:

- Mobile: at most 32 MiB of plaintext in memory at 3 Mbps.
- Desktop: at most 64 MiB.

> **Warning:** Nothing in this file has been measured yet. Do not estimate the values. Fill the
> table from the run that `docs/LIVE-CHECKS.md` describes in "Task 36 — Playback engine and demo
> page".

| Browser | Profile | Engine | Peak JS heap | Peak buffered (s) | Peak buffered (MiB at the clip's bitrate) | Seek to 150 s (ms) | Notes |
|---|---|---|---|---|---|---|---|
| Chrome desktop | desktop | mse | not measured | not measured | not measured | not measured | |
| Safari macOS | desktop | mms or mse | not measured | not measured | not measured | not measured | |
| iPhone Safari | mobile | mms | not measured | not measured | not measured | not measured | |

How to read the numbers:

* Peak JS heap: use the Chrome DevTools Memory tab ("JS heap" in the Performance monitor). Or use
  Safari Web Inspector Timelines > JavaScript & Events. The plaintext chunks stay in the
  SourceBuffer, not in the JS heap. Thus also record the buffered span.
* Buffered span and bytes: run this command in the console on the demo page.
  `const v = document.querySelector('[data-testid=player]'); [...Array(v.buffered.length).keys()].map(i => [v.buffered.start(i), v.buffered.end(i)])`
  Multiply the span by the clip's bitrate (`size_bytes * 8 / duration_s`) to get the bytes.
