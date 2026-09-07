#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: run-zcode.sh --cwd <directory> --prompt <task> [options]

Windows requirements:
  Run this script from Git Bash for Windows, not WSL or PowerShell.

Options:
  --mode <plan|build|edit|yolo>   Permission mode (default: plan)
  --model <provider-id/model-id>  Use a configured model for this run only
  --effort <level>                Use a supported effort for this run only
  --help                          Show this message

Model and effort overrides use a temporary USERPROFILE/HOME with a copied CLI
config and never modify the persistent ZCode CLI configuration.
EOF
}

fail() {
  printf 'run-zcode-windows: %s\n' "$*" >&2
  exit 2
}

WORK_DIR=""
PROMPT_TEXT=""
MODE="plan"
REQUESTED_MODEL=""
REQUESTED_EFFORT=""

while (($#)); do
  case "$1" in
    --cwd)
      (($# >= 2)) || fail "--cwd needs a directory"
      WORK_DIR="$2"
      shift 2
      ;;
    --prompt)
      (($# >= 2)) || fail "--prompt needs task text"
      PROMPT_TEXT="$2"
      shift 2
      ;;
    --mode)
      (($# >= 2)) || fail "--mode needs a value"
      MODE="$2"
      shift 2
      ;;
    --model)
      (($# >= 2)) || fail "--model needs provider-id/model-id"
      REQUESTED_MODEL="$2"
      shift 2
      ;;
    --effort)
      (($# >= 2)) || fail "--effort needs a level"
      REQUESTED_EFFORT="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

[[ -n "$WORK_DIR" ]] || fail "--cwd is required"
[[ -n "$PROMPT_TEXT" ]] || fail "--prompt is required"
case "$MODE" in plan|build|edit|yolo) ;; *) fail "unsupported mode: $MODE" ;; esac

case "$(uname -s 2>/dev/null || true)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *) fail "run this Windows module from Git Bash for Windows; WSL and PowerShell are not supported" ;;
esac

command -v cygpath >/dev/null 2>&1 || fail "cygpath not found; install Git Bash for Windows"

to_posix_path() {
  local value="$1"
  if [[ "$value" =~ ^[[:alpha:]]:[\\/].* || "$value" == \\\\* ]]; then
    cygpath -u -- "$value"
  else
    printf '%s\n' "$value"
  fi
}

to_windows_path() {
  cygpath -w -- "$1"
}

WORK_DIR="$(to_posix_path "$WORK_DIR")"
[[ -d "$WORK_DIR" ]] || fail "directory does not exist: $WORK_DIR"

USER_HOME_RAW="${USERPROFILE:-${HOME:?USERPROFILE or HOME is required}}"
USER_HOME_DIR="$(to_posix_path "$USER_HOME_RAW")"
CONFIG_PATH_RAW="${ZCODE_CONFIG_PATH:-$USER_HOME_DIR/.zcode/cli/config.json}"
CONFIG_PATH="$(to_posix_path "$CONFIG_PATH_RAW")"
CLI_PATH_RAW="${ZCODE_CLI_PATH:-}"
NODE_RUNTIME="${ZCODE_NODE_BIN:-node}"
if [[ "$NODE_RUNTIME" == */* || "$NODE_RUNTIME" == *\\* ]]; then
  NODE_RUNTIME="$(to_posix_path "$NODE_RUNTIME")"
fi

[[ -f "$CONFIG_PATH" ]] || fail "CLI configuration not found: $CONFIG_PATH"
command -v "$NODE_RUNTIME" >/dev/null 2>&1 || [[ -x "$NODE_RUNTIME" ]] || fail "Node.js runtime not found: $NODE_RUNTIME"

if [[ -n "$CLI_PATH_RAW" ]]; then
  CLI_PATH="$(to_posix_path "$CLI_PATH_RAW")"
else
  CLI_PATH=""
  CLI_CANDIDATES=(
    "/d/ZCode/resources/glm/zcode.cjs"
    "/c/ZCode/resources/glm/zcode.cjs"
    "/c/Program Files/ZCode/resources/glm/zcode.cjs"
    "$USER_HOME_DIR/AppData/Local/Programs/ZCode/resources/glm/zcode.cjs"
    "$USER_HOME_DIR/AppData/Local/ZCode/resources/glm/zcode.cjs"
  )
  for candidate in "${CLI_CANDIDATES[@]}"; do
    if [[ -f "$candidate" ]]; then
      CLI_PATH="$candidate"
      break
    fi
  done
fi

[[ -n "$CLI_PATH" && -f "$CLI_PATH" ]] || fail "ZCode CLI not found; set ZCODE_CLI_PATH (for example D:\\ZCode\\resources\\glm\\zcode.cjs)"

CONFIG_PATH_WIN="$(to_windows_path "$CONFIG_PATH")"
CLI_PATH_WIN="$(to_windows_path "$CLI_PATH")"
WORK_DIR_WIN="$(to_windows_path "$WORK_DIR")"

TARGET_MODEL="$REQUESTED_MODEL"
if [[ -z "$TARGET_MODEL" ]]; then
  TARGET_MODEL="$("$NODE_RUNTIME" - "$CONFIG_PATH_WIN" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!config.model || typeof config.model.main !== 'string') {
  process.exit(2);
}
process.stdout.write(config.model.main);
NODE
)" || fail "config has no model.main"
fi

[[ "$TARGET_MODEL" == */* ]] || fail "model must use provider-id/model-id"
PROVIDER_ID="${TARGET_MODEL%%/*}"
MODEL_ID="${TARGET_MODEL#*/}"
[[ -n "$PROVIDER_ID" && -n "$MODEL_ID" ]] || fail "model must use provider-id/model-id"

"$NODE_RUNTIME" - "$CONFIG_PATH_WIN" "$PROVIDER_ID" "$MODEL_ID" "$REQUESTED_EFFORT" <<'NODE'
const fs = require('fs');
const [file, providerId, modelId, effort] = process.argv.slice(2);
let config;
try {
  config = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  process.stderr.write('CLI configuration is not valid JSON\n');
  process.exit(2);
}
const model = config?.provider?.[providerId]?.models?.[modelId];
if (!model) {
  process.stderr.write(`configured model not found: ${providerId}/${modelId}\n`);
  process.exit(2);
}
if (effort) {
  if (!model.reasoning?.levels?.includes(effort)) {
    process.stderr.write(`effort '${effort}' is not supported by ${providerId}/${modelId}\n`);
    process.exit(2);
  }
  if (!model.reasoning?.providerOptionsByLevel?.[effort]) {
    process.stderr.write(`effort '${effort}' has no verified provider request mapping for ${providerId}/${modelId}\n`);
    process.exit(2);
  }
}
NODE

RUN_HOME_DIR=""
cleanup() {
  if [[ -n "$RUN_HOME_DIR" && -d "$RUN_HOME_DIR" ]]; then
    rm -rf -- "$RUN_HOME_DIR"
  fi
}
trap cleanup EXIT

if [[ -n "$REQUESTED_MODEL" || -n "$REQUESTED_EFFORT" ]]; then
  umask 077
  RUN_HOME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zcode-cli-home.XXXXXX")"
  mkdir -p "$RUN_HOME_DIR/.zcode/cli"
  RUN_CONFIG_PATH="$RUN_HOME_DIR/.zcode/cli/config.json"
  RUN_HOME_WIN="$(to_windows_path "$RUN_HOME_DIR")"
  RUN_CONFIG_WIN="$(to_windows_path "$RUN_CONFIG_PATH")"

  "$NODE_RUNTIME" - "$CONFIG_PATH_WIN" "$RUN_CONFIG_WIN" "$TARGET_MODEL" "$PROVIDER_ID" "$MODEL_ID" "$REQUESTED_EFFORT" <<'NODE'
const fs = require('fs');
const [input, output, targetModel, providerId, modelId, effort] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(input, 'utf8'));
config.model = config.model || {};
config.model.main = targetModel;
if (effort) {
  config.provider[providerId].models[modelId].reasoning.defaultLevel = effort;
}
fs.writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
NODE
  # chmod is retained for parity with macOS; on NTFS the effective protection
  # comes from the user's profile ACL rather than POSIX mode bits.
  chmod 600 "$RUN_CONFIG_PATH" 2>/dev/null || true
fi

COMMAND=("$NODE_RUNTIME" "$CLI_PATH_WIN" --mode "$MODE" --cwd "$WORK_DIR_WIN" --prompt "$PROMPT_TEXT")
if [[ -n "$RUN_HOME_DIR" ]]; then
  # Node on Windows resolves os.homedir() from USERPROFILE. HOME is also set
  # because Git Bash and some bundled tools use it instead.
  RUN_HOME_DRIVE="${RUN_HOME_WIN:0:2}"
  RUN_HOME_PATH="${RUN_HOME_WIN:2}"
  HOME="$RUN_HOME_WIN" USERPROFILE="$RUN_HOME_WIN" \
    HOMEDRIVE="$RUN_HOME_DRIVE" HOMEPATH="$RUN_HOME_PATH" \
    "${COMMAND[@]}"
else
  "${COMMAND[@]}"
fi
