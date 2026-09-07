---
name: zcode-cli
description: Execute user-authorized tasks through the preconfigured local ZCode CLI. Use when the user asks to complete work with ZCode CLI or one of its configured models.
---

# ZCode CLI task runner

## Run a task

Use the bundled runner at `scripts/run-zcode.sh` relative to this `SKILL.md`:

```bash
"<skill-directory>/scripts/run-zcode.sh" \
  --mode yolo \
  --cwd "/target/directory" \
  --prompt "A precise, user-authorized task"
```

### Runner parameters

- `--cwd <directory>` — required; the task's working directory.
- `--prompt <text>` — required; state the target, expected result, and constraints.
- `--mode <plan|build|edit|yolo>` — optional; the runner defaults to `plan`. Always set it explicitly when the required permissions matter:
  - `plan` — read-only inspection, analysis, and planning. Use for requests that must not alter files.
  - `build` — ordinary implementation/build work.
  - `edit` — focused file-editing work.
  - `yolo` — full execution access, including commands and file changes; use only for user-authorized writes or other side effects.
- `--model <provider-id/model-id>` — optional, one-run model override; for example `bigmodel/glm-5.3`.
- `--effort <level>` — optional, one-run reasoning-effort override; for example `max`. It must be supported and have a verified provider request mapping for that model.

The runner accepts only the parameters above. Do not spend a turn calling CLI help to rediscover them.

## Model and effort overrides

Without overrides, the runner uses the configured `model.main` and that model's configured default effort. If the user specifies a configured model or effort, pass either or both flags:

```bash
"<skill-directory>/scripts/run-zcode.sh" \
  --cwd "/target/directory" \
  --model "provider-id/model-id" \
  --effort "max" \
  --mode yolo \
  --prompt "User-authorized task"
```

The runner resolves the exact configured model, validates the effort, writes a temporary `0600` CLI config copy under a temporary `HOME`, and removes the temporary directory on completion or failure. This is intentional: ZCode CLI 0.16.5 advertises `--settings` in help output but does not accept that option in its actual argument parser. The temporary `HOME` keeps per-run overrides isolated without relying on the broken flag. It never changes the persistent CLI configuration or desktop ZCode configuration.

An explicitly requested effort must be present in `reasoning.levels` **and** have a `providerOptionsByLevel` request mapping. If either is absent, report that the requested effort cannot be guaranteed instead of substituting a level or claiming it was applied.

## Verify completion

After the CLI returns, inspect the requested output and check concrete requirements such as file existence, format, or word count. Report the produced artifact, not merely the CLI response.

Do not print API keys, configuration contents, or process environments. If the CLI configuration is missing or invalid, stop and ask the user whether they want to configure it.
