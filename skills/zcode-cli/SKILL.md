---
name: zcode-cli
description: Install, diagnose, migrate and run the local ZCode CLI on macOS or Windows. Use for ZCode CLI tasks and configured model requests.
---

# ZCode CLI

Use the self-contained scripts in this skill. Resolve paths relative to this
SKILL.md; do not assume the repository is the working directory.

## Start from the actual environment

On first use after installation, after a CLI upgrade, or after a configuration
failure, run:

~~~text
node "<skill-directory>/scripts/zcode.mjs" doctor --json --probe
~~~

The JSON reports the native Node platform, CLI candidates/version, selected
configuration, credential presence, legacy normalization and actionable errors.
The optional probe sends a synthetic request to localhost using the actual CLI;
it does not use the user's model credentials. Distinguish probe success from
real-provider connectivity.

Use existing valid settings and choices already given by the user. Ask only for
a missing selection, ambiguous installation or unavailable authentication.
When the user has requested setup, a missing configuration is a setup step,
not a reason to ask whether setup is wanted again.

- Read [setup.md](references/setup.md) for installation, migration and repair.
- Read [configuration.md](references/configuration.md) for schema or effort issues.
- Read [platforms.md](references/platforms.md) for Windows paths, multiple
  installations, WSL or launcher limitations.
- Read [troubleshooting.md](references/troubleshooting.md) for a diagnostic error.

## Run the authorized task

~~~text
node "<skill-directory>/scripts/zcode.mjs" run --cwd "<task-directory>" --mode plan --prompt "<specific authorized task>"
~~~

Optional flags: --model provider/model, --effort level, --config path,
--cli path, --timeout-ms N. All paths belong to the active Node platform.
Use explicit mode: plan for inspection, build/edit for authorized implementation,
yolo only when the requested task needs its full execution permissions.
Default mode is plan.

The runner validates the selected model, temporarily normalizes known legacy
connection and Anthropic effort shapes, and never changes persistent model
configuration. It rejects conflicting connection fields and unmapped efforts.
Do not invent IDs, lowercase model names, or treat bigmodel as an automatic alias.
Do not claim effort was applied solely because a model replied OK.

The 0.16.5 adapter uses a temporary CLI profile and changes os.homedir() only
inside the CLI process. HOME/USERPROFILE and child-process home remain original.
ZCode internal home-relative discovery is still isolated; see platform notes
when a task depends on user-level skills, session state or local files.

For an authorized provider smoke test:

~~~text
node "<skill-directory>/scripts/zcode.mjs" smoke --cwd "<task-directory>" --model "<provider/model>"
~~~

Smoke tests use the real provider and can consume quota. Verify actual artifacts
and task requirements after ordinary runs, not just the CLI exit code.

## Keep credentials local

Use the scripts' diagnostic/preview outputs. Do not print raw configs or process
environments and do not ask for keys in chat. When setup requires a new key,
direct the user to a local editor or their existing secret-management mechanism.
Reuse an already configured key within the authorized workflow without
displaying it. Never automatically switch provider or billing channel after
authentication/captcha/quota failures.

install and repair commands preview by default. If the user already authorized
installation or repair and the preview matches their scope, proceed with
--apply; no additional confirmation is required. These commands create backups.
