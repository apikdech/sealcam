#!/bin/sh
# Build and start the zrelay and zview-server containers (design §8.3).
# TAILSCALE_IP is taken from `tailscale ip -4` when it is not set.
# COMPOSE_FILE selects the compose files (default deploy/compose.yaml);
# `make local-up` adds deploy/compose.local.yaml.
set -eu
cd "$(dirname "$0")/.."

if [ -z "${TAILSCALE_IP:-}" ]; then
	# The macOS app install puts the CLI inside the app bundle, not on PATH.
	ts=tailscale
	command -v tailscale >/dev/null 2>&1 || ts=/Applications/Tailscale.app/Contents/MacOS/Tailscale
	TAILSCALE_IP=$("$ts" ip -4 2>/dev/null | head -n 1) || TAILSCALE_IP=
fi
if [ -z "$TAILSCALE_IP" ]; then
	echo "deploy.sh: no Tailscale IPv4 address; set TAILSCALE_IP" >&2
	exit 1
fi
export TAILSCALE_IP

# Relay build version, stamped into sidecars and the status object.
if [ -z "${ZRELAY_VERSION:-}" ]; then
	ZRELAY_VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo dev)
fi
export ZRELAY_VERSION

# Both services need their config and secrets before they can start.
for f in .env zrelay.yaml zview.yaml secrets/zrelay_master secrets/s3_secret_key \
	secrets/api_token_sha256 secrets/s3_ro_secret_key; do
	if [ ! -e "deploy/$f" ]; then
		echo "deploy.sh: deploy/$f is missing (see the header of deploy/compose.yaml)" >&2
		exit 1
	fi
done

COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.yaml}"
export COMPOSE_FILE
case "$COMPOSE_FILE" in
*compose.local.yaml*)
	if [ ! -e deploy/secrets/rustfs_root_secret ]; then
		echo "deploy.sh: deploy/secrets/rustfs_root_secret is missing (see the header of deploy/compose.local.yaml)" >&2
		exit 1
	fi
	;;
esac

# Builds and starts the services of the selected compose files.
docker compose up -d --build
