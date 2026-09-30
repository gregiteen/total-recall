/**
 * Creative Search config — view and update plugin settings.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const CONFIG_PATH = process.env.AGENT_DIR
  ? path.join(process.env.AGENT_DIR, 'skills', 'total-recall', 'plugins', 'creative-search', 'config.json')
  : path.join(os.homedir(), '.config', 'total-recall', 'creative-search', 'config.json');

const DEFAULTS = {
  searxngUrl: 'http://100.64.0.1:8888',
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

function loadConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function run(argv) {
  const sub = argv[3] || 'show';
  switch (sub) {
    case 'show': {
      const c = loadConfig();
      console.log('\n⚙️  Creative Search — Configuration\n');
      for (const [k, v] of Object.entries(c)) {
        const desc = CATEGORY_DESCRIPTIONS[k];
        console.log(`  ${k}: ${JSON.stringify(v)}`);
        if (desc) console.log(`       ${desc}`);
        console.log();
      }
      console.log(`  Config file: ${CONFIG_PATH}\n`);
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
      const c = loadConfig();
      // Parse numbers, booleans, and arrays
      if (key === 'categories' || key === 'engineGroups') {
        c[key] = value.split(',').map(s => s.trim());
      } else if (key === 'deepResearchSteps' || key === 'maxResults' || key === 'timeoutMs') {
        c[key] = parseInt(value, 10);
      } else if (value === 'true') {
        c[key] = true;
      } else if (value === 'false') {
        c[key] = false;
      } else if (!isNaN(value)) {
        c[key] = +value;
      } else {
        c[key] = value;
      }
      saveConfig(c);
      console.log(`✅ Set ${key} = ${JSON.stringify(c[key])}`);
      return { data: { [key]: c[key] } };
    }
    case 'reset':
      saveConfig({ ...DEFAULTS });
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