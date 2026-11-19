# Local Full-Stack Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `make local-up` starts RustFS, an S3 setup job, zrelay and zview-server (the production containers) on the Mac mini; `make local-down` stops them.

**Architecture:** A committed overlay `deploy/compose.local.yaml` adds `rustfs` and a one-shot `s3-init` to the unchanged `deploy/compose.yaml`. `deploy/deploy.sh` learns to use `COMPOSE_FILE` (and the macOS Tailscale app CLI); the Makefile sets `COMPOSE_FILE` to both files. The local values live in the gitignored `deploy/.env`, `deploy/zrelay.yaml`, `deploy/zview.yaml` and `deploy/secrets/`.

**Tech Stack:** Docker Compose 5.5 (OrbStack), POSIX sh, make, Go tests (`go.yaml.in/yaml/v3`, already in go.mod).

**Spec:** `docs/superpowers/specs/2026-11-19-local-compose-design.md`

## Global Constraints

- Images pinned exactly: `rustfs/rustfs:1.0.4`, `pgsty/mc:RELEASE.2026-10-26T00-00-00Z`.
- RustFS published on loopback only: `127.0.0.1:9000:9000` (S3), `127.0.0.1:9001:9001` (console). Data in the named volume `rustfs-data`.
- zview-server published on `127.0.0.1:8081:8080/tcp` in the overlay, replacing (`!override`) the production `127.0.0.1:8080` mapping.
- No secret values in committed files. The RustFS root secret is the new file `deploy/secrets/rustfs_root_secret`; the RustFS root access key is the literal `rustfsadmin` (not secret).
- `deploy/compose.yaml`, the Dockerfiles and the example configs are not changed.
- Zero-disk applies to zrelay and zview-server only; RustFS may keep data in its volume.
- README text follows the project's STE style (load the `ste-writing` skill before writing it).

## Review Focus

1. Running `make local-up` a second time (bucket, policies, users already exist): `s3-init` must exit 0 and the stack must come up — pinned by Task 2 Step 5.
2. `make local-down` must keep the recordings: no `-v` / `--volumes` — pinned by Task 1 test `TestMakeLocalDownKeepsVolumes`.
3. A missing `deploy/secrets/rustfs_root_secret`: `deploy.sh` must name the missing file, not fail inside compose — pinned by Task 1 test `TestDeployScriptChecksRustFSSecretForLocal`.
4. Production `deploy/deploy.sh` with no `COMPOSE_FILE` must still use only `deploy/compose.yaml` — pinned by Task 1 test `TestDeployScriptDefaultsToProductionCompose`.
5. No `tailscale` command on PATH (macOS app install): `deploy.sh` must fall back to `/Applications/Tailscale.app/Contents/MacOS/Tailscale` — pinned by Task 1 test `TestDeployScriptFindsMacTailscaleApp`.

---

### Task 1: Overlay, deploy.sh and make targets

**Files:**
- Create: `deploy/compose.local.yaml`
- Modify: `deploy/deploy.sh`
- Modify: `Makefile` (new targets `local-up`, `local-down`, `local-logs`; add them to `.PHONY`)
- Test: `deploy/local_compose_test.go` (package `deploy_test`; reuse `readFile` from `version_test.go`)

**Interfaces:**
- Produces: services `rustfs`, `s3-init`; secret names `rustfs_root_secret`, plus the existing `s3_secret_key`, `s3_ro_secret_key`; volume `rustfs-data`; make targets `local-up`, `local-down`, `local-logs`. Inside the compose network the S3 endpoint is `http://rustfs:9000`.

- [ ] **Step 1: Write the failing tests** in `deploy/local_compose_test.go`. Parse `compose.local.yaml` into a `yaml.Node` (so the `!override` tag is visible) or into a small struct where convenient.
  - `TestLocalComposePinsImages`: the set of `image:` values is exactly `{"rustfs/rustfs:1.0.4", "pgsty/mc:RELEASE.2026-10-26T00-00-00Z"}`.
  - `TestLocalComposeRustFSLoopbackOnly`: every `rustfs` port starts with `127.0.0.1:`, and the list is `["127.0.0.1:9000:9000", "127.0.0.1:9001:9001"]`.
  - `TestLocalComposeHasNoSecretValues`: no `environment` entry of any service has a name containing `SECRET` or `PASSWORD`; `rustfs` lists secret `rustfs_root_secret`; `s3-init` lists `rustfs_root_secret`, `s3_secret_key`, `s3_ro_secret_key`; top-level `secrets.rustfs_root_secret.file` is `./secrets/rustfs_root_secret`.
  - `TestLocalComposeStartOrder`: `rustfs` has a `healthcheck`; `s3-init.depends_on.rustfs.condition == "service_healthy"`; `zrelay` and `zview-server` both have `depends_on.s3-init.condition == "service_completed_successfully"`.
  - `TestLocalComposeMovesZviewTo8081`: `zview-server.ports` carries tag `!override` and equals `["127.0.0.1:8081:8080/tcp"]`.
  - `TestLocalComposeInitUsesRepoPolicies`: `s3-init` mounts `./minio-relay-policy.json` and `./minio-zview-policy.json` read-only (`:ro`).
  - `TestDeployScriptDefaultsToProductionCompose`: `deploy.sh` contains `COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.yaml}"` and `export COMPOSE_FILE`, and no longer contains `-f deploy/compose.yaml`.
  - `TestDeployScriptChecksRustFSSecretForLocal`: `deploy.sh` checks `secrets/rustfs_root_secret` only when `COMPOSE_FILE` contains `compose.local.yaml` (match a `case "$COMPOSE_FILE" in *compose.local.yaml*)` branch that mentions `secrets/rustfs_root_secret`).
  - `TestDeployScriptFindsMacTailscaleApp`: `deploy.sh` contains `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.
  - `TestMakeLocalTargets` (reads `../Makefile`): `local-up` recipe runs `deploy/deploy.sh` with `COMPOSE_FILE=deploy/compose.yaml:deploy/compose.local.yaml`; `local-logs` runs `logs -f`.
  - `TestMakeLocalDownKeepsVolumes`: the `local-down` recipe runs `down` and contains neither `-v` nor `--volumes`.

- [ ] **Step 2: Run to verify they fail**

  Run: `go test ./deploy/ -run 'Local|DeployScript(Defaults|Checks|Finds)|MakeLocal' -v`
  Expected: FAIL (`compose.local.yaml` missing; `deploy.sh` and `Makefile` lack the new text). Existing deploy tests still pass.

- [ ] **Step 3: Write `deploy/compose.local.yaml`**
  - `rustfs`: image as pinned; env `RUSTFS_ACCESS_KEY=rustfsadmin`, `RUSTFS_VOLUMES=/data`, `RUSTFS_ADDRESS=:9000`, `RUSTFS_CONSOLE_ENABLE=true`, `RUSTFS_CONSOLE_ADDRESS=:9001`; the secret key is read from `/run/secrets/rustfs_root_secret` by an `entrypoint: ["sh","-c", ...]` wrapper that exports `RUSTFS_SECRET_KEY` and `exec`s the image's original command (check it with `docker image inspect rustfs/rustfs:1.0.4`); volume `rustfs-data:/data`; healthcheck `nc -z 127.0.0.1 9000` (the image has `nc`, not curl/wget); `restart: unless-stopped`.
  - `s3-init`: mc image; `restart: "no"`; mounts the two policy files at `/policies/*.json:ro`; secrets as tested; an `entrypoint: ["sh","-c", ...]` that sets `MC_HOST_local=http://rustfsadmin:<root secret>@rustfs:9000` from the secret file, then: `mc mb --ignore-existing local/cctv`; `mc admin policy create` for `zrelay-relay` and `zrelay-zview` (re-create is fine); `mc admin user add` for `zrelay` and `zview` with the secret-file values; `mc admin policy attach` each, tolerating an "already attached" failure only for that command (e.g. `|| mc admin policy entities local --user <u> | grep -q <policy>`). `set -e` otherwise. These exact mc commands were verified against RustFS 1.0.4 on 2026-11-19 (including that it enforces the relay's no-delete rule).
  - `zrelay`, `zview-server`: only `depends_on` as tested; `zview-server.ports: !override [...]`.
  - Top-level `secrets.rustfs_root_secret.file: ./secrets/rustfs_root_secret`; `volumes: { rustfs-data: {} }`.
  - A header comment in the style of `compose.yaml`: what the overlay adds, how to run it (`make local-up`), the extra secret file, `S3_ENDPOINT=http://rustfs:9000`.

- [ ] **Step 4: Change `deploy/deploy.sh`**
  - Tailscale: if `TAILSCALE_IP` is unset, use `tailscale` when on PATH, else `/Applications/Tailscale.app/Contents/MacOS/Tailscale`; keep the existing error when neither gives an address.
  - `COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.yaml}"`, `export COMPOSE_FILE`; final command `docker compose up -d --build` (compose reads the files from `COMPOSE_FILE`; the project directory stays `deploy/`, the first file's directory).
  - After the existing file checks: `case "$COMPOSE_FILE" in *compose.local.yaml*) check deploy/secrets/rustfs_root_secret with the same message style ;; esac`.

- [ ] **Step 5: Add make targets** (shared variable `LOCAL_COMPOSE = deploy/compose.yaml:deploy/compose.local.yaml`):
  - `local-up`: `COMPOSE_FILE=$(LOCAL_COMPOSE) deploy/deploy.sh`
  - `local-down`: `COMPOSE_FILE=$(LOCAL_COMPOSE) TAILSCALE_IP=$${TAILSCALE_IP:-0.0.0.0} docker compose down` (interpolation needs a value; `down` does not use it)
  - `local-logs`: same env, `docker compose logs -f`
  - One comment line above each, as for the existing targets.

- [ ] **Step 6: Run to verify they pass, plus a compose syntax check**

  Run: `go test ./deploy/ -v 2>&1 | tail -20`
  Expected: PASS (all deploy tests, old and new).
  Run: `TAILSCALE_IP=127.0.0.1 S3_ENDPOINT=x S3_RO_ACCESS_KEY=x docker compose -f deploy/compose.yaml -f deploy/compose.local.yaml config --no-interpolate -q`
  Expected: exit 0, no output. (Needs the files from Task 2 Step 1 only for `up`, not for `config --no-interpolate`; if compose still insists on the secret/config files, create empty placeholders in a scratch copy, not in `deploy/`.)

- [ ] **Step 7: Commit**

  ```bash
  git add deploy/compose.local.yaml deploy/deploy.sh deploy/local_compose_test.go Makefile
  git commit -m "feat(deploy): local full stack overlay with RustFS and make local-up"
  ```

### Task 2: Local values, bring-up and README

**Files:**
- Gitignored, written by hand (never committed, never printed): `deploy/.env`, `deploy/zrelay.yaml`, `deploy/zview.yaml`, `deploy/secrets/{zrelay_master,api_token_sha256,s3_secret_key,s3_ro_secret_key,rustfs_root_secret}`
- Modify: `README.md` (new section after "Try it on your computer (no camera, no NAS)")

**Interfaces:**
- Consumes: Task 1's services, secret names, make targets and the in-network endpoint `http://rustfs:9000`.

- [ ] **Step 1: Write the local values** with `umask 077`, copying secrets file-to-file (no secret on a command line or in output):
  - `deploy/secrets/*`: copy the five files from `.e2e/secrets/` (`zrelay_master`, `api_token_sha256`, `s3_secret_key`, `s3_ro_secret_key`, `rustfs_root_secret`).
  - `deploy/.env`: from `.e2e/.env`, but `S3_ENDPOINT=http://rustfs:9000`; keep `CAMERA_*`, `S3_ACCESS_KEY=zrelay`, `S3_RO_ACCESS_KEY=zview`, `RESTREAM_*`.
  - `deploy/zrelay.yaml`: copy `deploy/zrelay.example.yaml`; set `relay.id: "home-mini"` (as in the example), `relay.http_listen: "0.0.0.0:9464"` (compose header requirement). Keep `live.listen: "0.0.0.0:9465"`, `advertise_ip: "ENV:TAILSCALE_IP"`, `restream.listen: "0.0.0.0:8554"`, the `/run/secrets/...` references.
  - `deploy/zview.yaml`: copy `deploy/zview.example.yaml` unchanged (`upstream: http://zrelay:9465`, `/run/secrets/...`).
  - `chmod 600 deploy/.env`.

- [ ] **Step 2: Free the ports.** Stop any host `bin/zrelay` / `bin/zview-server` processes started from `.e2e/` (ask the user to Ctrl-C them if they are in the user's terminal), then `docker rm -f zrelay-e2e-rustfs`. Keep its volume `zrelay-e2e-rustfs` (the user may delete it).

- [ ] **Step 3: Start the stack** (`config check` cannot run on the host here: the config reads `/run/secrets/...`, and the `scratch` images have no shell, so Step 4's checks and logs are the validation)

  Run: `make local-up`
  Expected: builds both images; `s3-init` exits 0; `rustfs`, `zrelay`, `zview-server` running.

- [ ] **Step 4: Verify the running stack**

  Run: `docker compose -p zrelay ps -a` → `s3-init` "Exited (0)", the others "Up".
  Run: `curl -s 127.0.0.1:9464/healthz` → `ok`; `curl -s 127.0.0.1:9464/metrics | grep -E 'camera_(rtsp|events)_up'` → both `1` (if 0, see the runbook's OrbStack Local Network section and tell the user).
  Run: `curl -s -o /dev/null -w '%{http_code}' 127.0.0.1:8081/` → `200`; `/api/v1/status` without a token → `401`.
  Run: `make local-logs` briefly → no `ERROR` lines from zrelay or zview-server.

- [ ] **Step 5: Verify a second `make local-up` is idempotent**

  Run: `make local-up` again.
  Expected: `s3-init` "Exited (0)" again; all services up; no recreate loop.

- [ ] **Step 6: README section** "Run the full stack on your Mac" (STE style): what it starts; one-time files (the production files in `deploy/` plus `deploy/secrets/rustfs_root_secret`, with `S3_ENDPOINT=http://rustfs:9000`); `make local-up`, `make local-logs`, `make local-down`; open `http://127.0.0.1:8081`; the RustFS console on `http://127.0.0.1:9001` (user `rustfsadmin`); `make local-down` keeps the recordings, `docker volume rm zrelay_rustfs-data` deletes them; to move to the NAS run `deploy/deploy.sh` and change `S3_ENDPOINT` and the S3 keys. Add the three targets to the Development table.

- [ ] **Step 7: Run the full checks and commit**

  Run: `make vet && go test ./deploy/ && make web`
  Expected: PASS.
  ```bash
  git add README.md
  git commit -m "docs: run the full stack on a Mac with make local-up"
  ```
