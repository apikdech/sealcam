# Clip audio: design

Date: 2026-11-23. Status: approved approach, open for review.

This design amends Contract D10 and §5, relay-spec §4.3 and §141, and the v2 design D17
("Clips stay video-only"). Where it conflicts with them, this design wins for the items it names.

## 1. Intent

The family wants to hear what happened in a recorded event: what someone said at the gate, a
knock, a shout that the picture does not explain. Today only live view has sound. Clips drop the
camera's audio (Contract D10) because Tapo cameras send G.711 and browsers do not play G.711 in
MP4, and the relay does not transcode.

## 2. Goals, non-goals, anti-goals

Goals

* A camera can opt in to recording audio with its clips. The default stays off.
* zview plays a clip's audio in sync with its video, on every engine it supports today
  (MediaSource, ManagedMediaSource, Blob).
* An exported clip keeps its audio, playable in VLC and ffmpeg-based players.
* Pre-roll covers audio as well as video.

Non-goals

* Transcoding to AAC or Opus (spec future work stays future work).
* Audio-only triggers (sound detection).
* Audio for cameras that send anything but G.711 8 kHz mono (PCMA or PCMU), the only audio the
  relay sets up today.
* A volume slider or audio waveform in the UI.

Anti-goals

* Audio drifting out of sync with the picture. Audio that is visibly late or early is worse than
  no audio.
* Any plaintext audio on disk, in logs or in the sidecar. Audio has the same confidentiality as
  video (G1, G5).
* A camera recording sound without someone choosing it in `zrelay.yaml`.
* Breaking playback of the clips already stored (video-only clips stay valid and unchanged).

## 3. Constraints

* Zero-disk relay, bounded allocations, read-only container, no ffmpeg in the relay.
* The relay never transcodes (G.711 bytes are stored exactly as the camera sent them).
* MediaSource in Chrome, Firefox and Safari rejects an init segment with a G.711 track, and does
  not play LPCM in MP4. So the browser's player must never see the audio track.
* mediacommon v2 (`pkg/formats/mp4/codecs`) has no G.711 codec. The relay writes the `alaw` or
  `ulaw` sample entry itself.
* Audio RTP packets carry only the audio RTP timestamp (8 kHz), with an unrelated random offset.
  They have no wall time today (`camera.AudioPacket`).

## 4. Approaches considered

1. **Audio as a track in the same encrypted clip, stripped by zview (chosen).** One object per
   clip, so staging, commit and crash recovery (Contract §7) do not change. Audio is covered by
   the same chunk authentication. Export keeps the sound for free. Cost: zview filters the fMP4
   stream before MediaSource, and plays audio itself through Web Audio.
2. **Audio as a second encrypted object beside the video.** zview needs no MP4 filtering, but
   every clip becomes two objects to stage, commit, recover, index and delete, and the export has
   no sound unless zview remuxes. Rejected: recovery is the riskiest code in the relay.
3. **Transcode to AAC or Opus in the relay.** Native browser playback, no zview audio code. Needs
   an encoder (cgo or ffmpeg) in the relay. Rejected by the constraints.

## 5. Design

### 5.1 Configuration

* New camera key `record_audio` (bool), in `cameras.defaults` and as a per-camera override.
  Default `false`.
* If `record_audio` is true and the camera offers no G.711 8 kHz mono track, the relay records
  video only and logs this once per session at INFO. It is not a config error, because the
  relay only learns the tracks at RTSP DESCRIBE.
* The memory budget (design §8.1) adds the audio rate (8 000 B/s) to `B` for cameras with
  `record_audio`. This is small; it keeps the formula honest.

### 5.2 Relay: audio timing

* Each `AudioPacket` gets a `Wall` time, computed the same way as the video's `AccessUnit.Wall`:
  RTCP sender-report NTP for the audio media (`PacketNTP`) when the session's time source is
  `rtcp`, otherwise arrival time of the first audio packet plus audio media time since. The
  audio RTP timestamp is unwrapped to 64 bits like the video one.
* Packets are forwarded to the recorder only after video has started (as for viewers today).

### 5.3 Relay: hub, ring and pre-roll

* `ClassRecorder` subscribers receive `EventAudio` only when their camera has `record_audio`.
  Live and restream behaviour do not change.
* `ring.GOP` gains the audio packets whose `Wall` falls in the GOP's wall span
  (`[IDR Wall, next IDR Wall)`). Audio arriving before the first GOP is dropped. Audio counts
  toward `GOP.Bytes`, so ring eviction stays bounded by the same limits.

### 5.4 Clip content profile (amends Contract §5)

* The init segment has two tracks when audio is recorded: track 1 video (unchanged, timescale
  90 000) and track 2 audio, `alaw` (PCMA) or `ulaw` (PCMU) sample entry, 8 000 Hz, mono,
  16-bit nominal sample size, timescale 8 000. `mvex` has a `trex` for each.
* Each GOP is written as the video fragment (unchanged: one GOP, starting with an IDR) followed
  by **zero or more audio-only fragments** (`moof` with one `traf` for track 2, then `mdat`).
  Fragments never mix tracks. This lets a reader drop audio with no offset rewriting.
* An audio fragment holds one contiguous run of samples. One sample is one G.711 byte, duration
  1. A gap in the audio (lost packets, a timestamp jump) ends the run; the next run starts a new
  fragment with its own `tfdt`. No silence is invented.
* Audio `tfdt` = round((packet Wall − first video GOP Wall) × 8 000). Packets before the clip's
  first GOP are dropped. Video `tfdt` stays 0 at the clip start.
* `seek_index` keeps one entry per **video** fragment, pointing at its `moof`. Audio fragments are
  not indexed.
* A mid-clip change of audio codec (PCMA to PCMU) ends the clip, like a video codec change
  (`end_reason: codec_change`).
* Clips without audio are byte-for-byte what they are today.

### 5.5 Sidecar (amends Contract §6)

* New optional top-level field `audio`: absent or `null` for no audio, else
  `{"codec": "PCMA" | "PCMU", "sample_rate": 8000, "channels": 1}`.
* It is a hint for the UI only (for example a speaker mark in the list). Like the rest of the
  sidecar it is not authenticated; zview trusts the init segment.
* The schema stays `zrec.sidecar/2`; the field is additive. The builder checks that the Go and
  zview sidecar parsers accept a sidecar with and without it, and that older zview builds ignore
  it.
* `video.codec` stays the video codec string only, so `MediaSource.isTypeSupported` keeps working.

### 5.6 zview: filtering the stream

* A streaming fMP4 filter sits between the worker's decrypted chunks and `sink.append`. It
  buffers bytes until a whole top-level box is present (bounded by the existing fragment size
  limits), then:
  * `ftyp`: passes through.
  * `moov`: if it has an audio `trak`, removes that `trak` and its `trex`, fixes the box sizes,
    and records the audio track id and codec. Otherwise passes through.
  * `moof` + `mdat` for the video track: pass through unchanged.
  * `moof` + `mdat` for the audio track: dropped from the stream; the samples go to the audio
    player with their `tfdt`.
* The filter resets wherever the engine resets its parser today (seek to a fragment, new clip).
* The Blob engine runs the same filter before building its Blob.
* Clips with no audio track pass through untouched, so existing clips are unaffected.

### 5.7 zview: playing audio

* G.711 is decoded to Float32 with the standard A-law and µ-law tables, in the main thread or
  the worker (builder's call). Decoded audio is kept only for the buffered window, the same way
  the video buffer is bounded.
* Playback uses one `AudioContext` per player and `AudioBufferSourceNode`s at 8 000 Hz, scheduled
  against `video.currentTime`. The player re-schedules on `play`, `pause`, `seeking`/`seeked`,
  `ratechange` and `waiting`, and corrects drift above 50 ms by re-scheduling.
* At a playback rate other than 1, audio is muted (no pitch-corrected playback). At 1 it resumes.
* Sound is off until the user turns it on, with a sound button in the player bar, the same
  pattern as the live tile. The choice is kept for the session and applies to the next clip.
  The button shows only when the playing clip has an audio track.
* Audio never plays from a clip, or part of a clip, that failed authentication: it comes from the
  same authenticated chunks as the video.

### 5.8 Export

* Export writes the decrypted clip unchanged, so it includes the audio track. No change to
  `export.ts` beyond tests that pin this.

### 5.9 Live view

* No change. Live audio still passes through WebRTC as G.711 (D17).

## 6. Testing

* Relay: muxer golden tests for a two-track init segment and audio fragments (gap, codec change,
  pre-roll audio); `ffprobe` from the pinned Docker image confirms the exported file has a
  playable `pcm_alaw`/`pcm_mulaw` stream at the right start time. Hub and ring tests for audio
  routing by `record_audio`. Config and budget tests.
* Test vectors: add a short clip with audio to `testdata/` so zview tests use real bytes.
* zview: filter unit tests (moov rewrite, audio fragments dropped, split boxes across chunks,
  reset), G.711 decode table tests, scheduler tests with a fake clock, engine tests showing
  MediaSource never receives the audio track, e2e playback of the audio test vector.
* Sync check by hand on the live stack: clap in front of the camera, confirm the sound lines up
  with the picture within one frame or two.

## 7. Left to the builder

* Where G.711 decoding runs (worker or main thread).
* How the relay writes the `alaw`/`ulaw` sample entry next to mediacommon's init (extend the box
  tree after marshal, or write the audio `trak` by hand).
* Exact drift-correction method in the scheduler, within the 50 ms bound.
* The list's speaker mark, if any, follows DESIGN.md.
