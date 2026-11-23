# Sealcam

Sealcam is a private camera recorder for your home. It records a short clip when your camera sees
motion or a person, encrypts the clip, and lets your household watch it on a phone.

Sealcam is for people who want to keep their camera video on their own hardware, not in a vendor
cloud. Only the people who hold your key can watch the recordings.

## What you get

- **Event clips.** A clip starts a few seconds before the event and stops a few seconds after it.
- **End-to-end encryption.** Each clip is encrypted before it leaves the recorder. The storage
  and the web server never see the video or the key.
- **Proof that a clip is genuine.** zview checks each clip while it plays. A seal next to the clip
  shows if the recording is verified, cut short, or changed.
- **Live view.** Watch the cameras now, in the same screen as the recordings.
- **A phone app for the family.** zview installs on the home screen of a phone. Family members
  import the key once with a QR code.
- **Your own network only.** All access goes through Tailscale. Nothing is open to the internet.

## How it works

Sealcam has two parts:

- **zrelay** is the recorder. It connects to your cameras, records clips, encrypts them, and
  stores them in S3-compatible storage. It also gives live video.
- **zview** is the viewer. It is a web app. Your browser decrypts and plays the clips.

```
Camera ──video + events──► zrelay ──encrypted clips──► S3 storage (for example MinIO)
                             │
                             └── live video
                                     │
Phone or computer ◄──HTTPS (Tailscale)── zview-server ◄──read-only── S3 storage
```

zrelay never writes video to disk. If the storage is not available, zrelay keeps the clips in
memory and sends them later.

## What you need

- A camera that supports RTSP video and ONVIF events. Sealcam is tested with a Tapo C220.
- An always-on computer (the host) that runs Docker. zrelay and zview-server run on it.
- S3-compatible storage, for example MinIO on a NAS.
- A Tailscale network (tailnet) for the host and the phones.

To try Sealcam without a camera, you need only Go and Node.js (see the next section).

## Try it without a camera

The demo starts a simulated camera on your computer. The camera sends a test video in a loop and
reports motion and a person every 60 seconds.

**Prerequisites:** Go 1.27, Node.js 26, and pnpm 12.

1. In terminal 1, start the simulated camera:
   ```bash
   make demo
   ```
   The demo writes its files to `.demo/` and shows a temporary key.
2. In terminal 2, start the recorder:
   ```bash
   go run ./cmd/zrelay --env-file .demo/.env run --config .demo/zrelay.yaml
   ```
3. Build the web app one time:
   ```bash
   (cd web && pnpm install && pnpm build)
   ```
4. In terminal 3, start the viewer:
   ```bash
   go run ./cmd/zview-server --config .demo/zview.yaml
   ```
5. Open <http://127.0.0.1:8080>.
6. Paste the key from terminal 1.

The first event comes one minute after the demo starts. Its clip shows in the event list a few
seconds after the event stops.

> **Note:** For the first minute, the recorder status can show that the camera is offline. The
> status updates every 60 seconds.

You can also play the live restream in VLC: `rtsp://demo:demo@127.0.0.1:8554/demo-cam`.

The demo stores clips on the local disk and uses only `127.0.0.1`. A real installation uses S3
storage and Tailscale.

## Install Sealcam at home

[`deploy/runbook.md`](deploy/runbook.md) has the full procedure. These are the main steps:

1. Prepare the S3 storage: a bucket, a user for zrelay, a read-only user for zview, and a
   retention rule.
2. Make the master key and the API token hash.

   > **Warning:** Keep a copy of the master key in a password manager. If you lose the key, you
   > cannot decrypt the recordings.

3. Copy the example files and add your values (see "Configure Sealcam").
4. Check the configuration:
   ```bash
   TAILSCALE_IP=$(tailscale ip -4 | head -n 1) docker compose -f deploy/compose.yaml run --rm --no-deps \
     --entrypoint /zrelay zrelay config check --config /etc/zrelay/zrelay.yaml
   ```
   The command shows the memory budget and the key fingerprint.
5. Start the containers:
   ```bash
   deploy/deploy.sh
   ```
6. Give zview an HTTPS address on your tailnet with `tailscale serve`.
7. Give the key to the family phones with a QR code. See
   [`docs/family-onboarding.md`](docs/family-onboarding.md).

> **Note:** If the host runs macOS, give the Docker app (for example OrbStack or Docker Desktop)
> the Local Network permission. Without it, zrelay cannot connect to the camera.

To check which events your camera sends, run `zrelay onvif discover`.

### Test everything on one computer first

`make local-up` starts the real containers together with a local S3 server (RustFS). Use it to
test with your camera before you connect your own storage.

**Prerequisites:** Docker, Tailscale, and the files in `deploy/` from steps 2 and 3 above.

1. In `deploy/.env`, set `S3_ENDPOINT=http://rustfs:9000`.
2. In `deploy/zrelay.yaml`, set `relay.http_listen` to `"0.0.0.0:9464"`.
3. Make a secret key for the RustFS root user:
   ```bash
   (umask 077; openssl rand -hex 20 > deploy/secrets/rustfs_root_secret)
   ```
4. Start the stack:
   ```bash
   make local-up
   ```
5. Open <http://127.0.0.1:8081> and import your master key.

> **Warning:** `docker volume rm zrelay_rustfs-data` deletes all recordings in RustFS.

- `make local-logs` shows the logs.
- `make local-down` stops the stack. The recordings stay in the RustFS volume.

To move to the NAS or other S3 storage, do these steps:
1. Stop the local stack with `make local-down`.
2. Change `S3_ENDPOINT` in `deploy/.env`.
3. Change the S3 secret keys in `deploy/secrets/`.
4. Start the stack with `deploy/deploy.sh`.

## Configure Sealcam

Start from the example files. Copy each file and remove `.example` from the name:

- [`deploy/.env.example`](deploy/.env.example)
- [`deploy/zrelay.example.yaml`](deploy/zrelay.example.yaml)
- [`deploy/zview.example.yaml`](deploy/zview.example.yaml)

The configuration files never hold a secret as plain text. A secret value is a reference:

- `ENV:NAME` reads the value from `deploy/.env`.
- `FILE:/path` reads the value from a file in `deploy/secrets/`.

Git ignores `deploy/.env`, `deploy/zrelay.yaml`, `deploy/zview.yaml`, and `deploy/secrets/`, so
you cannot commit them by mistake.

| Setting | Where to put it |
|---|---|
| Camera address, user name, password | `deploy/.env`: `CAMERA_IP`, `CAMERA_USERNAME`, `CAMERA_PASSWORD` |
| Camera RTSP port and path, ONVIF port | `deploy/zrelay.yaml` → `cameras[].rtsp`, `cameras[].events`. For example, a Tapo C220 uses port 554, path `/stream1`, and ONVIF port 2020. |
| More cameras | One more entry under `cameras:` in `zrelay.yaml`, with its own `ENV:` names in `.env`. |
| S3 address | `deploy/.env`: `S3_ENDPOINT` |
| S3 bucket, region, root prefix | `zrelay.yaml` and `zview.yaml` → `storage`. Use the same values in the two files. |
| zrelay S3 keys | Access key: `.env` → `S3_ACCESS_KEY`. Secret key: `deploy/secrets/s3_secret_key`. |
| zview read-only S3 keys | Access key: `.env` → `S3_RO_ACCESS_KEY`. Secret key: `deploy/secrets/s3_ro_secret_key`. |
| Master key (`zk1-…`) | `deploy/secrets/zrelay_master`. `zrelay key generate` makes it. |
| API token hash | `deploy/secrets/api_token_sha256`. `zrelay key api-token-hash` makes it. |
| RTSP restream user name and password | `.env`: `RESTREAM_USER`, `RESTREAM_PASS` |
| Tailscale IP | Do not set it. `deploy/deploy.sh` reads it from `tailscale ip -4`. |
| Pre-roll, post-roll, maximum clip length | `zrelay.yaml` → `defaults`. Each camera can have its own values. |
| How long to keep clips | The storage retention rule and `zview.yaml` → `index.retention_days`. |

## Develop Sealcam

**Prerequisites:** Go 1.27 and Docker. For `web/`, also Node.js 26 and pnpm 12.

| Command | What it does |
|---|---|
| `make test` | Runs the Go tests (`go test -race ./...`). |
| `make vet` | Runs `go vet` and staticcheck. |
| `make integration` | Runs the integration tests. They start MinIO and other test services in Docker. |
| `make web` | Installs, lints, type-checks, and tests the web app. |
| `make web-e2e` | Runs the browser tests (Chromium and WebKit). |
| `make chaos` | Simulates a 10-minute storage outage with three test cameras (about 15 minutes). |
| `make vectors` | Makes the `zrec` test files in `testdata/zrec/v1` again. |
| `make demo` | Starts the demo (see "Try it without a camera"). |
| `make local-up`, `make local-down`, `make local-logs` | Start, stop, and show the logs of the full local stack. |

Run `ffmpeg` and `ffprobe` only from a pinned Docker image. Do not install them on the host.

| Folder | Content |
|---|---|
| `cmd/zrelay`, `internal/relay/` | The recorder. |
| `cmd/zview-server`, `internal/zview/` | The viewer server and its API. |
| `web/` | The zview web app (Svelte). A Web Worker in the browser decrypts the video. |
| `cmd/zdecrypt` | A command-line tool. It checks a `.zrec` clip and decrypts it to MP4. |
| `deploy/` | The Docker files, the example configuration, and the runbook. |

## Learn more

- Install and operate: [`deploy/runbook.md`](deploy/runbook.md)
- Family guide: [`docs/family-onboarding.md`](docs/family-onboarding.md)
- Specifications: [`docs/specs/`](docs/specs/) and the
  [v2 design](docs/superpowers/specs/2026-11-06-zrelay-v2-design.md). If the two do not agree,
  the design is correct.
- Rules for contributors and coding agents: [`AGENTS.md`](AGENTS.md)

## License

MIT. See [`LICENSE`](LICENSE).
