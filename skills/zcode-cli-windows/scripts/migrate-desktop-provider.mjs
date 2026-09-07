#!/usr/bin/env node
// Deprecated repository entry. Install the self-contained unified zcode-cli.
import fs from 'node:fs';
const entry = new URL('../../zcode-cli/scripts/zcode.mjs', import.meta.url);
if (!fs.existsSync(entry)) {
  console.error('UNIFIED_SKILL_REQUIRED: install the unified zcode-cli folder.');
  process.exit(2);
}
process.argv.splice(2, 0, 'migrate');
await import(entry);
