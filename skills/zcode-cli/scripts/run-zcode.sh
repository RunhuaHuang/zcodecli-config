#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$SCRIPT_DIR/zcode.mjs"
NODE_RUNTIME="${ZCODE_NODE_BIN:-node}"
if command -v cygpath >/dev/null 2>&1; then
  RUNNER="$(cygpath -w "$RUNNER")"
fi
# Preserve prompt text; native paths are interpreted by the shared Node runner.
MSYS2_ARG_CONV_EXCL='*' exec "$NODE_RUNTIME" "$RUNNER" run "$@"
