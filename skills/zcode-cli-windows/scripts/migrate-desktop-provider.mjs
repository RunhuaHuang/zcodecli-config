#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function usage() {
  console.log(`Usage: migrate-desktop-provider.mjs [options]

Read the desktop ZCode provider configuration and emit a redacted CLI provider
fragment. API keys and the desktop options object are intentionally omitted.

Options:
  --input <path>          Desktop config path; default is ~/.zcode/v2/config.json
  --output <path>         Write JSON to a file instead of stdout
  --provider-id <id>      Export one desktop provider; default exports all
  --help                  Show this message
`);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--input' || arg === '--output' || arg === '--provider-id') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} needs a value`);
      }
      options[arg.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

function cliProviderId(desktopId) {
  const withoutBuiltin = desktopId.startsWith('builtin:')
    ? desktopId.slice('builtin:'.length)
    : desktopId;
  return withoutBuiltin === 'bigmodel-coding-plan'
    ? 'bigmodel'
    : withoutBuiltin;
}

function copyLimit(limit) {
  if (!limit || typeof limit !== 'object') return undefined;
  const result = {};
  for (const key of ['context', 'output']) {
    if (Number.isFinite(limit[key])) result[key] = limit[key];
  }
  return Object.keys(result).length ? result : undefined;
}

function copyModalities(modalities) {
  if (!modalities || typeof modalities !== 'object') return undefined;
  const result = {};
  for (const key of ['input', 'output']) {
    if (Array.isArray(modalities[key])) result[key] = modalities[key];
  }
  return Object.keys(result).length ? result : undefined;
}

function copyWithoutSecrets(value) {
  if (Array.isArray(value)) return value.map(copyWithoutSecrets);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/api.?key|authorization|token|secret|password/i.test(key)) continue;
    result[key] = copyWithoutSecrets(nested);
  }
  return result;
}

function copyReasoning(reasoning) {
  if (!reasoning || typeof reasoning !== 'object') return undefined;
  const levels = Array.isArray(reasoning.levels)
    ? reasoning.levels
    : Array.isArray(reasoning.variants)
      ? reasoning.variants
      : undefined;
  const defaultLevel = reasoning.defaultLevel ?? reasoning.defaultVariant;
  const result = {};
  if (typeof reasoning.enabled === 'boolean') result.enabled = reasoning.enabled;
  if (levels) result.levels = levels;
  if (typeof defaultLevel === 'string') result.defaultLevel = defaultLevel;
  if (reasoning.providerOptionsByLevel && typeof reasoning.providerOptionsByLevel === 'object') {
    result.providerOptionsByLevel = copyWithoutSecrets(reasoning.providerOptionsByLevel);
  }
  return Object.keys(result).length ? result : undefined;
}

function copyModel(model) {
  const result = {};
  if (typeof model?.name === 'string') result.name = model.name;
  const reasoning = copyReasoning(model?.reasoning);
  const limit = copyLimit(model?.limit);
  const modalities = copyModalities(model?.modalities);
  if (reasoning) result.reasoning = reasoning;
  if (limit) result.limit = limit;
  if (modalities) result.modalities = modalities;
  return result;
}

function copyProvider(desktopProvider) {
  const result = {};
  if (typeof desktopProvider?.name === 'string') result.name = desktopProvider.name;
  if (typeof desktopProvider?.kind === 'string') result.kind = desktopProvider.kind;
  const baseURL = desktopProvider?.baseURL ?? desktopProvider?.options?.baseURL;
  if (typeof baseURL === 'string' && baseURL) result.baseURL = baseURL;
  if (typeof desktopProvider?.enabled === 'boolean') result.enabled = desktopProvider.enabled;
  result.source = 'custom';
  result.models = {};
  for (const [modelId, model] of Object.entries(desktopProvider?.models ?? {})) {
    result.models[modelId] = copyModel(model);
  }
  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const inputPath = path.resolve(options.input ?? path.join(os.homedir(), '.zcode', 'v2', 'config.json'));
  let desktopConfig;
  try {
    desktopConfig = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read desktop config ${inputPath}: ${error.message}`);
  }

  const desktopProviders = desktopConfig?.provider;
  if (!desktopProviders || typeof desktopProviders !== 'object') {
    throw new Error('desktop config has no provider object');
  }

  const selectedIds = options['provider-id']
    ? [options['provider-id']]
    : Object.keys(desktopProviders);
  const result = { provider: {} };
  for (const desktopId of selectedIds) {
    if (!desktopProviders[desktopId]) {
      throw new Error(`desktop provider not found: ${desktopId}`);
    }
    const cliId = cliProviderId(desktopId);
    if (result.provider[cliId]) {
      throw new Error(`provider ID collision after migration: ${cliId}`);
    }
    result.provider[cliId] = copyProvider(desktopProviders[desktopId]);
  }

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, { mode: 0o600 });
    try {
      fs.chmodSync(outputPath, 0o600);
    } catch {
      // NTFS does not expose POSIX mode bits; the user's profile ACL protects it.
    }
    console.error(`wrote redacted provider fragment to ${outputPath}`);
  } else {
    process.stdout.write(output);
  }
}

try {
  main();
} catch (error) {
  console.error(`migrate-desktop-provider: ${error.message}`);
  process.exitCode = 2;
}
