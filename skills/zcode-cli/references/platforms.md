# Platform behavior

| Concern | macOS | Windows |
| --- | --- | --- |
| Preferred entry | node scripts/zcode.mjs | node scripts/zcode.mjs |
| Shell | Any shell able to start Node | PowerShell, CMD or Git Bash |
| Node requirement | Native Node 20+ | Native Windows Node 20+ |
| CLI discovery | /Applications and ~/Applications | LOCALAPPDATA, Program Files, uninstall registry and fallback candidates |
| Default user config | ~/.zcode/cli/config.json | %USERPROFILE%\.zcode\cli\config.json |
| File protection | Restricted POSIX modes | User temporary-directory ACL; POSIX modes do not secure NTFS |
| Path examples | /Users/name/work | D:/work, D:\work, /d/work in Git Bash |

Use --cli or ZCODE_CLI_PATH to select a nonstandard installation.
Multiple detected installations require an explicit selection; the runner does
not silently prefer D:\ZCode. ZCODE_CONFIG_PATH and --config apply to every run,
including runs without model/effort overrides.

Git Bash wrapper disables automatic argument conversion so prompts containing
paths remain unchanged. The native Node runner recognizes /d/work syntax;
other POSIX roots on Windows require cygpath -w or a native path.
The PowerShell wrapper is optional: if script policy disallows it, call the Node
entry directly without changing execution policy.

WSL with Linux Node is a different environment from Windows Node. The module
does not guess how to cross the boundary. Use Windows Node for a Windows bundle,
or supply and separately verify a genuinely native Linux CLI.

## Temporary configuration and home behavior

The 0.16.5 adapter runs the installed CJS CLI in a child Node process after
redirecting os.homedir() in that process to a temporary CLI profile. It does not
set HOME/USERPROFILE to that profile and does not propagate a preload via
NODE_OPTIONS. Child Git, SSH, shells and Node processes therefore retain the
original home environment. Tests verify this on each native CI platform.

Normal runs preserve the original ZCode storage directory and explicit plugin
roots. Known configuration-relative resource paths are made absolute.
ZCode code that directly uses its own os.homedir() still sees the temporary
profile; implicit user-level discovery/session behavior must be verified for
tasks that depend on it. This is a compatibility adapter, not a full desktop
session clone. Do not copy a user's entire home into the profile.

The profile contains credentials for the duration of the run. Normal exit,
timeout and handled cancellation remove it; forced termination of the runner,
power loss or OS failure cannot guarantee cleanup. POSIX cancellation signals
the child process group; Windows cancellation uses taskkill /T /F.
--timeout-ms provides a bounded run; smoke defaults to 60 seconds.

A CLI upgrade that changes startup/config behavior must pass doctor --probe.
The probe covers the actual CLI's Anthropic request translation locally.
Windows native CI tests the runner with synthetic CLI fixtures; it does not
pretend to test a ZCode desktop binary unavailable on that runner.
