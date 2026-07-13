import fs from 'fs';
let settings = fs.readFileSync('frontend/src/pages/SettingsPage.tsx', 'utf8');

// Remove unused function if still present
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

let types = fs.readFileSync('frontend/src/types.ts', 'utf8');

types = types.replace(/security: \{/g, `security: {\n    auth?: { allow_static_pats?: boolean }\n    telemetry?: { enabled?: boolean }`);

fs.writeFileSync('frontend/src/types.ts', types);
