#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$SCRIPT_DIR/../../zcode-cli/scripts/run-zcode.sh"
if [[ ! -f "$RUNNER" ]]; then
  printf '%s\n' 'UNIFIED_SKILL_REQUIRED: install the zcode-cli folder; the legacy Windows folder is only a forwarding entry.' >&2
  exit 2
fi
exec bash "$RUNNER" "$@"
