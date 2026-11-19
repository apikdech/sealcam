# Local full stack with one command — design (small change)

**Intent.** Before moving to the remote S3 on the NAS, run the whole system on the Mac mini
with one command and test every feature against the real C220: the production zrelay and
zview-server containers plus a local S3 (RustFS). Today this takes three terminals and the
hand-made `.e2e/` setup.

**Goals.**
- `make local-up` builds and starts RustFS, a one-shot S3 setup job, zrelay and zview-server.
  `make local-down` stops them (the RustFS data volume stays). `make local-logs` follows logs.
- zrelay and zview-server run exactly as in production (`deploy/compose.yaml`: read-only root,
  no volumes, Docker secrets), from the same gitignored `deploy/.env`, `deploy/zrelay.yaml`,
  `deploy/zview.yaml` and `deploy/secrets/`.
- The setup job creates the `cctv` bucket, the policies from `deploy/minio-*-policy.json` and the
  `zrelay` and `zview` users with the secret keys in `deploy/secrets/`, so the keys match by
  construction. It is idempotent; zrelay and zview-server start only after it succeeds.
- Moving to the NAS later = `deploy/deploy.sh` without the local layer, and a new `S3_ENDPOINT`
  and S3 keys.

**Non-goals.** No change to the production compose services, images or configs. No host-binary
mode. No generator for keys or configs (the local values are written once, by hand, below).

**Constraints.** Zero-disk applies to zrelay and zview-server, not to RustFS (it keeps its data in
a named volume). Images pinned to exact versions at least two weeks old: `rustfs/rustfs:1.0.4`,
`pgsty/mc:RELEASE.2026-10-26T00-00-00Z`. RustFS ports on loopback only. No secret values in
committed files.

**Approaches considered.**
1. *Production compose + a local overlay file* — chosen: tests the real images and deployment.
2. Host binaries started by make — faster to iterate, but does not test the images, and
   background process management in make is fragile.

**Decided.**
- New committed `deploy/compose.local.yaml`, used as a second `-f` file over `deploy/compose.yaml`:
  `rustfs` (S3 on `127.0.0.1:9000`, console on `127.0.0.1:9001`, root secret key from the new
  `deploy/secrets/rustfs_root_secret`), `s3-init` (one-shot `mc`), and `depends_on` with
  `service_completed_successfully` for zrelay and zview-server. zview-server is published on
  `127.0.0.1:8081` (`ports: !override`), because 8080 is taken on this Mac.
- `deploy/deploy.sh` uses `COMPOSE_FILE` when it is set (default `deploy/compose.yaml`); the make
  targets set it to both files. Its file checks also require `secrets/rustfs_root_secret` when
  the local file is in use.
- One-time local values, written by hand into the gitignored `deploy/` files from `.e2e/` (same
  master key, so the browser keeps working): `S3_ENDPOINT=http://rustfs:9000`, live and restream
  on `0.0.0.0` inside the container, `advertise_ip: ENV:TAILSCALE_IP`. Afterwards the old
  `zrelay-e2e-rustfs` container is removed (its test clips are not migrated) and `.e2e/` is left
  for the user to delete.
- A short README section, "Run the full stack on your Mac", in the project's STE style.
- Verified already: on OrbStack a non-root container reads a 0600 compose secret file.

**Left to the builder.** How RustFS gets its secret from the file (for example a `sh -c` wrapper
that exports it), how `s3-init` tolerates "already exists", and a Go test in `deploy/` (like
`policy_test.go`) that pins the overlay's safety properties: pinned image tags, loopback-only
RustFS ports, no literal secrets, and the start order.
