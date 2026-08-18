#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: run-zcode.sh --cwd <directory> --prompt <task> [options]

Options:
  --mode <plan|build|edit|yolo>   Permission mode (default: plan)
  --model <provider-id/model-id>  Use a configured model for this run only
  --effort <level>                Use a supported effort for this run only
  --help                          Show this message

Model and effort overrides use a temporary 0600 settings file and never modify
the persistent ZCode CLI configuration.
EOF
}

fail() {
  printf 'run-zcode: %s\n' "$*" >&2
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
[[ -d "$WORK_DIR" ]] || fail "directory does not exist: $WORK_DIR"
[[ -n "$PROMPT_TEXT" ]] || fail "--prompt is required"
case "$MODE" in plan|build|edit|yolo) ;; *) fail "unsupported mode: $MODE" ;; esac

USER_HOME_DIR="${HOME:?HOME is required}"
CONFIG_PATH="${ZCODE_CONFIG_PATH:-$USER_HOME_DIR/.zcode/cli/config.json}"
CLI_PATH="${ZCODE_CLI_PATH:-/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs}"
NODE_RUNTIME="${ZCODE_NODE_BIN:-node}"

[[ -f "$CONFIG_PATH" ]] || fail "CLI configuration not found: $CONFIG_PATH"
[[ -f "$CLI_PATH" ]] || fail "ZCode CLI not found: $CLI_PATH"
jq empty "$CONFIG_PATH" >/dev/null || fail "CLI configuration is not valid JSON"

TARGET_MODEL="$REQUESTED_MODEL"
if [[ -z "$TARGET_MODEL" ]]; then
  TARGET_MODEL="$(jq -er '.model.main' "$CONFIG_PATH")" || fail "config has no model.main"
fi

[[ "$TARGET_MODEL" == */* ]] || fail "model must use provider-id/model-id"
PROVIDER_ID="${TARGET_MODEL%%/*}"
MODEL_ID="${TARGET_MODEL#*/}"
[[ -n "$PROVIDER_ID" && -n "$MODEL_ID" ]] || fail "model must use provider-id/model-id"

jq -e --arg provider "$PROVIDER_ID" --arg model "$MODEL_ID" \
  '.provider[$provider].models[$model] != null' "$CONFIG_PATH" >/dev/null \
  || fail "configured model not found: $TARGET_MODEL"

if [[ -n "$REQUESTED_EFFORT" ]]; then
  jq -e --arg provider "$PROVIDER_ID" --arg model "$MODEL_ID" --arg effort "$REQUESTED_EFFORT" \
    '.provider[$provider].models[$model].reasoning.levels | index($effort) != null' \
    "$CONFIG_PATH" >/dev/null \
    || fail "effort '$REQUESTED_EFFORT' is not supported by $TARGET_MODEL"

  jq -e --arg provider "$PROVIDER_ID" --arg model "$MODEL_ID" --arg effort "$REQUESTED_EFFORT" \
    '.provider[$provider].models[$model].reasoning.providerOptionsByLevel[$effort] != null' \
    "$CONFIG_PATH" >/dev/null \
    || fail "effort '$REQUESTED_EFFORT' has no verified provider request mapping for $TARGET_MODEL"
fi

RUN_SETTINGS=""
cleanup() {
  if [[ -n "$RUN_SETTINGS" && -f "$RUN_SETTINGS" ]]; then
    rm -f -- "$RUN_SETTINGS"
  fi
}
trap cleanup EXIT

if [[ -n "$REQUESTED_MODEL" || -n "$REQUESTED_EFFORT" ]]; then
  umask 077
  RUN_SETTINGS="$(mktemp "${TMPDIR:-/tmp}/zcode-cli-settings.XXXXXX")"
  jq --arg target "$TARGET_MODEL" --arg provider "$PROVIDER_ID" --arg model "$MODEL_ID" --arg effort "$REQUESTED_EFFORT" '
    .model.main = $target
    | if $effort == "" then . else .provider[$provider].models[$model].reasoning.defaultLevel = $effort end
  ' "$CONFIG_PATH" > "$RUN_SETTINGS"
  chmod 600 "$RUN_SETTINGS"
fi

COMMAND=("$NODE_RUNTIME" "$CLI_PATH" --mode "$MODE" --cwd "$WORK_DIR")
if [[ -n "$RUN_SETTINGS" ]]; then
  COMMAND+=(--settings "$RUN_SETTINGS")
fi
COMMAND+=(--prompt "$PROMPT_TEXT")
"${COMMAND[@]}"
