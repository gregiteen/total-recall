/**
 * OpenWiki Configuration Management
 * Handles persistent settings for documentation generation, provider selection, and cheap model routing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_OPENWIKI_CONFIG = Object.freeze({
  provider: 'openrouter',
  model: 'deepseek/deepseek-chat',
  fallback_model: 'deepseek/deepseek-chat',
  max_tokens: 4096,
  timeout_ms: 300000
});

export const ALLOWED_CONFIG_KEYS = Object.freeze([
  'provider',
  'model',
  'fallback_model',
  'max_tokens',
  'timeout_ms'
]);

export const ALLOWED_PROVIDERS = Object.freeze([
  'openrouter',
  'google',
  'custom'
]);

/** Resolve the active configuration file path. */
export function resolveConfigPath(options = {}) {
  if (options.configPath) return options.configPath;
  if (process.env.OPENWIKI_CONFIG_PATH) return process.env.OPENWIKI_CONFIG_PATH;
  const home = options.home || os.homedir();
  return path.join(home, '.agent', 'skills', 'total-recall', 'config', 'openwiki.json');
}

/** Load current OpenWiki configuration merged with defaults. */
export function loadOpenWikiConfig(options = {}) {
  const filePath = resolveConfigPath(options);
  try {
    if (!fs.existsSync(filePath)) {
      return { ...DEFAULT_OPENWIKI_CONFIG };
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_OPENWIKI_CONFIG };
    }
    return {
      provider: typeof parsed.provider === 'string' && parsed.provider ? parsed.provider : DEFAULT_OPENWIKI_CONFIG.provider,
      model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_OPENWIKI_CONFIG.model,
      fallback_model: typeof parsed.fallback_model === 'string' && parsed.fallback_model ? parsed.fallback_model : DEFAULT_OPENWIKI_CONFIG.fallback_model,
      max_tokens: Number.isInteger(parsed.max_tokens) && parsed.max_tokens >= 512 && parsed.max_tokens <= 131072
        ? parsed.max_tokens
        : DEFAULT_OPENWIKI_CONFIG.max_tokens,
      timeout_ms: Number.isInteger(parsed.timeout_ms) && parsed.timeout_ms >= 30000 && parsed.timeout_ms <= 1800000
        ? parsed.timeout_ms
        : DEFAULT_OPENWIKI_CONFIG.timeout_ms
    };
  } catch {
    return { ...DEFAULT_OPENWIKI_CONFIG };
  }
}

/** Save configuration atomically to disk. */
export function saveOpenWikiConfig(config, options = {}) {
  const filePath = resolveConfigPath(options);
  const validated = {
    provider: String(config.provider || DEFAULT_OPENWIKI_CONFIG.provider).toLowerCase(),
    model: String(config.model || DEFAULT_OPENWIKI_CONFIG.model).trim(),
    fallback_model: String(config.fallback_model || DEFAULT_OPENWIKI_CONFIG.fallback_model).trim(),
    max_tokens: Number.isInteger(Number(config.max_tokens)) ? Math.max(512, Math.min(131072, Number(config.max_tokens))) : DEFAULT_OPENWIKI_CONFIG.max_tokens,
    timeout_ms: Number.isInteger(Number(config.timeout_ms)) ? Math.max(30000, Math.min(1800000, Number(config.timeout_ms))) : DEFAULT_OPENWIKI_CONFIG.timeout_ms
  };

  if (!ALLOWED_PROVIDERS.includes(validated.provider)) {
    throw new Error(`Invalid provider: ${validated.provider}. Allowed: ${ALLOWED_PROVIDERS.join(', ')}`);
  }
  if (!validated.model) {
    throw new Error('Model identifier cannot be empty');
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
  return validated;
}

/** Update a single configuration key. */
export function setOpenWikiConfigValue(key, value, options = {}) {
  if (!ALLOWED_CONFIG_KEYS.includes(key)) {
    throw new Error(`Unknown configuration key: ${key}. Allowed: ${ALLOWED_CONFIG_KEYS.join(', ')}`);
  }

  const current = loadOpenWikiConfig(options);
  let coercedValue = value;

  if (key === 'max_tokens' || key === 'timeout_ms') {
    const num = Number(value);
    if (!Number.isInteger(num)) {
      throw new Error(`${key} must be an integer`);
    }
    coercedValue = num;
  } else if (key === 'provider') {
    const p = String(value).toLowerCase().trim();
    if (!ALLOWED_PROVIDERS.includes(p)) {
      throw new Error(`Invalid provider: ${p}. Allowed: ${ALLOWED_PROVIDERS.join(', ')}`);
    }
    coercedValue = p;
  } else {
    coercedValue = String(value).trim();
    if (!coercedValue) throw new Error(`${key} cannot be empty`);
  }

  current[key] = coercedValue;
  return saveOpenWikiConfig(current, options);
}

/** Reset configuration to defaults. */
export function resetOpenWikiConfig(options = {}) {
  return saveOpenWikiConfig(DEFAULT_OPENWIKI_CONFIG, options);
}
