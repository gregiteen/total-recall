import fs from 'fs';
let settings = fs.readFileSync('frontend/src/pages/SettingsPage.tsx', 'utf8');

// Remove unused state
settings = settings.replace(/const \[domainToBlock, setDomainToBlock\] = useState\(''\);\n/, '');

// Remove unused function
const removeUpdateSecret = `  const updateSecretProp = (prop: string, value: string) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      secrets: {
        ...configData.secrets,
        [prop]: value,
      },
    });
  };`;
settings = settings.replace(removeUpdateSecret, '');

// Save SettingsPage.tsx
fs.writeFileSync('frontend/src/pages/SettingsPage.tsx', settings);

// Fix types.ts
let types = fs.readFileSync('frontend/src/types.ts', 'utf8');
types = types.replace(/brain\?: \{/, `brain?: {\n    url?: string\n    name?: string\n    role?: string\n    layer?: string\n    tags?: string\n    full_brain?: boolean`);
types = types.replace(/network\?: \{/, `network?: {\n      trusted_proxies?: string`);
types = types.replace(/security: \{/, `security: {\n    auth?: {\n      allow_static_pats?: boolean\n    }\n    telemetry?: {\n      enabled?: boolean\n    }`);

fs.writeFileSync('frontend/src/types.ts', types);
