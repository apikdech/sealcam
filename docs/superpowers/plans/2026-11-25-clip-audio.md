# Clip Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A camera with `record_audio: true` records its G.711 audio into its clips, and zview plays it in sync with the video and keeps it in exports.

**Architecture:** The relay stamps audio packets with wall time, carries them through the hub, ring and clip machine, and the muxer writes them as a second fMP4 track (`alaw`/`ulaw`, 8 kHz) in audio-only fragments after each video fragment. zview filters the decrypted stream so MediaSource never sees the audio track, decodes G.711 in JS and plays it through Web Audio against `video.currentTime`.

**Tech Stack:** Go (gortsplib v5, mediacommon v2 fmp4), TypeScript + Svelte 5, Vitest, Playwright, Docker ffmpeg (`linuxserver/ffmpeg:version-7.1-cli`) for probes.

**Spec:** `docs/superpowers/specs/2026-11-23-clip-audio-design.md` (amends `docs/specs/contract.md` D10, §5, §6; `docs/specs/relay-spec.md` §4.3; v2 design D17).

## Global Constraints

- Zero-disk relay: no temp files, no spools; bounded allocations only. Plaintext audio never in logs or sidecars.
- The relay never transcodes. G.711 bytes are stored exactly as received.
- `record_audio` defaults to `false`. A camera without G.711 8 kHz mono records video only and logs once per session at INFO.
- Clips without audio are byte-for-byte what they are today (init segment, fragments, sidecar JSON).
- Audio track: track ID 2, sample entry `alaw` (PCMA) or `ulaw` (PCMU), 8 000 Hz, mono, sample size 16, timescale 8 000. One sample = one G.711 byte, duration 1.
- Fragments never mix tracks. `seek_index` lists video fragments only.
- Sidecar field `audio`: absent for no audio, else `{"codec":"PCMA"|"PCMU","sample_rate":8000,"channels":1}`. Schema stays `zrec.sidecar/2`.
- zview: sound starts off; the button label is "Turn sound on" / "Turn sound off" (same as the live tile); audio is muted at playback rates other than 1; drift above 50 ms is corrected.
- ffmpeg/ffprobe run only from Docker. TDD: a failing test before every implementation step.
- No Claude attribution lines in commits.

## Review Focus

1. **A camera that has audio but `record_audio: false`:** clips must be byte-identical to today's. Pinned in Task 5 (`TestRecorderIgnoresAudioWithoutOptIn`) and Task 6 (`TestNewVideoOnlyInitUnchanged`).
2. **Lost, duplicated or reordered audio RTP packets:** gaps start a new run, duplicates and packets that go backwards are dropped, `tfdt` never decreases. Pinned in Task 6 (`TestAudioRunsSplitOnGap`, `TestAudioDropsOverlap`).
3. **Seeking to the middle of a clip with audio:** the filter starts at a `moof` with the track info learned from the earlier `moov`, and audio resumes at the seek point. Pinned in Task 10 (`resumes after reset at a moof`) and Task 12 (`schedules from the seek point`).
4. **A tampered chunk inside a clip with audio:** no audio plays past the last authenticated byte, the same as video. Pinned in Task 12 (`stops audio at the failure point`).
5. **Rate changes (2× then back to 1×) and pause/play:** audio stops at other rates and resumes in sync at 1×. Pinned in Task 11 (`mutes at other rates and resumes at 1`).

---

### Task 1: Spec amendments

**Files:**
- Modify: `docs/specs/contract.md` (D10 row, §5 "No audio track" bullet, §6 field table)
- Modify: `docs/specs/relay-spec.md` (line 15, §"Audio RTP streams are not set up", §4.3 ring)
- Modify: `docs/superpowers/specs/2026-11-06-zrelay-v2-design.md` (D17 row, §113)

- [ ] **Step 1:** In each file, replace the "no audio in clips" statements with a one-line amendment that points at `docs/superpowers/specs/2026-11-23-clip-audio-design.md` and states the rule (opt-in `record_audio`, G.711 track 2, audio-only fragments, sidecar `audio`). Add the `audio` row to the Contract §6 field table with the exact JSON shape from Global Constraints. Use the `ste-writing` style already used in these docs.
- [ ] **Step 2:** Run `go test ./deploy/...` (the runbook and doc tests). Expected: PASS.
- [ ] **Step 3:** Commit: `docs: amend the contract and relay spec for opt-in clip audio`.

### Task 2: Config `record_audio` and memory budget

**Files:**
- Modify: `internal/relay/config/config.go` (`CameraDefaults`, `CameraOverrides`, `Camera`, the resolve loop near line 399)
- Modify: `internal/relay/config/budget.go:48-80`
- Modify: `deploy/zrelay.example.yaml` (commented `record_audio: false` under `defaults`)
- Test: `internal/relay/config/config_test.go`, `internal/relay/config/budget_test.go`

**Interfaces:**
- Produces: `CameraDefaults.RecordAudio bool \`yaml:"record_audio"\``, `CameraOverrides.RecordAudio *bool \`yaml:"record_audio"\``, `Camera.RecordAudio bool \`yaml:"-"\`` (effective value).

- [ ] **Step 1: Failing tests.** `TestRecordAudioDefaultsOff` (no key → `cam.RecordAudio == false`), `TestRecordAudioDefaultAndOverride` (defaults `true`, one camera overrides `false` → `true`/`false`), `TestBudgetCountsAudio` (same config with `RecordAudio` on adds `8000 × (pre_roll + max_gop) × 5/4` to that camera's `Ring` and `8000 × max_gop` to `Active`, i.e. `b` grows by 8 000 B/s).
- [ ] **Step 2:** `go test ./internal/relay/config/ -run 'RecordAudio|BudgetCountsAudio'` → FAIL.
- [ ] **Step 3:** Add the fields; resolve with a `*bool` sibling of the `pick` helper in `Load` (`config.go:379`); in `Budget`, add 8 000 to `b` when `cam.RecordAudio`.
- [ ] **Step 4:** Run `go test ./internal/relay/config/ ./deploy/...` → PASS.
- [ ] **Step 5:** Commit: `feat(relay): record_audio camera option, counted in the memory budget`.

### Task 3: Audio wall time in the camera session

**Files:**
- Modify: `internal/relay/camera/au.go` (`AudioPacket`, `assembler`, `assembler.audio`)
- Modify: `internal/relay/camera/rtsp.go:238-256` (`setupAudio`)
- Test: `internal/relay/camera/assembler_internal_test.go`

**Interfaces:**
- Produces: `AudioPacket.Wall time.Time`; `func (a *assembler) audio(p *AudioPacket, arrival time.Time)`; assembler field `audioNTP func(uint32) (time.Time, bool)` set by `setupAudio` with `ntpFunc(c, medi, g711)`.

- [ ] **Step 1: Failing tests.**
  - `TestAudioWallArrival`: time source `arrival`; first audio packet ts=1000 arriving at T, second ts=1160 → `Wall` = T and T+20 ms.
  - `TestAudioWallRTCP`: time source `rtcp` with an `audioNTP` stub returning N for ts → `Wall == N`; stub returning `ok=false` → arrival-based value.
  - `TestAudioWallWrapsAndNeverStepsBack`: ts wraps past 2^32 → continuous Wall; an NTP value earlier than the previous Wall + media step → floored (same rule as video `emit`).
  - `TestAudioBeforeVideoDecidedDropped`: packets before `decided` are not forwarded (existing behaviour, keep).
- [ ] **Step 2:** `go test ./internal/relay/camera/ -run AudioWall` → FAIL.
- [ ] **Step 3:** Implement: a second `unwrapper` for the audio clock; arrival anchor = arrival time of the first forwarded audio packet; `Wall = anchor + (unwrapped − first)/8000 s`; in `rtcp` mode prefer `audioNTP`; apply the same monotonic floor as `emit`. `setupAudio` passes `time.Now()` as arrival.
- [ ] **Step 4:** `go test -race ./internal/relay/camera/` → PASS.
- [ ] **Step 5:** Commit: `feat(relay): stamp audio packets with wall time`.

### Task 4: Hub delivers audio to opted-in recorder subscribers

**Files:**
- Modify: `internal/relay/camera/hub.go` (`Subscribe`, `Sub`, `Audio`, `deliver`)
- Test: `internal/relay/camera/hub_test.go`

**Interfaces:**
- Produces: `type SubOption func(*Sub)`; `func WithAudio() SubOption`; `func (h *Hub) Subscribe(class Class, queue int, opts ...SubOption) *Sub`.

- [ ] **Step 1: Failing tests.** `TestRecorderGetsNoAudioByDefault`; `TestRecorderWithAudioGetsAudio`; `TestRecorderAudioNeverLags` (fill the queue, send audio → `Lagged() == 0`, next video still delivered once there is room, the audio was dropped).
- [ ] **Step 2:** `go test ./internal/relay/camera/ -run 'Recorder.*Audio'` → FAIL.
- [ ] **Step 3:** Implement; audio to a recorder sub is a non-blocking send that drops on full. Update the `ClassRecorder` doc comment.
- [ ] **Step 4:** `go test -race ./internal/relay/camera/` → PASS.
- [ ] **Step 5:** Commit: `feat(relay): hub sends audio to recorders that opt in`.

### Task 5: Ring, clip machine and recorder carry audio

**Files:**
- Modify: `internal/relay/ring/ring.go` (`GOP`, new `PushAudio`)
- Modify: `internal/relay/clip/machine.go` (`OnAudio`, segment `pendAudio`, `begin`, `flushPend`, `split`, `OnLost`, `OpenInfo` population)
- Modify: `internal/relay/clip/` `OpenInfo` type (add `AudioCodec string`)
- Modify: `internal/relay/recorder/recorder.go:456-462` (`case camera.EventAudio`)
- Modify: `internal/relay/app/app.go:512` (pass `camera.WithAudio()` when `c.RecordAudio`; log INFO once per session when `RecordAudio` and no audio arrives within 5 s of the first video — builder may place this in the machine instead)
- Test: `internal/relay/ring/ring_test.go`, `internal/relay/clip/machine_test.go`, `internal/relay/recorder/recorder_test.go`

**Interfaces:**
- Consumes: `AudioPacket.Wall` (Task 3), `WithAudio` (Task 4), `Camera.RecordAudio` (Task 2).
- Produces: `GOP.Audio []*camera.AudioPacket`; `func (r *Ring) PushAudio(p *camera.AudioPacket)` (joins the open GOP, adds `len(p.Payload)` to `GOP.Bytes` and ring bytes, dropped when no GOP is open); `func (m *Machine) OnAudio(p *camera.AudioPacket)`; `clip.OpenInfo.AudioCodec string` (`""`, `"PCMA"`, `"PCMU"`: the machine's last seen audio codec at open, reset by `OnLost`).

- [ ] **Step 1: Failing tests.**
  - ring: `TestPushAudioJoinsOpenGOP`, `TestPushAudioBeforeFirstIDRDropped`, `TestAudioCountsTowardCap` (cap eviction includes audio bytes).
  - machine: `TestPreRollCarriesAudio` (audio pushed before the trigger reaches the clip's first written GOPs), `TestActiveClipAudioInPend` (audio during recording is in the next flushed GOP's `Audio`), `TestOpenInfoAudioCodec` (no audio seen → `""`; PCMA seen → `"PCMA"`), `TestAudioCodecChangeEndsClip` (PCMA then PCMU mid-clip → `codec_change`), `TestSplitKeepsAudio` (max_duration split keeps the audio of the IDR's GOP).
  - recorder: `TestRecorderIgnoresAudioWithoutOptIn` (Run with a sub without audio: written bytes equal the video-only reference).
- [ ] **Step 2:** `go test ./internal/relay/ring/ ./internal/relay/clip/ ./internal/relay/recorder/` → FAIL.
- [ ] **Step 3:** Implement as in Interfaces. In `begin`, the open GOP that becomes `pend` also moves its `Audio` into `pendAudio`. `flushPend` sets `g.Audio = seg.pendAudio` and clears it.
- [ ] **Step 4:** `go test -race ./internal/relay/...` → PASS.
- [ ] **Step 5:** Commit: `feat(relay): ring and clip machine carry audio into clips`.

### Task 6: Muxer writes the audio track

**Files:**
- Modify: `internal/relay/mux/muxer.go` (`New`, `WriteGOP`, `Stats`)
- Create: `internal/relay/mux/audio.go` (G.711 sample entry and audio fragment writing)
- Modify: `internal/relay/recorder/recorder.go:135-145` (pass `o.AudioCodec` to `mux.New`)
- Test: `internal/relay/mux/mux_test.go`, new `internal/relay/mux/audio_test.go`

**Interfaces:**
- Consumes: `GOP.Audio` (Task 5).
- Produces: `func New(w io.Writer, c camera.Codec, audioCodec string) (*Muxer, error)`; `Stats.AudioCodec string`.

- [ ] **Step 1: Failing tests.**
  - `TestNewVideoOnlyInitUnchanged`: `New(w, c, "")` writes the same bytes as before this task (golden bytes captured from `main` before changing code).
  - `TestInitHasAlawTrack`: `New(w, c, "PCMA")` → parse with mediacommon `fmp4.Init` or a box walk: two `trak`s, track 2 sample entry type `alaw`, channelcount 1, samplesize 16, samplerate 8000, `mdhd` timescale 8000, two `trex`. Same with `"PCMU"` → `ulaw`.
  - `TestAudioFragmentsFollowVideo`: one GOP with audio → bytes are `moof(video) mdat moof(audio) mdat`; audio `traf` has track_ID 2, `tfdt` = round((firstPacket.Wall − GOP.Start) × 8000), one sample per byte, duration 1; `SeekIndex` has one entry (video).
  - `TestAudioRunsSplitOnGap`: packets with RTP ts 0,160,480 (one missing) → two audio fragments, second `tfdt` from its own Wall.
  - `TestAudioDropsOverlap`: a duplicate packet and one whose computed start is before the previous run's end are dropped; `tfdt` never decreases across GOPs.
  - `TestAudioBeforeClipStartDropped`: packet Wall before the first GOP's Start → not written.
  - `TestFfprobeSeesAlaw` (skips without Docker, use `internal/testutil/ffprobe.go`): a muxed 4 s clip probes as `h264` + `pcm_alaw` 8000 Hz mono, audio start_time within 0.05 s of the packet offsets.
- [ ] **Step 2:** `go test ./internal/relay/mux/` → FAIL.
- [ ] **Step 3:** Implement. Keep mediacommon for video; write the audio `trak`/`trex` and the audio `moof`+`mdat` with a small box writer in `audio.go` (or patch mediacommon's marshalled init — builder's call, the tests decide). Run continuity: same run while `p.Timestamp == prev.Timestamp + len(prev.Payload)` (mod 2^32).
- [ ] **Step 4:** `go test -race ./internal/relay/mux/ ./internal/relay/recorder/` → PASS.
- [ ] **Step 5:** Commit: `feat(relay): mux G.711 audio as track 2 in audio-only fragments`.

### Task 7: Sidecar `audio` field

**Files:**
- Modify: `pkg/sidecar/sidecar.go` (`Sidecar`, new `Audio`, `Validate`)
- Modify: `internal/relay/recorder/recorder.go:194-228` (`clipWriter.sidecar`)
- Modify: `testdata/sidecars/` (add one valid and one invalid audio sidecar if the package keeps fixtures there)
- Test: `pkg/sidecar/sidecar_test.go`, `internal/relay/recorder/recorder_test.go`

**Interfaces:**
- Produces: `type Audio struct { Codec string \`json:"codec"\`; SampleRate int \`json:"sample_rate"\`; Channels int \`json:"channels"\` }`; `Sidecar.Audio *Audio \`json:"audio,omitempty"\``.

- [ ] **Step 1: Failing tests.** `TestAudioOmittedWhenNil` (marshal has no `"audio"` key); `TestAudioValid` (`{"PCMA",8000,1}` validates); `TestAudioInvalid` (codec `"opus"`, rate 16000, channels 2 → field errors on `audio.codec`, `audio.sample_rate`, `audio.channels`); recorder `TestSidecarAudioFromOpenInfo`.
- [ ] **Step 2:** `go test ./pkg/sidecar/ ./internal/relay/recorder/` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `go test -race ./...` → PASS.
- [ ] **Step 5:** Commit: `feat(sidecar): optional audio field`.

### Task 8: Test camera beeps, audio fixture clip

**Files:**
- Modify: `internal/testutil/rtspserver.go` (new option `AudioBeeps bool`: PCMA with a 1 kHz tone for 100 ms starting at each IDR, silence otherwise)
- Modify: `internal/relay/app/fixtures_gen_test.go` (also generate `testdata/clips/audio/` with `record_audio: true` and `AudioBeeps`)
- Create: `testdata/clips/audio/` (generated), update `testdata/clips/manifest.json` and `testdata/clips/README.md`
- Test: `internal/testutil/rtspserver_test.go`, `internal/relay/app/app_test.go`

- [ ] **Step 1: Failing tests.** `TestRTSPServerAudioBeeps` (packets in the first 100 ms after an IDR are non-silent, later ones are `0xD5`); `TestAppRecordsAudio` (end-to-end `app.Run` against the test server with `record_audio: true` → committed sidecar has `audio.codec == "PCMA"`, decrypted clip has a track-2 `alaw` entry).
- [ ] **Step 2:** Run them → FAIL.
- [ ] **Step 3:** Implement; regenerate fixtures with the README command plus the new variant. The other variants must not change apart from what regeneration always changes (clip id, start time).
- [ ] **Step 4:** `go test -race ./internal/...` → PASS; `zdecrypt` the audio fixture and probe with Docker ffprobe: `pcm_alaw`, 8000 Hz, mono.
- [ ] **Step 5:** Commit: `test: beeping test camera and an audio clip fixture`.

### Task 9: zview sidecar schema

**Files:**
- Modify: `web/src/worker/schemas.ts:55-110`
- Test: `web/src/worker/schemas.test.ts`

**Interfaces:**
- Produces: `Sidecar['audio']: { codec: 'PCMA' | 'PCMU'; sample_rate: 8000; channels: 1 } | null` (absent → `null`).

- [ ] **Step 1: Failing tests.** `parses a sidecar without audio as audio null`; `parses the PCMA audio object`; `rejects audio with codec opus` (counts as invalid in `parseClipList`).
- [ ] **Step 2:** `cd web && npx vitest run src/worker/schemas.test.ts` → FAIL.
- [ ] **Step 3:** Implement with `v.optional(v.nullable(...), null)`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit: `feat(zview): sidecar audio field`.

### Task 10: Streaming fMP4 filter

**Files:**
- Create: `web/src/lib/player/fmp4filter.ts`
- Test: `web/src/lib/player/fmp4filter.test.ts` (build boxes with a tiny helper in the test; also read the audio fixture from Task 8 for one real-bytes test)

**Interfaces:**
- Produces:
  ```ts
  export interface AudioTrackInfo { codec: 'PCMA' | 'PCMU'; trackId: number; timescale: number }
  export interface AudioRun { tfdt: number; bytes: Uint8Array } // tfdt in track timescale units
  export class Fmp4Filter {
    constructor(onAudio: (run: AudioRun) => void);
    /** Returns the bytes to append to the video SourceBuffer, in order (possibly none). */
    push(bytes: Uint8Array): Uint8Array[];
    /** Drops partial-box state; keeps the track info learned from moov. */
    reset(): void;
    get audio(): AudioTrackInfo | null;
  }
  ```

- [ ] **Step 1: Failing tests.**
  - `passes a video-only stream through unchanged` (output concatenation === input, for any split of the input into chunks, including 1-byte chunks).
  - `removes the audio trak and trex from moov and fixes the sizes` (output moov parses; one trak; `audio` = `{codec:'PCMA', trackId:2, timescale:8000}`).
  - `drops audio fragments and reports their samples` (onAudio gets `tfdt` and the mdat payload; output has only video moof/mdat).
  - `streams a large video mdat without buffering it` (the output for a 2 MiB video mdat is emitted across calls before the whole mdat has arrived).
  - `resumes after reset at a moof` (push moov, reset, push from a later video moof → correct video out, audio still reported).
  - `throws ErrFormat for a moof larger than 1 MiB or an audio mdat larger than 1 MiB` (bounded memory).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement a box-header state machine: buffer `moov`/`moof` whole (bounded), stream video `mdat` through, capture audio `mdat` (bounded). The track of an `mdat` is the track of the `moof` before it (`tfhd.track_ID`). Use `ErrFormat` from `web/src/lib/zrec/errors.ts`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit: `feat(zview): fMP4 filter that splits audio from the video stream`.

### Task 11: G.711 decode and the audio scheduler

**Files:**
- Create: `web/src/lib/player/g711.ts`, `web/src/lib/player/audio.ts`
- Test: `web/src/lib/player/g711.test.ts`, `web/src/lib/player/audio.test.ts` (fake `AudioContext` that records `start(when, offset)` and `stop()` calls; fake video clock)

**Interfaces:**
- Consumes: `AudioTrackInfo`, `AudioRun` (Task 10).
- Produces:
  ```ts
  export function decodeG711(bytes: Uint8Array, codec: 'PCMA' | 'PCMU'): Float32Array;
  export interface VideoClock { currentTime: number; paused: boolean; playbackRate: number;
    addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void }
  export class ClipAudio {
    constructor(video: VideoClock, makeContext?: () => AudioContext);
    setTrack(info: AudioTrackInfo | null): void;
    add(run: AudioRun): void;
    evictBefore(tSec: number): void;
    clear(): void;
    setEnabled(on: boolean): void;
    dispose(): void;
  }
  ```

- [ ] **Step 1: Failing tests.**
  - g711: A-law `0xD5 → 8/32768`, `0x55 → -8/32768`, `0xAA → 32256/32768`, `0x2A → -32256/32768`; µ-law `0xFF → 0`, `0x00 → -32124/32768`, `0x80 → 32124/32768`; output length equals input length.
  - audio: `schedules runs from the video position` (enabled, playing at t=3.0 with a run at tfdt 16000 → `start(ctx.now + 0, 1.0)` i.e. offset 1 s into the run starting at 2 s); `does nothing while disabled`; `stops on pause and reschedules on play`; `reschedules on seeked`; `mutes at other rates and resumes at 1`; `corrects drift above 50 ms` (video clock jumps 60 ms against the context clock on timeupdate → stop + reschedule; 30 ms → no change); `evictBefore drops old runs`; `clear stops everything`; `creates the AudioContext lazily on first enable` (browsers need a user gesture).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. One `AudioBuffer` per run at `sampleRate` 8 000. Keep decoded runs only for the engine's buffer window (the engine calls `evictBefore`).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit: `feat(zview): G.711 decoding and audio scheduling against the video clock`.

### Task 12: Engine integration

**Files:**
- Modify: `web/src/lib/player/engine.ts` (`PlayerState`, `Player`, `#fill`, `#append` caller, `#evictBehind`, the fetch-seek parser reset, `#runBlob`, `load`, `#fail`)
- Modify: `web/src/lib/player/status.ts` (`initialState().hasAudio = false`)
- Test: `web/src/lib/player/engine.test.ts`

**Interfaces:**
- Consumes: `Fmp4Filter` (Task 10), `ClipAudio` (Task 11).
- Produces: `PlayerState.hasAudio: boolean`; `Player.setSound(on: boolean): void`.

- [ ] **Step 1: Failing tests.**
  - `MediaSource never receives the audio track` (fake sink records appended bytes; with the audio fixture, the appended init has one trak and no audio moof).
  - `a clip without audio appends exactly the decrypted bytes` (unchanged behaviour).
  - `hasAudio follows the init segment` (true for the audio fixture, false for `complete`).
  - `schedules from the seek point` (seek into the middle → filter reset, audio runs from that fragment on reach `ClipAudio.add`).
  - `stops audio at the failure point` (tamper variant built from the audio fixture in the test by flipping a byte → no `add` for data after the failing chunk, audio cleared at `#fail`).
  - `the Blob path filters too` (blob engine: the Blob has no audio trak; audio runs reported).
  - `setSound survives the next clip` (sound on, load another clip → still enabled).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: one `Fmp4Filter` and one `ClipAudio` per loaded clip; `#fill` appends each part `push` returns; reset the filter and `clear()` audio where the engine resets its parser for a fetch seek; call `evictBefore` alongside `#evictBehind`; dispose both on load/unload.
- [ ] **Step 4:** `cd web && npx vitest run src/lib/player` → PASS. **Step 5:** Commit: `feat(zview): the player strips and plays clip audio`.

### Task 13: Sound button in the player

**Files:**
- Modify: `web/src/lib/components/Player.svelte` (bar controls, next to the speed choices)
- Create: `web/src/lib/player/soundPref.ts` (`loadSoundPref(): boolean`, `saveSoundPref(on: boolean): void`, in memory for the page session)
- Test: `web/src/lib/components/components.test.ts` (where the Player component tests live)

**Interfaces:**
- Consumes: `PlayerState.hasAudio`, `Player.setSound` (Task 12).

- [ ] **Step 1: Failing tests.** `no sound button for a clip without audio`; `the sound button shows for a clip with audio, labelled Turn sound on`; `clicking it calls setSound(true) and relabels Turn sound off`; `the choice carries to the next clip`. Icon names `sound-off`/`sound-on` (the live tile's).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; follow the live tile's button markup and DESIGN.md sizes (44 px on touch).
- [ ] **Step 4:** `cd web && npm run -s check && npm run -s lint && npx vitest run` → PASS. **Step 5:** Commit: `feat(zview): sound button for clips with audio`.

### Task 14: End-to-end and export

**Files:**
- Modify: `web/e2e/playback.spec.ts` (serve `testdata/clips/audio`)
- Test: `web/src/lib/export.test.ts`

- [ ] **Step 1: Failing tests.** e2e `plays the audio clip with sound available` (video reaches 3 s, the sound button appears, turning it on raises no page error); unit `export writes the decrypted bytes unchanged, audio track included` (exported bytes for the audio fixture contain `alaw`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Make them pass (expected: only test wiring is missing).
- [ ] **Step 4:** `make web && cd web && npx playwright test playback` → PASS. **Step 5:** Commit: `test(zview): e2e playback and export of a clip with audio`.

### Task 15: Live check on the home stack

- [ ] **Step 1:** Add `record_audio: true` to `tapo-c220` in `deploy/zrelay.yaml`; `make local-up`.
- [ ] **Step 2:** Trigger a person event; in zview open the clip, turn sound on, clap in front of the camera. Expected: the clap sound lines up with the picture (no visible offset).
- [ ] **Step 3:** Export the clip; `ffprobe` it from Docker → `h264` + `pcm_alaw` 8000 Hz mono; play it in VLC with sound.
- [ ] **Step 4:** Record the result (offset seen, if any) in the design doc §5.2 note. If there is a visible offset, stop and propose `audio_offset_ms` to the user instead of building it.
- [ ] **Step 5:** Commit: `docs: clip audio live check result`.
