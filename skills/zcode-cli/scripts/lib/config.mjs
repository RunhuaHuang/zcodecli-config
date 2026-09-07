import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class RunnerError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const fail = (code, message) => { throw new RunnerError(code, message); };
export const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const own = (value, key) => record(value) && Object.hasOwn(value, key);
export const json = value => JSON.stringify(value, null, 2) + '\n';
export function readConfig(file, missingOK = false) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT' && missingOK) return {};
    fail('CONFIG_UNREADABLE', 'Cannot read configuration. Check its path and permissions.');
  }
  let value;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { fail('CONFIG_INVALID_JSON', 'Configuration is not valid JSON; its contents are suppressed.'); }
  if (!record(value)) fail('CONFIG_INVALID_SHAPE', 'Configuration must be a JSON object.');
  assertSafeKeys(value);
  return value;
}
function assertSafeKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      fail('CONFIG_UNSAFE_KEY', 'Configuration contains an unsupported object key.');
    assertSafeKeys(nested);
  }
}
export function cleanURL(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return undefined;
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.toString();
  } catch { return undefined; }
}
const secretKey = key => /^(apikey|authorization|proxyauthorization|accesstoken|refreshtoken|idtoken|token|secret|clientsecret|password|passwd|cookie|setcookie|credentials)$/i.test(key.replace(/[-_]/g, ''));
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!record(value)) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, nested]) => {
    if (secretKey(key)) return [];
    if (/url|endpoint/i.test(key) && typeof nested === 'string') return [[key, cleanURL(nested) ?? '[invalid URL]']];
    return [[key, redact(nested)]];
  }));
}
function safeMapping(mapping, kind) {
  if (!record(mapping)) return undefined;
  const result = {};
  // Export only request parameters understood by these SDK adapters. Never export
  // arbitrary headers/metadata. Budget fields are parameters, not credentials.
  for (const ns of ['anthropic', 'openai', 'openaiCompatible']) {
    if (!record(mapping[ns])) continue;
    const source = mapping[ns], target = {};
    for (const key of ['effort', 'reasoningEffort', 'reasoningSummary']) {
      if (typeof source[key] === 'string' && /^[a-z_-]{1,32}$/i.test(source[key])) target[key] = source[key];
    }
    for (const key of ['maxTokens', 'max_tokens']) {
      if (Number.isInteger(source[key]) && source[key] > 0) target[key] = source[key];
    }
    if (record(source.thinking)) {
      const thinking = source.thinking;
      if (['enabled', 'disabled', 'adaptive'].includes(thinking.type)) {
        target.thinking = { type: thinking.type };
        for (const key of ['budgetTokens', 'budget_tokens'])
          if (Number.isInteger(thinking[key]) && thinking[key] > 0) target.thinking[key] = thinking[key];
      }
    }
    if (Object.keys(target).length) result[ns] = target;
  }
  if (Object.keys(result).length) return result;
  // Recognize the exact legacy Anthropic shape used by releases before 0.3.
  const converted = convertLegacyMapping(mapping, kind);
  return converted !== mapping ? safeMapping(converted, kind) : undefined;
}
function convertLegacyMapping(mapping, kind) {
  if (kind !== 'anthropic' || !record(mapping) || mapping.anthropic) return mapping;
  if (Object.keys(mapping).some(k => !['thinking', 'output_config'].includes(k))) return mapping;
  if (!record(mapping.thinking) && !record(mapping.output_config)) return mapping;
  if (mapping.output_config && Object.keys(mapping.output_config).some(k => k !== 'effort')) return mapping;
  const anthropic = {};
  if (mapping.output_config?.effort) anthropic.effort = mapping.output_config.effort;
  if (mapping.thinking) {
    anthropic.thinking = structuredClone(mapping.thinking);
    if (anthropic.thinking.budget_tokens !== undefined) {
      anthropic.thinking.budgetTokens = anthropic.thinking.budget_tokens;
      delete anthropic.thinking.budget_tokens;
    }
  }
  return { anthropic };
}
export function normalizeConfig(input) {
  const config = structuredClone(input), changes = [];
  if (config.provider !== undefined && !record(config.provider))
    fail('PROVIDER_INVALID', 'provider must be an object.');
  for (const [id, provider] of Object.entries(config.provider ?? {})) {
    if (!record(provider)) fail('PROVIDER_INVALID', 'Every provider must be an object.');
    provider.options ??= {};
    if (!record(provider.options)) fail('PROVIDER_OPTIONS_INVALID', 'Provider options must be an object.');
    for (const key of ['apiKey', 'baseURL']) {
      if (provider[key] === undefined) continue;
      if (provider.options[key] !== undefined && provider.options[key] !== provider[key])
        fail('PROVIDER_FIELD_CONFLICT', 'Top-level and options connection fields disagree. Resolve the selected provider locally.');
      provider.options[key] = provider[key];
      delete provider[key];
      changes.push({ code: 'CONNECTION_MOVED_TO_OPTIONS', provider: id, field: key });
    }
    for (const [modelId, model] of Object.entries(provider.models ?? {})) {
      const reasoning = model?.reasoning;
      if (!record(reasoning)) continue;
      if (!reasoning.levels && Array.isArray(reasoning.variants)) {
        reasoning.levels = reasoning.variants.map(v => typeof v === 'string' ? v : v.value).filter(v => typeof v === 'string');
        delete reasoning.variants;
        changes.push({ code: 'REASONING_LEVELS_NORMALIZED', provider: id, model: modelId });
      }
      if (reasoning.defaultLevel === undefined && reasoning.defaultVariant !== undefined) {
        reasoning.defaultLevel = reasoning.defaultVariant; delete reasoning.defaultVariant;
      }
      for (const [level, mapping] of Object.entries(reasoning.providerOptionsByLevel ?? {})) {
        const next = convertLegacyMapping(mapping, provider.kind);
        if (next !== mapping) {
          reasoning.providerOptionsByLevel[level] = next;
          changes.push({ code: 'REASONING_MAPPING_NORMALIZED', provider: id, model: modelId, level });
        }
      }
    }
  }
  return { config, changes };
}
export function resolveModel(config, target = config.model?.main) {
  if (typeof target !== 'string' || !target.includes('/'))
    fail('MODEL_REQUIRED', 'Select a configured provider/model using --model.');
  const slash = target.indexOf('/'), providerId = target.slice(0, slash), modelId = target.slice(slash + 1);
  if (!providerId || !modelId || !own(config.provider, providerId) || !own(config.provider[providerId].models, modelId))
    fail('MODEL_NOT_FOUND', 'Requested provider/model is not present in the selected configuration.');
  const provider = config.provider[providerId], model = provider.models[modelId];
  if (provider.enabled === false) fail('PROVIDER_DISABLED', 'The selected provider is disabled.');
  return { target, providerId, modelId, provider, model };
}
export function validateEffort(provider, model, effort) {
  if (!effort) return;
  const r = model.reasoning;
  if (r?.enabled === false || !Array.isArray(r?.levels) || !r.levels.includes(effort))
    fail('EFFORT_UNSUPPORTED', 'Requested effort is not enabled in reasoning.levels.');
  const map = r.providerOptionsByLevel?.[effort];
  const ns = { anthropic: 'anthropic', openai: 'openai', 'openai-compatible': 'openaiCompatible' }[provider.kind];
  if (!ns || !record(map?.[ns]) || !Object.keys(map[ns]).length)
    fail('EFFORT_MAPPING_MISSING', 'Requested effort has no SDK-namespaced request mapping.');
}
export function validateConnection(provider, env = process.env) {
  if (!['anthropic', 'openai-compatible', 'openai'].includes(provider.kind))
    fail('PROTOCOL_UNKNOWN', 'Provider kind must explicitly identify a supported API protocol.');
  if (!cleanURL(provider.options?.baseURL))
    fail('ENDPOINT_REQUIRED', 'Set the provider options.baseURL to the verified API endpoint.');
  const key = provider.options?.apiKey;
  const inferred = provider.kind === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  if (!key && !inferred && !env.ZCODE_API_KEY && provider.options?.apiKeyRequired !== false)
    fail('AUTH_REQUIRED', 'No API key is configured. Supply credentials locally; do not paste them into logs.');
}
export function inventory(config, env = process.env) {
  return Object.entries(config.provider ?? {}).map(([id, p]) => ({
    id, kind: p.kind ?? null, enabled: p.enabled !== false,
    endpoint: cleanURL(p.options?.baseURL ?? p.baseURL) ?? null,
    auth: (p.options?.apiKey || p.apiKey) ? 'configured' : 'missing-or-environment',
    models: Object.entries(p.models ?? {}).map(([id, m]) => ({
      id, levels: m.reasoning?.levels ?? m.reasoning?.variants ?? [],
      defaultLevel: m.reasoning?.defaultLevel ?? m.reasoning?.defaultVariant ?? null
    }))
  }));
}
export function migrateDesktop(input, selectedId, targetId) {
  if (!record(input.provider)) fail('PROVIDER_MISSING', 'Desktop configuration has no provider object.');
  if (targetId && !selectedId) fail('PROVIDER_REQUIRED', '--target-id requires --provider-id.');
  const result = { provider: {} }, warnings = [];
  const ids = selectedId ? [selectedId] : Object.keys(input.provider);
  for (const sourceId of ids) {
    if (!own(input.provider, sourceId)) fail('PROVIDER_NOT_FOUND', 'The selected desktop provider does not exist.');
    const id = targetId ?? (sourceId === 'builtin:bigmodel-coding-plan' ? 'bigmodel' : sourceId);
    if (id.includes('/') || !id || own(result.provider, id))
      fail('PROVIDER_ID_CONFLICT', 'Choose a unique CLI provider ID using --target-id.');
    const p = input.provider[sourceId], out = { source: 'custom', models: {} };
    if (typeof p.name === 'string') out.name = p.name;
    if (typeof p.kind === 'string') out.kind = p.kind;
    if (typeof p.enabled === 'boolean') out.enabled = p.enabled;
    const rawURL = p.options?.baseURL ?? p.baseURL, baseURL = cleanURL(rawURL);
    out.options = baseURL ? { baseURL } : {};
    if (!baseURL) warnings.push({ code: 'ENDPOINT_REQUIRED', provider: id });
    if (baseURL && baseURL !== rawURL) warnings.push({ code: 'ENDPOINT_SANITIZED_REVIEW_REQUIRED', provider: id });
    for (const [modelId, model] of Object.entries(p.models ?? {})) {
      const m = {};
      if (typeof model.name === 'string') m.name = model.name;
      for (const field of ['context', 'output']) {
        if (Number.isFinite(model.limit?.[field]) && model.limit[field] > 0)
          (m.limit ??= {})[field] = model.limit[field];
      }
      for (const direction of ['input', 'output']) {
        if (Array.isArray(model.modalities?.[direction]))
          (m.modalities ??= {})[direction] = model.modalities[direction].filter(v => ['text', 'image', 'audio', 'video', 'pdf'].includes(v));
      }
      if (record(model.reasoning)) {
        const r = model.reasoning, levels = r.levels ?? r.variants;
        m.reasoning = { enabled: r.enabled !== false };
        if (Array.isArray(levels)) m.reasoning.levels = levels.map(v => typeof v === 'string' ? v : v?.value).filter(v => typeof v === 'string' && /^[a-z0-9_-]+$/i.test(v));
        const def = r.defaultLevel ?? r.defaultVariant;
        if (m.reasoning.levels?.includes(def)) m.reasoning.defaultLevel = def;
        for (const [level, mapping] of Object.entries(r.providerOptionsByLevel ?? {})) {
          const safe = safeMapping(mapping, p.kind);
          if (safe) (m.reasoning.providerOptionsByLevel ??= {})[level] = safe;
          if (JSON.stringify(safe) !== JSON.stringify(mapping))
            warnings.push({ code: 'MAPPING_REVIEW_REQUIRED', provider: id, model: modelId, level });
        }
      }
      out.models[modelId] = m;
    }
    result.provider[id] = out;
  }
  return { fragment: result, warnings };
}
export function mergeConfig(existing, fragment) {
  const merged = structuredClone(existing);
  merged.provider ??= {};
  for (const [id, p] of Object.entries(fragment.provider ?? {})) {
    const old = merged.provider[id] ?? {};
    merged.provider[id] = { ...old, ...p, options: { ...old.options, ...p.options }, models: { ...old.models } };
    for (const [modelId, m] of Object.entries(p.models ?? {}))
      merged.provider[id].models[modelId] = { ...old.models?.[modelId], ...m };
  }
  return merged;
}
export function writeNewJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(file, json(value), { flag: 'wx', mode: 0o600 }); }
  catch (e) {
    if (e.code === 'EEXIST') fail('OUTPUT_EXISTS', 'Output already exists; choose a new file.');
    fail('OUTPUT_WRITE_FAILED', 'Cannot create the output file.');
  }
}
export function replaceConfig(file, config, expectedBytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
    fail('SYMLINK_CONFIG', 'Refusing to replace a symlinked configuration.');
  const lock = file + '.runner.lock';
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch { fail('CONFIG_LOCKED', 'Another configuration update is active; inspect the lock before retrying.'); }
  let backup = null, temp;
  try {
    const current = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if ((current?.toString() ?? null) !== (expectedBytes?.toString() ?? null))
      fail('CONFIG_CHANGED', 'Configuration changed during preparation; rerun the preview.');
    if (current) {
      backup = file + '.backup-' + randomUUID();
      fs.writeFileSync(backup, current, { flag: 'wx', mode: 0o600 });
    }
    temp = file + '.tmp-' + randomUUID();
    fs.writeFileSync(temp, json(config), { flag: 'wx', mode: 0o600 });
    try {
      fs.renameSync(temp, file);
    } catch (error) {
      if (!['EPERM', 'EEXIST', 'EACCES'].includes(error.code)) throw error;
      // A recoverable backup already exists. Remove the now-old destination
      // on platforms whose rename does not replace files, then retry once.
      fs.unlinkSync(file);
      fs.renameSync(temp, file);
    }
    return { backup };
  } finally {
    if (temp && fs.existsSync(temp)) fs.unlinkSync(temp);
    if (fd !== undefined) fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
