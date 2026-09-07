import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { readConfig, normalizeConfig, migrateDesktop, resolveModel, validateEffort, writeNewJSON, replaceConfig, mergeConfig } from '../skills/zcode-cli/scripts/lib/config.mjs';
import { nativePath, cliCandidates, discoverCLI } from '../skills/zcode-cli/scripts/lib/environment.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const runner = path.join(repo, 'skills/zcode-cli/scripts/zcode.mjs');
const installer = path.join(repo, 'skills/zcode-cli/scripts/install.mjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const write = (relative, content) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content), { mode: 0o600 });
    return file;
  };
  return { root, write };
}
const model = () => ({ reasoning: { enabled: true, levels: ['low', 'max'], defaultLevel: 'low', providerOptionsByLevel: {
  low: { anthropic: { effort: 'low', thinking: { type: 'enabled', budgetTokens: 1000 } } },
  max: { anthropic: { effort: 'max', thinking: { type: 'enabled', budgetTokens: 8000 } } }
} } });
const config = () => ({ unrelated: { keep: true }, model: { main: 'p/default' }, provider: {
  p: { kind: 'anthropic', options: { apiKey: 'synthetic-key-only', baseURL: 'https://example.invalid/api' }, models: { default: model(), alternate: model() } }
} });
function invoke(args, options = {}) {
  return spawnSync(process.execPath, [runner, ...args], { encoding: 'utf8', timeout: 15000, ...options });
}
function fakeCLI(write) {
  return write('CLI 安装 with spaces/zcode.cjs', [
    "if(process.argv.includes('version')){console.log('0.16.5');process.exit(0);}",
    "const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');",
    "const c=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.zcode/cli/config.json')));",
    "const args=process.argv.slice(2),cwd=args[args.indexOf('--cwd')+1],prompt=args[args.indexOf('--prompt')+1];",
    "if(prompt==='hang'){const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)']);fs.writeFileSync(path.join(cwd,'child.json'),JSON.stringify({pid:child.pid,profile:os.homedir()}));setInterval(()=>{},1000);}",
    "else if(prompt==='secret'){process.stdout.write('synthetic-');setTimeout(()=>process.stdout.write('key-only'),30);}",
    "else { const originalHome=cp.execFileSync(process.execPath,['-e','process.stdout.write(require(\"os\").homedir())'],{encoding:'utf8'});",
    "console.log(JSON.stringify({main:c.model.main,profile:os.homedir(),childHome:originalHome,envHome:process.env.HOME,effort:c.provider.p.models[c.model.main.split('/')[1]].reasoning.defaultLevel,cwd,prompt})); }"
  ].join('\n'));
}
test('normalization moves legacy connection values and preserves budget and unrelated settings', () => {
  const source = config();
  source.provider.p.apiKey = source.provider.p.options.apiKey;
  source.provider.p.baseURL = source.provider.p.options.baseURL;
  source.provider.p.models.default.reasoning.providerOptionsByLevel.max = {
    output_config: { effort: 'max' }, thinking: { type: 'enabled', budgetTokens: 32000 }
  };
  const { config: normalized } = normalizeConfig(source);
  assert.equal(normalized.provider.p.apiKey, undefined);
  assert.equal(normalized.provider.p.options.apiKey, source.provider.p.apiKey);
  assert.equal(normalized.provider.p.models.default.reasoning.providerOptionsByLevel.max.anthropic.thinking.budgetTokens, 32000);
  assert.deepEqual(normalized.unrelated, source.unrelated);
  assert.ok(source.provider.p.apiKey);
});
test('conflicting credentials fail without exposing either value', () => {
  const c = config(); c.provider.p.apiKey = 'other-secret';
  assert.throws(() => normalizeConfig(c), e => e.code === 'PROVIDER_FIELD_CONFLICT' && !e.message.includes('other-secret'));
});
test('empty and raw effort mappings do not pass validation', () => {
  const c = config(), p = c.provider.p;
  for (const bad of [{}, { output_config: { effort: 'max' } }, { anthropic: {} }]) {
    p.models.default.reasoning.providerOptionsByLevel.max = bad;
    assert.throws(() => validateEffort(p, p.models.default, 'max'), { code: 'EFFORT_MAPPING_MISSING' });
  }
});
test('disabled provider is rejected', () => {
  const c = config(); c.provider.p.enabled = false;
  assert.throws(() => resolveModel(c), { code: 'PROVIDER_DISABLED' });
});
test('migrate exports only known request parameters and preserves token budgets', () => {
  const p = config().provider.p;
  p.options.baseURL = 'https://user:secret@example.invalid/api?api_key=synthetic-token';
  p.models.default.reasoning.providerOptionsByLevel.max.anthropic.authorization = 'synthetic-token';
  const { fragment, warnings } = migrateDesktop({ provider: { 'builtin:bigmodel-coding-plan': p } });
  assert.ok(fragment.provider.bigmodel);
  const q = fragment.provider.bigmodel;
  assert.equal(q.options.apiKey, undefined);
  assert.equal(q.options.baseURL, 'https://example.invalid/api');
  assert.equal(q.models.default.reasoning.providerOptionsByLevel.max.anthropic.thinking.budgetTokens, 8000);
  assert.equal(JSON.stringify(fragment).includes('synthetic'), false);
  assert.ok(warnings.length);
});
test('migration recognizes string and object desktop reasoning levels', () => {
  const p = config().provider.p;
  p.models.default.reasoning = { variants: [{ value: 'high', label: 'High' }], defaultVariant: 'high' };
  const { fragment } = migrateDesktop({ provider: { 'builtin:other': p } });
  assert.deepEqual(fragment.provider['builtin:other'].models.default.reasoning.levels, ['high']);
  assert.equal(fragment.provider['builtin:other'].models.default.reasoning.defaultLevel, 'high');
});
test('migration fails on provider alias collision, supports explicit target', () => {
  const p = config().provider.p, input = { provider: { bigmodel: p, 'builtin:bigmodel-coding-plan': p } };
  assert.throws(() => migrateDesktop(input), { code: 'PROVIDER_ID_CONFLICT' });
  assert.ok(migrateDesktop(input, 'builtin:bigmodel-coding-plan', 'my-plan').fragment.provider['my-plan']);
});
test('malformed JSON and unsafe object keys are reported without raw values', t => {
  const { write } = fixture(t);
  const bad = write('bad.json', '{"apiKey":"secret-data", invalid}');
  const r = invoke(['migrate', '--input', bad]);
  assert.equal(r.status, 2); assert.ok(!r.stderr.includes('secret-data'));
  assert.equal(JSON.parse(r.stderr).error.code, 'CONFIG_INVALID_JSON');
  assert.throws(() => readConfig(write('prototype.json', '{"__proto__":{"x":1}}')), { code: 'CONFIG_UNSAFE_KEY' });
});
test('migrate never overwrites its input, an existing file, or symlink target', t => {
  const { write } = fixture(t);
  const input = write('desktop.json', config());
  const before = fs.readFileSync(input, 'utf8');
  assert.equal(invoke(['migrate', '--input', input, '--output', input]).status, 2);
  assert.equal(fs.readFileSync(input, 'utf8'), before);
  const out = write('out.json', 'existing');
  assert.equal(invoke(['migrate', '--input', input, '--output', out]).status, 2);
  assert.equal(fs.readFileSync(out, 'utf8'), 'existing');
  assert.throws(() => writeNewJSON(out, {}), { code: 'OUTPUT_EXISTS' });
});
test('merge preserves other providers and selected provider credentials', () => {
  const c = config();
  const merged = mergeConfig(c, { provider: { p: { models: { third: model() } }, q: { models: {} } } });
  assert.ok(merged.provider.p.models.default);
  assert.ok(merged.provider.p.models.third);
  assert.ok(merged.provider.q);
  assert.equal(merged.provider.p.options.apiKey, c.provider.p.options.apiKey);
  assert.deepEqual(merged.unrelated, c.unrelated);
});
test('repair preview does not write; apply keeps an exact recoverable backup', t => {
  const { write } = fixture(t);
  const c = config(); c.provider.p.apiKey = c.provider.p.options.apiKey;
  const file = write('cli.json', c), bytes = fs.readFileSync(file);
  const preview = invoke(['repair', '--config', file]);
  assert.equal(preview.status, 0); assert.deepEqual(fs.readFileSync(file), bytes);
  assert.ok(!preview.stdout.includes('synthetic-key-only'));
  const applied = invoke(['repair', '--config', file, '--apply']);
  assert.equal(applied.status, 0);
  assert.deepEqual(fs.readFileSync(JSON.parse(applied.stdout).backup), bytes);
  assert.equal(readConfig(file).provider.p.apiKey, undefined);
});
test('atomic config write refuses concurrently changed files', t => {
  const { write } = fixture(t);
  const file = write('config.json', config());
  assert.throws(() => replaceConfig(file, {}, Buffer.from('old')), { code: 'CONFIG_CHANGED' });
  assert.ok(!fs.existsSync(file + '.runner.lock'));
});
test('Windows native paths, Git Bash drive paths and UNC paths are explicit', () => {
  assert.equal(nativePath('/d/项目 folder', 'win32', 'C:\\Users\\test'), 'D:\\项目 folder');
  assert.equal(nativePath('D:/项目 folder', 'win32', 'C:\\Users\\test'), 'D:\\项目 folder');
  assert.equal(nativePath('\\\\server\\share\\work', 'win32'), '\\\\server\\share\\work');
  assert.throws(() => nativePath('/tmp/work', 'win32'), { code: 'POSIX_PATH_ON_WINDOWS' });
  assert.throws(() => nativePath('D:/work', 'darwin'), { code: 'WINDOWS_PATH_ON_POSIX' });
  assert.ok(cliCandidates({ platform: 'win32', env: { LOCALAPPDATA: 'E:\\Local' }, home: 'E:\\User' }).some(p => p.startsWith('E:\\Local')));
});
test('explicit missing CLI is not silently replaced by another installation', () => {
  assert.throws(() => discoverCLI(path.join(os.tmpdir(), 'nonexistent-cli-unique.cjs')), { code: 'CLI_NOT_FOUND' });
});
test('default and override runs use custom config; child processes retain original home', t => {
  const { root, write } = fixture(t), cli = fakeCLI(write);
  const user = path.join(root, 'original-home');
  write('original-home/.zcode/cli/config.json', config());
  const c = config(); c.model.main = 'p/alternate';
  const file = write('custom.json', c);
  const env = { ...process.env, HOME: user, USERPROFILE: user, ZCODE_MODEL: 'p/wrong' };
  for (const extra of [[], ['--model', 'p/default', '--effort', 'max']]) {
    const r = invoke(['run', '--cli', cli, '--config', file, '--cwd', root, '--prompt', '中文 /tmp/a $HOME ; text', ...extra], { env });
    assert.equal(r.status, 0, r.stderr);
    const data = JSON.parse(r.stdout);
    assert.equal(data.main, extra.length ? 'p/default' : 'p/alternate');
    assert.equal(data.effort, extra.length ? 'max' : 'low');
    assert.equal(path.resolve(data.childHome), path.resolve(user));
    assert.equal(data.prompt, '中文 /tmp/a $HOME ; text');
    assert.ok(!fs.existsSync(data.profile), 'Temporary profile must be cleaned');
    assert.equal(readConfig(file).model.main, 'p/alternate');
  }
});
test('project model override fails before launching CLI', t => {
  const { root, write } = fixture(t);
  write('.zcode/config.json', { model: { main: 'unknown/model' } });
  const r = invoke(['run', '--cwd', root, '--prompt', 'fixture', '--config', write('config.json', config()), '--cli', fakeCLI(write)]);
  assert.equal(JSON.parse(r.stderr).error.code, 'PROJECT_MODEL_OVERRIDE');
});
test('configured keys split across CLI output chunks are redacted', t => {
  const { root, write } = fixture(t);
  const r = invoke(['run', '--cwd', root, '--prompt', 'secret', '--config', write('config.json', config()), '--cli', fakeCLI(write)]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '[REDACTED]');
});
test('doctor diagnostics do not expose credentials', t => {
  const { write } = fixture(t);
  const r = invoke(['doctor', '--json', '--config', write('config.json', config()), '--cli', fakeCLI(write)]);
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(r.stdout);
  assert.equal(doc.ready, true);
  assert.equal(doc.cliVersion, '0.16.5');
  assert.ok(!r.stdout.includes('synthetic-key-only'));
});
test('timeout stops the CLI process tree and removes its temporary profile', async t => {
  const { root, write } = fixture(t);
  const r = await new Promise(resolve => {
    const child = spawn(process.execPath, [runner, 'run', '--cwd', root, '--prompt', 'hang', '--config', write('config.json', config()), '--cli', fakeCLI(write), '--timeout-ms', '1500'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('close', code => resolve(code));
  });
  assert.equal(r, 124);
  const { pid, profile } = readConfig(path.join(root, 'child.json'));
  assert.ok(!fs.existsSync(profile));
  await new Promise(r => setTimeout(r, 200));
  assert.throws(() => process.kill(pid, 0), 'Descendant must not survive timeout');
});
test('installer previews, installs complete skill and backs up old local changes', t => {
  const { root } = fixture(t), target = path.join(root, 'skills', 'zcode-cli');
  const runInstall = (...extra) => spawnSync(process.execPath, [installer, '--target', target, ...extra], { encoding: 'utf8', timeout: 15000 });
  assert.equal(runInstall().status, 0); assert.ok(!fs.existsSync(target));
  const r = runInstall('--apply'); assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(target, 'scripts/lib/runtime.mjs')));
  fs.writeFileSync(path.join(target, 'local-note.txt'), 'preserve');
  const updated = runInstall('--apply'); assert.equal(updated.status, 0, updated.stderr);
  assert.equal(fs.readFileSync(path.join(JSON.parse(updated.stdout).backup, 'local-note.txt'), 'utf8'), 'preserve');
  const installedHelp = spawnSync(process.execPath, [path.join(target, 'scripts/zcode.mjs'), '--help'], { encoding: 'utf8' });
  assert.equal(installedHelp.status, 0);
});
test('installer refuses an unrelated target directory', t => {
  const { root, write } = fixture(t);
  write('unrelated/keep.txt', 'keep');
  const r = spawnSync(process.execPath, [installer, '--target', path.join(root, 'unrelated'), '--apply'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.ok(fs.existsSync(path.join(root, 'unrelated/keep.txt')));
});
test('installed CLI request probe sends namespaced effort', { skip: !process.env.ZCODE_TEST_CLI }, async () => {
  const { probeCLI } = await import('../skills/zcode-cli/scripts/lib/probe.mjs');
  const result = await probeCLI(process.env.ZCODE_TEST_CLI);
  assert.equal(result.passed, true, JSON.stringify(result));
});
