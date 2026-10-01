/**
 * Creative Search config — view and update plugin settings.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  searxngUrl: '',
  defaultLang: 'en',
  maxResults: 15,
  categories: ['general', 'science'],
  deepResearchSteps: 3,
  autoSave: false,
  timeoutMs: 10000,
  includeSnippets: true,
  engineGroups: ['web', 'research', 'news', 'code', 'images'],
};

const CATEGORY_DESCRIPTIONS = {
  categories: 'Default search categories (comma-separated: general,science,news,images,videos,music,it,files,social media)',
  engineGroups: 'Engine groups to use: web,research,news,code,images (comma-separated)',
  deepResearchSteps: 'Number of iterative search rounds in deep research (1-5)',
  autoSave: 'Automatically save searches to TR memory (true/false)',
  maxResults: 'Maximum results per search',
  includeSnippets: 'Include content snippets in results',
  searxngUrl: 'SearXNG instance URL',
  defaultLang: 'Default search language',
  timeoutMs: 'Request timeout in milliseconds',
};

export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration must be an object');
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULTS, key)) throw new Error(`Unsupported setting: ${key}`);
  const config = { ...DEFAULTS, ...input };
  if (typeof config.searxngUrl !== 'string') throw new Error('Instance URL must be a string');
  if (config.searxngUrl) {
    const url = new URL(config.searxngUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use HTTP(S) without URL credentials, query or fragment');
    config.searxngUrl = url.href.replace(/\/$/, '');
  }
  for (const [key, min, max] of [['maxResults', 1, 100], ['timeoutMs', 100, 60000], ['deepResearchSteps', 1, 5]]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`${key} must be ${min}..${max}`);
  }
  for (const key of ['categories', 'engineGroups']) if (!Array.isArray(config[key]) || config[key].some(v => typeof v !== 'string' || !v.trim())) throw new Error(`${key} must contain strings`);
  for (const key of ['autoSave', 'includeSnippets']) if (typeof config[key] !== 'boolean') throw new Error(`${key} must be boolean`);
  if (typeof config.defaultLang !== 'string' || !config.defaultLang.trim()) throw new Error('Language must be nonempty');
  return config;
}

async function hostApi({ packageRoot = process.env.TR_PACKAGE_ROOT, projectRoot = process.cwd(), plugin } = {}) {
  if (!packageRoot) throw new Error('Run through the Total Recall plugin host');
  const load = name => import(pathToFileURL(path.join(packageRoot, 'src/core', name)).href);
  const [{ getPlugin }, store] = await Promise.all([load('plugin-loader.mjs'), load('plugin-store.mjs')]);
  const installed = plugin || getPlugin('creative-search', projectRoot);
  if (!installed?.valid) throw new Error('Install Creative Search first');
  return { plugin: installed, store };
}

export async function loadConfig(host) {
  const { plugin, store } = await hostApi(host);
  const config = store.readPluginRecord(plugin)?.search_config || {};
  return validateConfig({ ...config, ...(process.env.SEARXNG_URL ? { searxngUrl: process.env.SEARXNG_URL } : {}) });
}

async function saveConfig(config) {
  const { plugin, store } = await hostApi();
  await store.patchPluginRecord(plugin, { search_config: validateConfig(config) });
}

export async function run(argv) {
  const sub = argv[3] || 'show';
  switch (sub) {
    case 'show': {
      const c = await loadConfig();
      console.log('\n⚙️  Creative Search — Configuration\n');
      for (const [k, v] of Object.entries(c)) {
        const desc = CATEGORY_DESCRIPTIONS[k];
        console.log(`  ${k}: ${JSON.stringify(v)}`);
        if (desc) console.log(`       ${desc}`);
        console.log();
      }
      console.log('  Storage: SSSS plugin record\n');
      return { data: c };
    }
    case 'set': {
      const key = argv[4], value = argv[5];
      if (!key || !value) {
        console.error('Usage: total-recall csearch-config set <key> <value>');
        console.log('\nValid keys:');
        for (const [k, desc] of Object.entries(CATEGORY_DESCRIPTIONS)) {
          console.log(`  ${k} — ${desc}`);
        }
        process.exitCode = 1;
        return;
      }
      if (!Object.hasOwn(DEFAULTS, key)) throw new Error(`Unsupported setting: ${key}`);
      const { plugin, store } = await hostApi();
      const c = validateConfig(store.readPluginRecord(plugin)?.search_config || {});
      // Parse numbers, booleans, and arrays
      if (key === 'categories' || key === 'engineGroups') {
        c[key] = value.split(',').map(s => s.trim());
      } else if (key === 'deepResearchSteps' || key === 'maxResults' || key === 'timeoutMs') {
        c[key] = Number(value);
      } else if (value === 'true') {
        c[key] = true;
      } else if (value === 'false') {
        c[key] = false;
      } else if (!isNaN(value)) {
        c[key] = +value;
      } else {
        c[key] = value;
      }
      await saveConfig(c);
      console.log(`✅ Set ${key} = ${JSON.stringify(c[key])}`);
      return { data: { [key]: c[key] } };
    }
    case 'reset':
      await saveConfig({ ...DEFAULTS });
      console.log('✅ Config reset to defaults');
      return { data: { ...DEFAULTS } };
    default:
      console.log('Usage: total-recall csearch-config show|set <key> <value>|reset');
      console.log('\nValid keys:');
      for (const [k, desc] of Object.entries(CATEGORY_DESCRIPTIONS)) {
        console.log(`  ${k} — ${desc}`);
      }
      return { data: { keys: Object.keys(CATEGORY_DESCRIPTIONS) } };
  }
}
