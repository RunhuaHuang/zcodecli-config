#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig, normalizeConfig, resolveModel, validateEffort, validateConnection, inventory, migrateDesktop, mergeConfig, writeNewJSON, replaceConfig, fail, json, RunnerError } from './lib/config.mjs';
import { nativePath, configPath, discoverCLI, requireCLI, cliVersion } from './lib/environment.mjs';
import { prepareRun, executeCLI } from './lib/runtime.mjs';
import { probeCLI } from './lib/probe.mjs';

const skillRoot = fileURLToPath(new URL('../', import.meta.url));
const manifest = readConfig(path.join(skillRoot, 'skill.json'));
const help = 'Usage: node zcode.mjs <doctor|run|smoke|migrate|repair> [options]\n' +
  'doctor  [--json] [--probe] [--cli PATH] [--config PATH]\n' +
  'run     --cwd DIR --prompt TEXT [--mode plan|build|edit|yolo] [--model ID] [--effort LEVEL] [--timeout-ms N] [--cli PATH] [--config PATH]\n' +
  'smoke   --cwd DIR [--model ID] [--effort LEVEL] [--cli PATH] [--config PATH]\n' +
  'migrate [--input PATH] [--provider-id ID] [--target-id ID] [--output NEW_PATH]\n' +
  'repair  [--config PATH] [--fragment PATH] [--model ID] [--apply]\n' +
  'No credentials are accepted on the command line. repair defaults to a redacted preview.\n';

const schemas = {
  doctor: { flags: ['json', 'probe'], values: ['cli', 'config'] },
  run: { flags: [], values: ['cwd', 'prompt', 'mode', 'model', 'effort', 'timeout-ms', 'cli', 'config'] },
  smoke: { flags: [], values: ['cwd', 'model', 'effort', 'cli', 'config'] },
  migrate: { flags: [], values: ['input', 'provider-id', 'target-id', 'output'] },
  repair: { flags: ['apply'], values: ['config', 'fragment', 'model'] }
};
function parse(argv) {
  const [command, ...args] = argv;
  if (!command || ['--help', '-h', 'help'].includes(command) || args.includes('--help')) return { command: 'help', options: {} };
  const schema = schemas[command];
  if (!schema) fail('COMMAND_UNKNOWN', 'Unknown command. Run --help.');
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].startsWith('--') ? args[i].slice(2) : '';
    if (Object.hasOwn(options, key)) fail('OPTION_DUPLICATE', 'Do not repeat an option.');
    if (schema.flags.includes(key)) options[key] = true;
    else if (schema.values.includes(key)) {
      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) fail('OPTION_VALUE_REQUIRED', 'An option is missing its value.');
      options[key] = args[++i];
    } else fail('OPTION_UNKNOWN', 'Unknown option. Run --help.');
  }
  return { command, options };
}
function verifyProject(cwd) {
  // The CLI merges project files after the user file. Refuse ambiguous model
  // selection instead of silently routing an explicit override elsewhere.
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    const file = path.join(dir, '.zcode', 'config.json');
    if (fs.existsSync(file)) {
      const c = readConfig(file);
      if (c.model || c.provider || c.modelCatalog)
        fail('PROJECT_MODEL_OVERRIDE', 'Project .zcode/config.json overrides models; reconcile it with the requested run before retrying.');
    }
    if (path.dirname(dir) === dir) break;
  }
}
async function doctor(o) {
  const checks = [], issues = [];
  const file = configPath(o.config);
  let config = {}, changes = [], cli = null, version = null;
  try {
    const detected = discoverCLI(o.cli, { registry: true });
    cli = detected.path;
    checks.push({ name: 'cli', ...detected });
    if (!cli) issues.push({ code: detected.candidates.length ? 'CLI_AMBIGUOUS' : 'CLI_NOT_FOUND', action: 'Select the installation with --cli.' });
    else {
      version = cliVersion(cli);
      if (!version) issues.push({ code: 'CLI_VERSION_FAILED', action: 'Check Node compatibility and the selected executable.' });
      else if (!manifest.verifiedCliVersions.includes(version))
        issues.push({ code: 'CLI_VERSION_UNVERIFIED', action: 'Run doctor --probe before using this build.' });
    }
  } catch (e) { issues.push({ code: e.code ?? 'CLI_CHECK_FAILED', action: e instanceof RunnerError ? e.message : 'Check CLI discovery.' }); }
  try {
    const normalized = normalizeConfig(readConfig(file));
    config = normalized.config; changes = normalized.changes;
    const { provider, model } = resolveModel(config);
    validateConnection(provider);
    if (model.reasoning?.defaultLevel) validateEffort(provider, model, model.reasoning.defaultLevel);
  } catch (e) { issues.push({ code: e.code ?? 'CONFIG_CHECK_FAILED', action: e instanceof RunnerError ? e.message : 'Inspect the local configuration.' }); }
  let probe = null;
  if (o.probe && cli) {
    probe = await probeCLI(cli);
    if (!probe.passed) issues.push({ code: 'CLI_PROBE_FAILED', action: probe.nextAction });
    else {
      const index = issues.findIndex(i => i.code === 'CLI_VERSION_UNVERIFIED');
      if (index >= 0) issues.splice(index, 1);
    }
  }
  if (changes.length) issues.push({ code: 'CONFIG_NORMALIZATION_AVAILABLE', action: 'Runs normalize a temporary copy; use repair to preview a persistent update.' });
  const result = {
    schemaVersion: 1, skillVersion: manifest.version,
    platform: process.platform, architecture: process.arch, node: process.version,
    nativeNode: process.platform === 'win32' ? 'Windows' : process.platform,
    wsl: Boolean(process.env.WSL_DISTRO_NAME), configPath: file,
    cliVersion: version, checks, providers: inventory(config), changes, issues, probe,
    ready: !issues.some(i => !['CONFIG_NORMALIZATION_AVAILABLE'].includes(i.code))
  };
  console.log(json(result));
  if (!result.ready) process.exitCode = 2;
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) fail('NODE_TOO_OLD', 'Use Node.js 20 or newer.');
  const { command, options: o } = parse(process.argv.slice(2));
  if (command === 'help') { process.stdout.write(help); return; }
  if (command === 'doctor') return doctor(o);
  if (command === 'migrate') {
    const input = nativePath(o.input ?? path.join(os.homedir(), '.zcode', 'v2', 'config.json'));
    const { fragment, warnings } = migrateDesktop(readConfig(input), o['provider-id'], o['target-id']);
    if (o.output) {
      const output = nativePath(o.output);
      if (path.resolve(input) === path.resolve(output)) fail('OUTPUT_IS_INPUT', 'Output cannot be the input configuration.');
      writeNewJSON(output, fragment);
      console.log(json({ output, warnings, nextAction: 'Review the fragment, then use repair --fragment. Supply missing credentials locally.' }));
    } else {
      process.stdout.write(json(fragment));
      if (warnings.length) process.stderr.write(json({ warnings }));
    }
    return;
  }
  const file = configPath(o.config);
  if (command === 'repair') {
    const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
    let input = readConfig(file, true);
    if (o.fragment) input = mergeConfig(input, readConfig(nativePath(o.fragment)));
    if (o.model) input.model = { ...input.model, main: o.model };
    const { config, changes } = normalizeConfig(input);
    resolveModel(config);
    if (o.apply) {
      const { backup } = replaceConfig(file, config, before);
      console.log(json({ applied: true, backup, changes, providers: inventory(config), nextAction: 'Run doctor, then an authorized smoke test.' }));
    } else console.log(json({ applied: false, changes, providers: inventory(config), nextAction: 'Review the proposed providers/model; add --apply to merge with backup.', model: config.model?.main ?? null }));
    return;
  }
  if (!o.cwd) fail('CWD_REQUIRED', '--cwd is required.');
  const cwd = nativePath(o.cwd); verifyProject(cwd);
  const cli = requireCLI(o.cli), version = cliVersion(cli);
  if (!version) fail('CLI_VERSION_FAILED', 'Cannot determine the selected CLI version.');
  if (!manifest.verifiedCliVersions.includes(version)) {
    const compatibility = await probeCLI(cli);
    if (!compatibility.passed) fail('CLI_UNVERIFIED', 'This CLI build did not pass the local request probe.');
  }
  const prepared = prepareRun({ configFile: file, model: o.model, effort: o.effort });
  const timeout = command === 'smoke' ? 60000 : Number(o['timeout-ms'] ?? 0);
  if (!Number.isSafeInteger(timeout) || timeout < 0) fail('TIMEOUT_INVALID', '--timeout-ms must be a nonnegative integer.');
  const result = await executeCLI({
    cli, config: prepared.config, configFile: file, cwd,
    mode: command === 'smoke' ? 'plan' : o.mode ?? 'plan',
    prompt: command === 'smoke' ? 'Do not use tools. Only reply with: ZCODE_CLI_OK' : o.prompt,
    timeout, capture: command === 'smoke'
  });
  if (command === 'smoke') {
    const passed = result.code === 0 && result.stdout.includes('ZCODE_CLI_OK');
    console.log(json({ passed, model: prepared.selected, effort: prepared.effort, exitCode: result.code, scope: 'provider-connectivity-only' }));
    process.exitCode = passed ? 0 : result.code || 1;
  } else process.exitCode = result.code;
}
try { await main(); }
catch (error) {
  console.error(json({ error: { code: error.code ?? 'RUNNER_FAILED', message: error instanceof RunnerError ? error.message : 'Operation failed. Inspect paths and permissions; configuration contents are suppressed.' } }));
  process.exitCode = 2;
}
