# Installation and setup

Requirements: native Node.js 20+ and an installed ZCode desktop CLI bundle.
No npm package installation, jq or shell-specific dependency is required by
the Node entry. The CLI itself may impose a higher Node minimum; doctor probes
the selected executable rather than assuming our minimum is sufficient.

## Install or update

From the checkout:

~~~text
node skills/zcode-cli/scripts/install.mjs
node skills/zcode-cli/scripts/install.mjs --apply
~~~

The first command previews the target. The second installs the whole skill into
CODEX_HOME/skills/zcode-cli, or ~/.codex/skills/zcode-cli when CODEX_HOME is unset.
--target takes a full skill-directory path for a custom installation.

A recognized existing skill is moved into skill-backups beside the skills
directory before replacement. Backups retain local modifications and are
outside skill discovery. An unrelated directory or symlink is rejected.
No CLI model configuration or credentials are changed by installation.
Run the installed doctor --json --probe afterward. Existing Agent sessions may
need to reload the skill. The installed skill.json and .install.json record
version and installation provenance; do not assume GitHub updates installed files.

## Existing configuration

~~~text
node "<skill>/scripts/zcode.mjs" doctor --json
node "<skill>/scripts/zcode.mjs" repair
node "<skill>/scripts/zcode.mjs" repair --apply
~~~

repair defaults to a credential-free inventory of the proposed configuration
and a list of structural changes. apply preserves unrelated configuration,
normalizes the supported legacy shapes and creates a byte-for-byte backup.
Conflicting top-level/options connection values require local resolution.
Do not override a user's model selection during a routine update.

## First-time migration

~~~text
node "<skill>/scripts/zcode.mjs" migrate --provider-id builtin:bigmodel-coding-plan --output "<new-local-path>/provider.fragment.json"
node "<skill>/scripts/zcode.mjs" repair --fragment "<new-local-path>/provider.fragment.json" --model "bigmodel/GLM-5.3-Flash"
node "<skill>/scripts/zcode.mjs" repair --fragment "<new-local-path>/provider.fragment.json" --model "bigmodel/GLM-5.3-Flash" --apply
~~~

The model above is an example, not a default choice. Use the user's exact model
ID. --input selects another desktop config; --config selects another CLI config.
Both default to the active native user's .zcode directory.

Migration omits credentials, arbitrary headers and unrecognized request fields.
It strips URL userinfo, query strings and fragments and reports changes requiring
endpoint review. It preserves known SDK token budgets and converts desktop
reasoning variants. Unknown provider IDs are retained; only the documented
BigModel mapping is applied. --target-id explicitly chooses a different ID.

Credentials already present in the selected CLI provider remain during merging.
If none exist, the user supplies them via a local editor/secret mechanism.
migrate never overwrites an existing output or its input. repair --apply is the
only model-config write command and always keeps a backup.

Finish with doctor --probe for CLI request semantics and, when authorized, smoke
for the chosen provider. A configured provider is not automatically authenticated
or subscribed, and a reply OK does not prove effort support on the server.
