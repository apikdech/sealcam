# Synthetic video fixtures

These are small, synthetic elementary streams for the camera, recorder, live and restream tests.
They are for the engineers who write these tests. ffmpeg generates them in a pinned Docker image
(never a host install) from the `testsrc2` pattern. Thus they contain no real footage.

| File | Codec | Size | Rate | Length | GOP |
|---|---|---|---|---|---|
| `h264-640x360-gop2-10s.h264` | H.264 High, Annex-B | 640x360 | 15 fps | 150 frames (10 s) | IDR every 30 frames (2 s) |
| `h265-640x360-gop2-5s.h265` | H.265 Main, Annex-B | 640x360 | 15 fps | 75 frames (5 s) | IDR every 30 frames (2 s) |

The tests rely on these properties:

* Closed GOPs: keyframes are IDR (H.264 type 5, H.265 IDR_W_RADL/IDR_N_LP), at frames
  0, 30, 60, ... only (`-sc_threshold 0` / `scenecut=0`, `min-keyint` equal to `keyint`).
* No B-frames. Thus decode order equals presentation order (as on Tapo cameras), and the test
  RTSP server can stamp RTP times as `start + i*90000/fps`.
* The parameter sets (VPS/SPS/PPS) are repeated in-band before every IDR.

To regenerate the files, run:

```sh
testdata/video/gen.sh
```

Both files must stay under 2 MiB.

To use them in tests, load them with `testutil.LoadAnnexB(t, path)`. Serve them with
`testutil.StartRTSPServer`.
