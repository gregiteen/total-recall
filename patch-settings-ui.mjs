import fs from 'fs';

let content = fs.readFileSync('frontend/src/pages/SettingsPage.tsx', 'utf8');

// 1. Add types and imports
content = content.replace(/import \{ fetchConfigJson, saveConfigJson, runSandbox \} from '\.\.\/api';/, `import { fetchConfigJson, saveConfigJson, runSandbox, fetchHealth, runAgentDiagnostics } from '../api';\nimport type { HealthData } from '../types';`);

// 2. Add state
const stateVars = `
  const [health, setHealth] = useState<HealthData | null>(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string | null>(null);
`;
content = content.replace(/const \[domainToBlock, setDomainToBlock\] = useState\(''\);/, `const [domainToBlock, setDomainToBlock] = useState('');\n${stateVars}`);

// 3. fetchHealth
content = content.replace(/fetchConfigJson\(\)/, `fetchHealth().then(setHealth).catch(console.error);\n    fetchConfigJson()`);

// 4. AGENTS_LIST and handleRunDiagnostics
const extraLogic = `
  const AGENTS_LIST = [
    { id: 'antigravity', name: 'Antigravity (Gemini SDK)', desc: 'Primary core developer agent' },
    { id: 'gemini', name: 'Gemini CLI', desc: 'Direct Gemini assistant binary' },
    { id: 'claude', name: 'Claude Code', desc: 'Anthropic developer CLI wrapper' },
    { id: 'codex', name: 'Codex CLI', desc: 'OpenAI agent binary integration' }
  ];

  const handleRunDiagnostics = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunningDiagnostics(true);
    setDiagnosticLogs(null);
    try {
      const res = await runAgentDiagnostics();
      setDiagnosticLogs(res.output);
      fetchHealth().then(setHealth).catch(console.error);
    } catch (err: any) {
      setDiagnosticLogs('Error: ' + err.message);
    } finally {
      setRunningDiagnostics(false);
    }
  };
`;
content = content.replace(/const handleSaveVisual = async \(\) => \{/, `${extraLogic}\n  const handleSaveVisual = async () => {`);

// 5. Inject Ollama and CLI Agents panels at the end of settings-grid
const modelsPageContent = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');
const ollamaPanelMatch = modelsPageContent.match(/\{\/\* Ollama Panel \*\/\}([\s\S]*?)\{\/\* Cloud API Keys Panel \*\/\}/);
const cliAgentsMatch = modelsPageContent.match(/\{\/\* CLI Agents Catalog & Diagnostics \*\/\}([\s\S]*?)<\/div>\s*<\/div>\s*\)\}\s*<\/div>/);

if (ollamaPanelMatch && cliAgentsMatch) {
  let ollamaPanel = ollamaPanelMatch[1].trim();
  let cliAgents = cliAgentsMatch[1].trim();
  
  // They are flex items inside grid, so we can just append them to the settings-grid div
  content = content.replace(/\{sandboxLog && \(\s*<div className="terminal-log">[\s\S]*?<\/div>\s*\)\}\s*<\/div>\s*<\/div>/, `$&
        {/* Ollama Panel */}
        ${ollamaPanel}
        {/* CLI Agents */}
        ${cliAgents}
      </div>`);
} else {
  console.log('Failed to match panels');
}

fs.writeFileSync('frontend/src/pages/SettingsPage.tsx', content);
console.log('patched settings UI');
