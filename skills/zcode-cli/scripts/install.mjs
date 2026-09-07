#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readConfig, fail, json, RunnerError } from './lib/config.mjs';
import { nativePath } from './lib/environment.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
try {
  const args = process.argv.slice(2);
  let target, apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--target' && args[i + 1]) target = nativePath(args[++i]);
    else if (args[i] === '--help') {
      console.log('Usage: node install.mjs [--target SKILL_DIRECTORY] [--apply]\nDefaults to CODEX_HOME/skills/zcode-cli (or ~/.codex/skills/zcode-cli).\nPreview first; --apply installs or replaces the recognized skill with a recoverable backup. No model configuration is changed.');
      process.exit(0);
    } else fail('OPTION_UNKNOWN', 'Use --target PATH and/or --apply.');
  }
  target ??= path.join(process.env.CODEX_HOME ? nativePath(process.env.CODEX_HOME) : path.join(os.homedir(), '.codex'), 'skills', 'zcode-cli');
  const version = readConfig(path.join(source, 'skill.json')).version;
  const exists = fs.existsSync(target);
  if (path.resolve(target) === path.resolve(source)) {
    console.log(json({ installed: true, upToDate: true, version, target })); process.exit(0);
  }
  const existingManifest = exists && fs.existsSync(path.join(target, 'skill.json')) ? readConfig(path.join(target, 'skill.json')) : null;
  const legacy = exists && fs.existsSync(path.join(target, 'SKILL.md')) &&
    /^name:\s*zcode-cli\s*$/m.test(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'));
  if (exists && (fs.lstatSync(target).isSymbolicLink() || (!existingManifest && !legacy)))
    fail('INSTALL_TARGET_UNRECOGNIZED', 'Target is not a recognized zcode-cli skill. Choose an explicit empty target directory.');
  const result = { applied: false, version, installedVersion: existingManifest?.version ?? (legacy ? 'legacy-unversioned' : null), target, nextAction: 'Add --apply to install, then run the installed scripts/zcode.mjs doctor --json --probe.' };
  if (!apply) { console.log(json(result)); process.exit(0); }
  const parent = path.dirname(target); fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, '.zcode-install-'));
  let backup = null;
  try {
    fs.cpSync(source, stage, { recursive: true, filter: file => !['.install.json', '.DS_Store'].includes(path.basename(file)) });
    readConfig(path.join(stage, 'skill.json'));
    fs.writeFileSync(path.join(stage, '.install.json'), json({ version, installedAt: new Date().toISOString(), source }), { mode: 0o600 });
    if (exists) {
      const backupRoot = path.join(path.dirname(parent), 'skill-backups');
      fs.mkdirSync(backupRoot, { recursive: true });
      backup = path.join(backupRoot, 'zcode-cli-' + randomUUID());
      fs.renameSync(target, backup);
    }
    try { fs.renameSync(stage, target); }
    catch (e) { if (backup) fs.renameSync(backup, target); throw e; }
    console.log(json({ ...result, applied: true, backup, nextAction: 'Run the installed scripts/zcode.mjs doctor --json --probe. Existing sessions may need to reload the skill.' }));
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
} catch (error) {
  console.error(json({ error: { code: error.code ?? 'INSTALL_FAILED', message: error instanceof RunnerError ? error.message : 'Installation failed; existing files were preserved or restored.' } }));
  process.exitCode = 2;
}
