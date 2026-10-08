import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validatePluginManifest } from "../../core/plugin-loader.mjs";
import { installPlugin } from "../../core/plugin-store.mjs";
import { parseCron } from "../../core/plugin-tasks.mjs";
import { generateUiElements } from "../../core/app-deploy/ui-elements.mjs";

function toTitleCase(kebab) {
  return kebab
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** CLI token subcommands every API-key plugin starts with. */
function tokenCliBlock(apiKeys) {
  return `import { spawnSync } from "node:child_process";

// The service API key lives in the Total Recall secrets store, never argv or logs.
const TOKEN_KEY = ${JSON.stringify(apiKeys[0])};
const TR = process.env.TOTAL_RECALL_BIN || "total-recall";

function tokenValue() {
  if (process.env[TOKEN_KEY]) return process.env[TOKEN_KEY].trim();
  const run = spawnSync(TR, ["secret", "get", TOKEN_KEY], { encoding: "utf8" });
  if (run.status !== 0) return "";
  const lines = String(run.stdout || "").split("\\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("{"));
  return lines.length ? lines[lines.length - 1] : "";
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

// TODO(plugin author): call a cheap authenticated endpoint here and return
// { valid: true } or { valid: false, message }. Never save a key that fails it.
async function verifyToken(_value) {
  return { valid: false, message: "Credential verification must be implemented for this service." };
}

async function tokenCommand(args) {
  const [action = "status"] = args;
  const json = args.includes("--json");
  if (action === "status") {
    const status = { present: Boolean(tokenValue()), secretKey: TOKEN_KEY };
    console.log(json ? JSON.stringify(status) : \`API key: \${status.present ? "present" : "missing"} (\${TOKEN_KEY})\`);
    if (!status.present) process.exitCode = 1;
    return;
  }
  if (action === "set" && args.includes("--stdin")) {
    const value = await readStdin();
    if (!value) { console.error("No key received on stdin."); process.exitCode = 2; return; }
    const check = await verifyToken(value);
    if (!check.valid) { console.error(\`Key rejected, not saved: \${check.message || "verification failed"}\`); process.exitCode = 1; return; }
    const saved = spawnSync(TR, ["secret", "set", TOKEN_KEY, "--stdin"], { input: value, encoding: "utf8" });
    if (saved.status !== 0) { console.error("Could not save the key to the secrets store."); process.exitCode = 1; return; }
    console.log(json ? JSON.stringify({ saved: true, valid: true }) : "API key verified and saved.");
    return;
  }
  console.error("usage: token <status|set --stdin>");
  process.exitCode = 2;
}

`;
}

/** UI panel with the paste-your-key form every API-key plugin starts with. */
function tokenPanelSource(id, panelClass, pluginName, apiKeys) {
  return `// Paste-your-key panel. Emits \`save-token\`; the host pipes it to
// \`total-recall ${id} token set --stdin\` (stored in secrets, never shown again).
class ${panelClass} extends HTMLElement {
  set view(value) { this._view = value; this.render(); }
  get view() { return this._view; }
  connectedCallback() { this.render(); }
  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.replaceChildren();
    const present = Boolean(this._view && this._view.present);
    const style = document.createElement('style');
    style.textContent = ':host { display:block; color:var(--color-text); background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:var(--spacing-md); } .row { display:flex; gap:8px; margin-top:8px; } input { flex:1; padding:6px 8px; }';
    const title = document.createElement('h3');
    title.textContent = ${JSON.stringify(pluginName + ' API key')};
    const state = document.createElement('p');
    state.textContent = present ? 'A key is saved. Paste a new one to replace it.' : 'No key yet. Paste it to start using this plugin.';
    const form = document.createElement('form');
    form.className = 'row';
    const input = document.createElement('input');
    input.type = 'password'; input.autocomplete = 'off'; input.required = true;
    input.placeholder = ${JSON.stringify(apiKeys[0])};
    input.setAttribute('aria-label', ${JSON.stringify(pluginName + ' API key')});
    const button = document.createElement('button');
    button.type = 'submit'; button.textContent = 'Save and test';
    form.append(input, button);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent('save-token', { detail: { key: ${JSON.stringify(apiKeys[0])}, token: input.value.trim() }, bubbles: true, composed: true }));
      input.value = '';
    });
    root.append(style, title, state, form);
  }
}
customElements.define('${id}-panel', ${panelClass});
`;
}

export async function createPlugin(args = []) {
  const isGlobal = args.includes("--global") || args.includes("-g");
  let withCli = args.includes("--with-cli");
  const withGenerator = args.includes("--with-generator");
  let withUi = args.includes("--with-ui");
  const withTask = args.includes("--with-task");
  const createGithub = args.includes("--github");
  const publicRepo = args.includes("--public");
  const skipInstall = args.includes("--no-install");
  let repoDirArg = null;

  let name = null;
  let description = null;
  let category = null;
  let fromSkillPath = null;
  let taskCommand = null;
  let taskSchedule = null;
  let taskIntent = null;
  const useCases = [];
  const apiKeys = [];

  const cleanArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["--global", "-g", "--with-cli", "--with-generator", "--with-ui", "--with-task", "--with-skill", "--capability", "--github", "--public", "--no-install"].includes(arg)) {
      continue;
    }
    if (arg === "--api-key" && args[i + 1]) { apiKeys.push(args[++i]); continue; }
    if (arg === "--repo-dir" && args[i + 1]) { repoDirArg = args[++i]; continue; }
    if (arg === "--name" && args[i + 1]) {
      name = args[i + 1];
      i++;
      continue;
    }
    if (arg === "--description" && args[i + 1]) {
      description = args[i + 1];
      i++;
      continue;
    }
    if (arg === "--use-case" && args[i + 1]) {
      useCases.push(args[i + 1]);
      i++;
      continue;
    }
    if (arg === "--category" && args[i + 1]) {
      category = args[i + 1];
      i++;
      continue;
    }
    if (arg === "--from-skill" && args[i + 1]) {
      fromSkillPath = args[i + 1];
      i++;
      continue;
    }
    if (arg === "--task-command" && args[i + 1]) { taskCommand = args[++i]; continue; }
    if (arg === "--task-schedule" && args[i + 1]) { taskSchedule = args[++i]; continue; }
    if (arg === "--task-intent" && args[i + 1]) { taskIntent = args[++i]; continue; }
    cleanArgs.push(arg);
  }

  let skillSourceDir = null;
  let skillFrontmatter = {};
  if (fromSkillPath) {
    if (!fs.existsSync(fromSkillPath)) {
      console.error(`❌ Error: --from-skill path does not exist: ${fromSkillPath}`);
      process.exit(1);
    }
    skillSourceDir = fs.statSync(fromSkillPath).isDirectory()
      ? path.resolve(fromSkillPath)
      : path.dirname(path.resolve(fromSkillPath));

    const skillMdFile = path.join(skillSourceDir, "SKILL.md");
    if (fs.existsSync(skillMdFile)) {
      const content = fs.readFileSync(skillMdFile, "utf8");
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        for (const line of match[1].split("\n")) {
          const colon = line.indexOf(":");
          if (colon !== -1) {
            const k = line.slice(0, colon).trim();
            let v = line.slice(colon + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            skillFrontmatter[k] = v;
          }
        }
      }
    }
  }

  const id =
    cleanArgs[0] ||
    (skillFrontmatter.name ? skillFrontmatter.name.toLowerCase().replace(/[^a-z0-9-]/g, "-") : null) ||
    (skillSourceDir ? path.basename(skillSourceDir).toLowerCase().replace(/[^a-z0-9-]/g, "-") : null);

  if (!id) {
    console.error("❌ Error: Missing plugin id.");
    console.error("   Usage: total-recall plugin create <id> [--from-skill <path>] [--capability] [--name <name>] [--description <desc>] [--category <cat>] [--global]\n");
    process.exit(1);
  }

  const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
  if (!ID_PATTERN.test(id)) {
    console.error(`❌ Error: Invalid plugin id "${id}". Must be lowercase kebab-case (^[a-z][a-z0-9-]{1,63}$)`);
    process.exit(1);
  }

  if (withTask) {
    if (!taskCommand || !/^[a-z][a-z0-9-]*$/.test(taskCommand) || !taskSchedule || !taskIntent) {
      throw new Error('--with-task requires --task-command <subcommand>, --task-schedule "<five-field cron>", and --task-intent <description>');
    }
    parseCron(taskSchedule);
  } else if (taskCommand || taskSchedule || taskIntent) {
    throw new Error('--task-* options require --with-task');
  }

  // Every plugin is its own repository (tr-plugin-<id>). The repo root IS the
  // plugin directory (plugin.json at the root); the project/global install is
  // a symlink to it, so edits in the repo are what runs.
  const pluginDir = path.resolve(repoDirArg || path.join(path.dirname(process.cwd()), `tr-plugin-${id}`));
  if (fs.existsSync(pluginDir) && fs.readdirSync(pluginDir).length > 0) {
    console.error(`❌ Error: Plugin repository directory already exists and is not empty: ${pluginDir}`);
    process.exit(1);
  }

  fs.mkdirSync(pluginDir, { recursive: true });

  const pluginName = name || skillFrontmatter.name || toTitleCase(id);
  const pluginDesc = description || skillFrontmatter.description || `${pluginName} extension for Total Recall`;

  const manifest = {
    $schema: "https://github.com/gregiteen/total-recall/blob/main/metadata.plugin.schema.json",
    id,
    name: pluginName,
    version: "0.1.0",
    description: pluginDesc,
    license: "MIT"
  };
  if (useCases.length > 0) manifest.use_cases = useCases;

  // House rule: a plugin for a service that needs an API key ships a UI to paste
  // that key and a CLI to save it, so it works the moment the key is pasted.
  if (apiKeys.length) {
    withCli = true;
    withUi = true;
    manifest.secrets = apiKeys.map((key) => ({ key, description: `${pluginName} service API key (paste it in the plugin UI)`, required: true }));
  }

  if (category) {
    manifest.ssss_schemas = {
      categories: [
        {
          name: category,
          description: `Custom ${category} memory nodes for ${pluginName}`,
          node_type: "memory"
        }
      ]
    };
  }

  const withSkill = args.includes("--with-skill") || args.includes("--capability") || Boolean(fromSkillPath);
  const isCapability = args.includes("--capability") || Boolean(fromSkillPath);

  if (withCli || isCapability || withTask) {
    manifest.cli = {
      command: id,
      handler: "./cli.mjs",
      subcommands: [
        { name: "status", description: `Show which ${pluginName} subcommands are implemented` }
      ]
    };

    const cliContent = `#!/usr/bin/env node
/**
 * ${pluginName} CLI Handler
 * Executed via: npx total-recall ${id} <subcommand>
 */
// Scaffold: report honestly what exists. Add each real subcommand to
// IMPLEMENTED and to plugin.json "cli.subcommands" as it is built.
${apiKeys.length ? tokenCliBlock(apiKeys) : ''}const IMPLEMENTED = {};${apiKeys.length ? '\nIMPLEMENTED.token = tokenCommand;' : ''}

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const sub = args[0] || "status";
  const json = args.includes("--json");

  if (sub === "status") {
    const status = { plugin: ${JSON.stringify(id)}, implemented: Object.keys(IMPLEMENTED) };
    if (json) console.log(JSON.stringify(status));
    else console.log(status.implemented.length
      ? \`${pluginName}: implemented subcommands: \${status.implemented.join(", ")}\`
      : \`${pluginName}: scaffold only — no subcommands implemented yet.\`);
    return;
  }

  if (IMPLEMENTED[sub]) return IMPLEMENTED[sub](args.slice(1));

  console.error(\`${pluginName}: "\${sub}" is not implemented.\`);
  process.exitCode = 2;
}
export default run;
`;
    fs.writeFileSync(path.join(pluginDir, "cli.mjs"), cliContent, "utf8");
  }

  if (withTask) {
    manifest.tasks = [{ intent: taskIntent, schedule: taskSchedule, command: taskCommand, placement: 'selected-node' }];
  }

  if (withUi) {
    manifest.ui = {
      design_tokens: 'ui/DESIGN.md',
      elements: [{ id: 'panel', kind: 'panel', tag: `${id}-panel`, module: 'ui/panel.js', description: `${pluginName} panel`, events: [], tokens: ['color-text', 'color-surface', 'color-border', 'spacing-md', 'radius-md'], optional_tokens: [] }],
    };
    const panelClass = `${id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}Panel`;
    fs.mkdirSync(path.join(pluginDir, 'ui'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'ui', 'DESIGN.md'), '---\ncolors:\n  text: "#20242a"\n  surface: "#ffffff"\n  border: "#dce2e8"\nspacing:\n  md: 12px\nrounded:\n  md: 8px\n---\n\n# Design tokens\n\nReplace these defaults with the host design tokens.\n');
    if (apiKeys.length) {
      manifest.ui.elements[0].events = ['save-token'];
      manifest.ui.elements[0].props = { view: { type: 'object', description: `Printed by \`total-recall ${id} token status --json\`: { present, secretKey }` } };
    }
    fs.writeFileSync(path.join(pluginDir, 'ui', 'panel.js'), apiKeys.length ? tokenPanelSource(id, panelClass, pluginName, apiKeys) : `class ${panelClass} extends HTMLElement {\n  connectedCallback() {\n    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });\n    root.replaceChildren();\n    const style = document.createElement('style');\n    style.textContent = ':host { display:block; color:var(--color-text); background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:var(--spacing-md); }';\n    const text = document.createElement('p');\n    text.textContent = ${JSON.stringify(`${pluginName} panel scaffold. Add the actual capability before sharing.`)};\n    root.append(style, text);\n  }\n}\ncustomElements.define('${id}-panel', ${panelClass});\n`);
  }

  if (isCapability) {
    manifest.deploy = {
      targets: ["ssss-app", "nextjs", "react", "flask"],
      required_ssss_version: ">=0.9.3",
      access_grants: ["ssss:vault:read", "ssss:vault:write", "ssss:events:append"]
    };
  }

  if (fromSkillPath && skillSourceDir) {
    const skillDir = path.join(pluginDir, "skills", id);
    fs.mkdirSync(skillDir, { recursive: true });
    for (const item of fs.readdirSync(skillSourceDir, { withFileTypes: true })) {
      const srcItem = path.join(skillSourceDir, item.name);
      const dstItem = path.join(skillDir, item.name);
      if (item.isDirectory()) {
        fs.cpSync(srcItem, dstItem, { recursive: true });
      } else {
        fs.copyFileSync(srcItem, dstItem);
      }
    }
    manifest.skills = [
      {
        id,
        path: `./skills/${id}/SKILL.md`,
        description: pluginDesc
      }
    ];
  } else if (withSkill || isCapability) {
    const skillDir = path.join(pluginDir, "skills", id);
    fs.mkdirSync(skillDir, { recursive: true });
    const skillContent = `---
name: ${id}
description: "${pluginDesc}"
version: 0.1.0
---

# ${pluginName}

${pluginDesc}

## Usage

This skill is provided by the \`${id}\` Total Recall capability plugin.

### Composable CLI
\`\`\`bash
npx total-recall ${id} status
npx total-recall ${id} run
\`\`\`
`;
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent, "utf8");
    manifest.skills = [
      {
        id,
        path: `./skills/${id}/SKILL.md`,
        description: pluginDesc
      }
    ];
  }

  if (withGenerator) {
    manifest.compile = {
      generator: "./generator.mjs",
      auto: true
    };

    const generatorContent = `/**
 * Context generator for ${pluginName}.
 * Invoked during evolving context compilation.
 */
export async function generateContext({ nodes = [], manifest = {} }) {
  const categories = (manifest.ssss_schemas?.categories || []).map((c) => c.name);
  const mine = nodes.filter((n) => categories.includes(n.category) && n.status === 'active');
  if (mine.length === 0) return '';
  return \`#### ${pluginName}\n\` + mine.map((n) => \`- \${n.title || n.slug}\`).join('\\n') + '\\n';
}
export default generateContext;
`;
    fs.writeFileSync(path.join(pluginDir, "generator.mjs"), generatorContent, "utf8");
  }


  const validation = validatePluginManifest(manifest);
  if (!validation.valid) {
    console.error("❌ Validation failed for generated manifest:", validation.errors);
    fs.rmSync(pluginDir, { recursive: true, force: true });
    process.exit(1);
  }
  if (withUi) {
    try { generateUiElements(manifest, { pluginDir, target: 'web-components' }); }
    catch (error) { fs.rmSync(pluginDir, { recursive: true, force: true }); throw error; }
  }

  fs.writeFileSync(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  const lines = [
    `# ${pluginName}`,
    "",
    `> ${pluginDesc}`,
    "",
    "## Sharing",
    "",
    "Offer it to your other Total Recall nodes over the mesh:",
    "",
    "```bash",
    `npx total-recall plugin share ${id}`,
    "```",
    "",
    "Peers install it with `npx total-recall plugin install peer:<this-node>/" + id + "`.",
    "",
    "## Features",
    "",
    `- **Identifier**: \`${id}\``,
    "- **Version**: 0.1.0"
  ];
  if (useCases.length) lines.push(`- **Use cases**: ${useCases.join(", ")}`);
  if (category) lines.push(`- **SSSS Category**: \`${category}\``);
  if (withCli) lines.push(`- **CLI Command**: \`npx total-recall ${id}\``);
  if (withTask) lines.push(`- **Scheduled task**: \`${taskCommand}\` at \`${taskSchedule}\` (selected node; implement the command and choose a node before use)`);
  if (withUi) lines.push('- **UI**: `ui/panel.js` custom element with DESIGN.md tokens');
  if (apiKeys.length) lines.push('- **API key**: paste it in the plugin UI (`save-token` event) or pipe it to `npx total-recall ' + id + ' token set --stdin`; stored as `' + apiKeys[0] + '` in the secrets store');
  lines.push("");

  fs.writeFileSync(path.join(pluginDir, "README.md"), lines.join("\n"), "utf8");

  // ── Standalone repository files ──────────────────────────────────────────
  const holder = gitOutput(['config', 'user.name']) || 'Plugin authors';
  fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({
    name: `tr-plugin-${id}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    description: pluginDesc,
    scripts: { test: 'node --test test/*.test.mjs' },
    devDependencies: { 'total-recall-brain': '^3.35.0' },
    license: 'MIT'
  }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(pluginDir, '.gitignore'), 'node_modules/\n.env*\n.agent/skills/total-recall/\ndist/\nreports/\n.DS_Store\nINSTRUCTIONS.md\nAGENTS.md\nGEMINI.md\n', 'utf8');
  fs.writeFileSync(path.join(pluginDir, 'LICENSE'), mitLicense(holder), 'utf8');
  fs.mkdirSync(path.join(pluginDir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'test', 'manifest.test.mjs'), `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));

test('manifest identifies the plugin', () => {
  assert.equal(manifest.id, ${JSON.stringify(id)});
  assert.match(manifest.version, /^\\\\d+\\\\.\\\\d+\\\\.\\\\d+/);
  assert.equal(manifest.license, 'MIT');
});

test('every file the manifest references exists', () => {
  const refs = [manifest.cli?.handler, manifest.compile?.generator, manifest.ui?.design_tokens, ...(manifest.skills || []).map((s) => s.path), ...(manifest.ui?.elements || []).map((e) => e.module)].filter(Boolean);
  for (const ref of refs) assert.ok(fs.existsSync(path.join(root, ref)), \`missing \${ref}\`);
});
`, 'utf8');

  gitOutput(['init', '-q', '-b', 'main'], pluginDir);
  gitOutput(['remote', 'add', 'origin', `https://github.com/${githubOwner() || 'OWNER'}/tr-plugin-${id}.git`], pluginDir);

  // ── Install: a link to the repo, so the repo is what runs ───────────────
  let installed = false;
  if (!skipInstall) {
    await installPlugin(pluginDir, { link: true, global: isGlobal, projectRoot: process.cwd() });
    installed = true;
  }

  // ── Optional GitHub repository (private unless --public) ────────────────
  let githubUrl = null;
  if (createGithub) {
    const out = spawnSync('gh', ['repo', 'create', `tr-plugin-${id}`, publicRepo ? '--public' : '--private', '--description', pluginDesc, '--source', pluginDir, '--remote', 'origin'], { encoding: 'utf8' });
    if (out.status !== 0) {
      console.error(`❌ GitHub repository creation failed: ${(out.stderr || out.stdout || '').trim()}`);
      process.exitCode = 1;
    } else {
      githubUrl = (out.stdout || '').trim().split('\n').pop();
    }
  }

  console.log(`\n🎉 Successfully scaffolded plugin "${pluginName}" as its own repository!`);
  console.log(`   Repository: \x1b[36m${pluginDir}\x1b[0m`);
  console.log(`   Manifest:   \x1b[33m${path.join(pluginDir, "plugin.json")}\x1b[0m`);
  if (withCli) {
    console.log(`   CLI Handler: \x1b[32m${path.join(pluginDir, "cli.mjs")}\x1b[0m`);
  }
  console.log(`   Installed:  ${installed ? `linked into ${isGlobal ? 'the global' : 'this project\'s'} plugins` : 'no (--no-install)'}`);
  console.log(`   GitHub:     ${githubUrl || (createGithub ? 'creation failed' : 'not created (re-run with --github, or: gh repo create tr-plugin-' + id + ' --private --source ' + pluginDir + ')')}`);
  console.log(`\nNext steps:`);
  console.log(`   Test:    \x1b[32mcd ${pluginDir} && npm test\x1b[0m`);
  console.log(`   Inspect: \x1b[32mnpx total-recall plugin info ${id}\x1b[0m`);
  console.log(`   List:    \x1b[32mnpx total-recall plugin list\x1b[0m\n`);
}

function gitOutput(gitArgs, cwd) {
  const out = spawnSync('git', gitArgs, { cwd, encoding: 'utf8' });
  return out.status === 0 ? (out.stdout || '').trim() : '';
}

function githubOwner() {
  const out = spawnSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' });
  return out.status === 0 ? (out.stdout || '').trim() : '';
}

function mitLicense(holder) {
  return `MIT License

Copyright (c) ${new Date().getFullYear()} ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}
