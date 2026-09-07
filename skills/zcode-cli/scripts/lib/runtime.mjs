import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { fail, json, readConfig, normalizeConfig, resolveModel, validateEffort, validateConnection } from './config.mjs';
import { nativePath } from './environment.mjs';

const launcher = fileURLToPath(new URL('../launch-cli.cjs', import.meta.url));
export function prepareRun({ configFile, model, effort, env = process.env }) {
  const { config, changes } = normalizeConfig(readConfig(configFile));
  const selected = resolveModel(config, model);
  validateConnection(selected.provider, env);
  const level = effort ?? selected.model.reasoning?.defaultLevel;
  if (level) validateEffort(selected.provider, selected.model, level);
  config.model = { ...config.model, main: selected.target };
  if (effort) selected.model.reasoning.defaultLevel = effort;
  return { config, changes, selected: selected.target, effort: level ?? null };
}
function restoreRelativePaths(config, configFile) {
  const base = path.dirname(configFile), home = os.homedir();
  const resolve = p => typeof p === 'string' ? (p.startsWith('~') ? nativePath(p) : path.resolve(base, p)) : p;
  // CLI storage and explicit resource roots should still refer to the real user.
  config.storage ??= {};
  config.storage.dir = config.storage.dir ? resolve(config.storage.dir) : path.join(home, '.zcode');
  if (config.storage.sessionDbPath) config.storage.sessionDbPath = resolve(config.storage.sessionDbPath);
  if (Array.isArray(config.plugins?.dirs)) config.plugins.dirs = config.plugins.dirs.map(resolve);
  for (const source of Object.values(config.plugins?.extraKnownMarketplaces ?? {}))
    if (['file', 'directory'].includes(source?.source) && source.path) source.path = resolve(source.path);
  for (const server of Object.values(config.mcp?.servers ?? {}))
    if (server?.cwd) server.cwd = resolve(server.cwd);
}
function stopTree(child, force = false) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 5000 });
  } else {
    try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch {}
  }
}
export async function executeCLI({ cli, config, configFile, cwd, mode = 'plan', prompt, timeout = 0, capture = false, env = process.env, isolatedStorage = false }) {
  if (!['plan', 'build', 'edit', 'yolo'].includes(mode)) fail('MODE_INVALID', 'Use plan, build, edit or yolo.');
  if (typeof prompt !== 'string' || !prompt.trim()) fail('PROMPT_REQUIRED', 'A nonempty --prompt is required.');
  cwd = nativePath(cwd);
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) fail('CWD_INVALID', 'The working directory does not exist.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-run-'));
  fs.chmodSync(profile, 0o700);
  const copy = structuredClone(config);
  restoreRelativePaths(copy, configFile);
  if (isolatedStorage) copy.storage = { dir: path.join(profile, '.zcode'), sessionDbPath: path.join(profile, 'db.sqlite') };
  const configDir = path.join(profile, '.zcode', 'cli');
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(configDir, 'config.json'), json(copy), { mode: 0o600 });
  const childEnv = { ...env };
  // Runner arguments and selected config own model selection. CLI env overrides
  // would otherwise silently select another model with the same prompt.
  delete childEnv.ZCODE_MODEL; delete childEnv.ZCODE_BASE_URL;
  delete childEnv.MSYS2_ARG_CONV_EXCL;
  const secrets = Object.values(config.provider ?? {}).flatMap(p => [p.apiKey, p.options?.apiKey]).filter(v => typeof v === 'string' && v.length > 4);
  const scrub = text => secrets.reduce((s, secret) => s.split(secret).join('[REDACTED]'), text);
  let child, timer, forceTimer, signalCode = 0, timedOut = false;
  let stdout = '', stderr = '', outTail = '', errTail = '';
  const maxSecret = Math.max(1, ...secrets.map(v => v.length));
  const relay = (stream, text, tailName, flush = false) => {
    let pending = (tailName === 'out' ? outTail : errTail) + text;
    // Keep a tail so an API key split across chunks is still redacted.
    let cut = flush ? pending.length : Math.max(0, pending.length - maxSecret);
    for (const secret of secrets) {
      const start = pending.indexOf(secret);
      if (start >= 0 && start < cut && start + secret.length > cut) cut = start;
    }
    stream.write(scrub(pending.slice(0, cut)));
    if (tailName === 'out') outTail = pending.slice(cut); else errTail = pending.slice(cut);
  };
  const cancel = signal => {
    if (signalCode) return;
    signalCode = signal === 'SIGINT' ? 130 : 143;
    stopTree(child);
    forceTimer = setTimeout(() => stopTree(child, true), 1500);
  };
  const onInt = () => cancel('SIGINT'), onTerm = () => cancel('SIGTERM');
  try {
    child = spawn(process.execPath, [launcher, profile, cli, '--mode', mode, '--cwd', cwd, '--prompt', prompt], {
      env: childEnv, cwd, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { if (capture) stdout = (stdout + data).slice(-1024 * 1024); else relay(process.stdout, data, 'out'); });
    child.stderr.on('data', data => { if (capture) stderr = (stderr + data).slice(-65536); else relay(process.stderr, data, 'err'); });
    if (timeout) timer = setTimeout(() => { timedOut = true; cancel('SIGTERM'); }, timeout);
    const code = await new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('CLI_SPAWN_FAILED')));
      child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    return { code: timedOut ? 124 : signalCode || code, stdout: scrub(stdout), stderr: scrub(stderr) };
  } finally {
    clearTimeout(timer); clearTimeout(forceTimer);
    process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
    if (!capture) { relay(process.stdout, '', 'out', true); relay(process.stderr, '', 'err', true); }
    // Scope deletion to the exact mkdtemp result created above.
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  }
}
