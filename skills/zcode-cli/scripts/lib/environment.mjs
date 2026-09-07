import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fail } from './config.mjs';

export function nativePath(value, platform = process.platform, home = os.homedir()) {
  if (value === '~') return home;
  if (/^~[/\\]/.test(value)) value = path.join(home, value.slice(2));
  if (platform === 'win32') {
    const drive = /^\/([a-z])(?:\/|$)/i.exec(value);
    if (drive) return path.win32.resolve(drive[1].toUpperCase() + ':/' + value.slice(drive[0].length));
    if (value.startsWith('/') && !value.startsWith('//'))
      fail('POSIX_PATH_ON_WINDOWS', 'Use a native Windows path such as D:/work, or convert it with cygpath -w.');
    return path.win32.resolve(value);
  }
  if (/^[a-z]:[/\\]/i.test(value))
    fail('WINDOWS_PATH_ON_POSIX', 'Use a path belonging to the current Node runtime; Windows and WSL are distinct environments.');
  return path.resolve(value);
}
export function configPath(value, env = process.env) {
  return nativePath(value ?? env.ZCODE_CONFIG_PATH ?? path.join(os.homedir(), '.zcode', 'cli', 'config.json'));
}
export function cliCandidates({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (platform === 'darwin') return [
    '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
    path.join(home, 'Applications/ZCode.app/Contents/Resources/glm/zcode.cjs')
  ];
  if (platform !== 'win32') return [];
  const w = path.win32;
  const roots = [
    env.LOCALAPPDATA && w.join(env.LOCALAPPDATA, 'Programs/ZCode'),
    env.LOCALAPPDATA && w.join(env.LOCALAPPDATA, 'ZCode'),
    env.ProgramFiles && w.join(env.ProgramFiles, 'ZCode'),
    env['ProgramFiles(x86)'] && w.join(env['ProgramFiles(x86)'], 'ZCode'),
    w.join(home, 'AppData/Local/Programs/ZCode'),
    'D:/ZCode', 'C:/ZCode'
  ].filter(Boolean);
  return roots.map(p => w.join(p, 'resources/glm/zcode.cjs'));
}
function registryCandidates() {
  if (process.platform !== 'win32') return [];
  const result = [];
  for (const key of [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]) {
    const r = spawnSync('reg.exe', ['query', key, '/s', '/f', 'ZCode'], { encoding: 'utf8', windowsHide: true, timeout: 3000, maxBuffer: 2e6 });
    const keys = (r.stdout ?? '').split(/\r?\n/).filter(l => /^HKEY_/.test(l));
    for (const entry of keys.slice(0, 8)) {
      const found = spawnSync('reg.exe', ['query', entry, '/v', 'InstallLocation'], { encoding: 'utf8', windowsHide: true, timeout: 1000 });
      const match = /InstallLocation\s+REG_\w+\s+(.+)/.exec(found.stdout ?? '');
      if (match) result.push(path.join(match[1].trim(), 'resources/glm/zcode.cjs'));
    }
  }
  return result;
}
export function discoverCLI(explicit, { registry = false, env = process.env } = {}) {
  const selected = explicit ?? env.ZCODE_CLI_PATH;
  if (selected) {
    const p = nativePath(selected);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile())
      fail('CLI_NOT_FOUND', 'The explicitly selected CLI does not exist; fix --cli or ZCODE_CLI_PATH.');
    return { path: fs.realpathSync(p), candidates: [p], source: 'explicit' };
  }
  const candidates = [...cliCandidates({ env }), ...(registry ? registryCandidates() : [])];
  const found = [...new Set(candidates.filter(p => {
    try { return fs.statSync(p).isFile(); } catch { return false; }
  }).map(p => fs.realpathSync(p)))];
  return { path: found.length === 1 ? found[0] : null, candidates: found, source: 'discovery' };
}
export function cliVersion(cli) {
  const r = spawnSync(process.execPath, [cli, 'version'], { encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 65536 });
  if (r.error || r.status !== 0) return null;
  return /\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/.exec(r.stdout)?.[0] ?? null;
}
export function requireCLI(explicit) {
  const detected = discoverCLI(explicit, { registry: true });
  if (!detected.path)
    fail(detected.candidates.length ? 'CLI_AMBIGUOUS' : 'CLI_NOT_FOUND', 'Run doctor and select the intended ZCode CLI using --cli or ZCODE_CLI_PATH.');
  return detected.path;
}
