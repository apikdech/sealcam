# Playback clip fixtures

These fixtures are for the engineers who write playback and end-to-end tests. They are a real
clip that the relay pipeline (`app.Run`) recorded into MinIO over the S3 multipart path, and two
variants of that clip. The playback engine tests (`web/e2e/playback.spec.ts`) and later
end-to-end tests use them.

| Directory | What it is |
|---|---|
| `complete/` | The recorded clip: `zrec.sidecar/2` `status: complete`, 34.3 s, 640x360 H.264 (`avc1.640016`), 36 chunks of 64 KiB, one seek-index entry per 2 s GOP. |
| `tamper/` | `complete/` with one ciphertext bit flipped in chunk 18 (`manifest.json` `tamper_chunk`). Chunks 0-17 authenticate, chunk 18 fails with `ErrAuth`. |
| `incomplete/` | `complete/` cut in the middle of its final chunk, with the sidecar of a recovered clip (Contract §7.4): `status: incomplete`, `end_reason: recovered`, null `end_time`, `duration_ms`, `plaintext_size_bytes` and `seek_index`, empty `triggers`. The reader reports `ErrTruncated` on the last chunk. |

| `audio/` | A separate short clip with sound: `zrec.sidecar/2` `status: complete`, 11.3 s, 14 chunks of 64 KiB, the same 640x360 H.264 video plus a G.711 A-law track (sidecar `audio`: `PCMA`, 8000 Hz, mono). The test camera sends a 1 kHz beep (about -6 dBFS) for 100 ms at each IDR and silence between beeps. It has its own `clip_id` and start time (`manifest.json` `audio`). |

`complete/`, `tamper/` and `incomplete/` share one `clip_id`, camera (`front-door`) and key. `audio/` has its own `clip_id` and the same camera and key. Each one is a separate storage tree.

The trees have the layout of a `local` driver `base_dir`. They are the committed S3 objects,
copied out with GETs. `zview-server` serves this layout in tests. For example, point
`zview-server` at `testdata/clips/complete` with `storage.root: zrelay`.

> **Caution:** Copy the tree first. Do not serve the checked-in tree directly from a test.

`manifest.json` holds these values:

- `master_key`: the Contract §4.5 vector key `00..1f`. Thus `k_api_sha256` is
  `testdata/zrec/v1/vectors.json` `derived.k_api_sha256_hex`.
- The clip id.
- `tamper_chunk`.
- `tamper_fail_at_ms`: the media time of the last fragment that starts at or before the tampered
  chunk.
- `audio`: the clip id, start time, duration, chunk count and audio codec of the `audio/` variant.

This key protects only these synthetic frames, and it is public.

The picture (in all four) is the synthetic `testsrc2` pattern of `testdata/video/h264-640x360-gop2-10s.h264`,
in a loop. It is never real footage.

## Regenerate

Docker must be running. The generator starts a throwaway MinIO container
(`storagetest.StartMinIO`).

```sh
ZRELAY_FIXTURES_OUT=$PWD/testdata/clips \
  go test -tags fixtures -run TestGenerateClipFixtures -count=1 -timeout 5m ./internal/relay/app
```

The generator is `internal/relay/app/fixtures_gen_test.go`. It has the build tag `fixtures`, so
`make test` does not run it. The generator does these things:

1. It starts the in-process RTSP test server, which loops the H.264 fixture.
2. It starts the fake ONVIF camera and the MinIO container.
3. It runs the real `app.Run` with `storage.driver: s3` against them.
4. It holds a motion trigger for 33 s.
5. It reads the committed video and sidecar objects back with S3 GETs.
6. It writes them under `<variant>/zrelay/clips/...` (the layout of the `local` driver).
7. It derives the two variants from those bytes.

The run takes about 35 s, plus the MinIO image pull on a first run. Regeneration changes the clip
id and the start time. Thus commit `manifest.json` and all three trees together. This command keeps
the `audio` entry of `manifest.json`.

### Regenerate the audio variant

The `audio/` variant has its own generator. It does not touch the other three trees. Run it after the
main generator, because it reads and updates `manifest.json`.

```sh
ZRELAY_FIXTURES_OUT=$PWD/testdata/clips \
  go test -tags fixtures -run TestGenerateAudioClipFixture -count=1 -timeout 5m ./internal/relay/app
```

It runs the same pipeline with `record_audio: true` and the test camera option `AudioBeeps`. It waits
4 s before the motion trigger, because in arrival-time mode the relay forwards no audio for the first
2 s of media time, and a clip that opens without audio gets no audio track later. It holds the trigger
for 8 s. The run takes about 15 s. Regeneration changes the clip id and the start time. Thus commit
the `audio/` tree and `manifest.json` together.

## Verify a variant

Use the decryptor. The `ZK` value is `master_key` from `manifest.json`.

```sh
export ZK=zk1-000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f-2418
go run ./cmd/zdecrypt --key ENV:ZK --in testdata/clips/complete/zrelay/clips/front-door/<day>/<name>.zrec --out clip.mp4
```

Expected results:

- `tamper/` exits 2 with `chunk authentication failed: chunk 18`.
- `incomplete/` exits 2.
- If you add `--allow-incomplete`, `incomplete/` writes the verified prefix.
