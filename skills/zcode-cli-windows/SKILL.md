---
name: zcode-cli-windows
description: Legacy Windows ZCode entry. Redirect existing users to the unified zcode-cli skill.
---

# Legacy Windows entry

The maintained skill is now ../zcode-cli/SKILL.md. Install the entire zcode-cli
folder on both macOS and Windows. Its Node entry works from PowerShell, CMD
or Git Bash and does not require jq.

The scripts in this folder forward to the sibling unified skill only when both
folders are present. This folder is not a standalone installation package.
If the sibling is absent, locate the user's authorized checkout of
RunhuaHuang/zcodecli-config and use its unified installer.

Do not copy or reconstruct the old runner. Do not require D:\ZCode, Git Bash
or a particular model. Read the unified skill and run its doctor to discover
the current machine's environment.
