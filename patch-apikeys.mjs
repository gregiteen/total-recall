import fs from 'fs';

let content = fs.readFileSync('frontend/src/pages/ApiKeysPage.tsx', 'utf8');

// 1. Add types to imports
content = content.replace(/type WebAuthnStatus,\s*\} from '\.\.\/api'/g, `type WebAuthnStatus,
  fetchConfigJson,
  saveConfigJson,
  fetchGeminiModels,
  fetchClaudeModels,
  fetchOpenaiModels,
  fetchOpenRouterModels
} from '../api'`);

content = content.replace(/import \{ startRegistration/g, `import type { ConfigJson, GeminiModelInfo } from '../types'\nimport { startRegistration`);

// 2. Add 'cloud' to Tab
content = content.replace(/type Tab = 'catalog' \| 'pats' \| 'import'/g, `type Tab = 'catalog' | 'pats' | 'import' | 'cloud'`);

// 3. Add state variables inside component
const stateVars = `
  const [configData, setConfigData] = useState<ConfigJson | null>(null)
  const [geminiModels, setGeminiModels] = useState<GeminiModelInfo[]>([])
  const [claudeModels, setClaudeModels] = useState<GeminiModelInfo[]>([])
  const [openaiModels, setOpenaiModels] = useState<GeminiModelInfo[]>([])
  const [orModels, setOrModels] = useState<GeminiModelInfo[]>([])
  const [configSuccess, setConfigSuccess] = useState<string | null>(null)
`;
content = content.replace(/const \[tab, setTab\] = useState<Tab>\('catalog'\)/g, `const [tab, setTab] = useState<Tab>('catalog')\n${stateVars}`);

// 4. Update loadCatalog to also fetch config and models
const fetchModelsCode = `
    try {
      const config = await fetchConfigJson()
      if (!config.secrets) config.secrets = {}
      if (!config.brain) config.brain = {}
      setConfigData(config)

      const gem = await fetchGeminiModels().catch(() => [])
      setGeminiModels(gem)
      const cla = await fetchClaudeModels().catch(() => [])
      setClaudeModels(cla)
      const open = await fetchOpenaiModels().catch(() => [])
      setOpenaiModels(open)
      const or = await fetchOpenRouterModels().catch(() => [])
      setOrModels(or)
    } catch(e) {}
`;
content = content.replace(/const data = await fetchSecretsCatalog\(\)/, `${fetchModelsCode}\n      const data = await fetchSecretsCatalog()`);

// 5. Add updateHelpers
const updateHelpers = `
  const updateSecretsProp = (prop: string, value: string) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      secrets: { ...configData.secrets, [prop]: value }
    });
  };

  const updateBrainProp = (prop: string, value: string) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      brain: { ...configData.brain, [prop]: value }
    });
  };

  const handleSaveConfig = async () => {
    if (!configData) return;
    setSaving(true);
    setError(null);
    setConfigSuccess(null);
    try {
      await saveConfigJson(configData);
      setConfigSuccess('Configuration saved successfully. Kernel will hot-reload settings.');
      setTimeout(() => setConfigSuccess(null), 4000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };
`;
content = content.replace(/function metaForm\(k: SecretCatalogKey\): MetaEdit \{/, `${updateHelpers}\n  function metaForm(k: SecretCatalogKey): MetaEdit {`);

// 6. Add tab button
content = content.replace(/\{ id: 'import' as Tab, label: 'Import from env' \},/, `{ id: 'import' as Tab, label: 'Import from env' },\n            { id: 'cloud' as Tab, label: 'Cloud Models (API)' },`);

fs.writeFileSync('frontend/src/pages/ApiKeysPage.tsx', content);
console.log('patched');
