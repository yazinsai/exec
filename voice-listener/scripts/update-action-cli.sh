#!/usr/bin/env bash
# Wrapper to run update-action-cli.ts via bun
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bun run "$SCRIPT_DIR/update-action-cli.ts" "$@"
