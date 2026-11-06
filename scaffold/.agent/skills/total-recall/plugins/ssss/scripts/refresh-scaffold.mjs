import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalToolchain, scaffoldProject } from '../capability/index.mjs';
import toolchain from '../capability/toolchain.cjs';

const { listFiles, digest } = toolchain;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-payload-'));
try {
  const { root, version } = canonicalToolchain();
  const project = path.join(temporary, 'project');
  scaffoldProject({ directory: project, name: 'ssss-project', git: false });
  const files = Object.fromEntries(listFiles(project).map(file => {
    const content = fs.readFileSync(path.join(project, file), 'utf8');
    return [file, { sha256: digest(content), content }];
  }));
  const skillRoot = path.join(root, 'skills/ssss');
  const skill = Object.fromEntries(listFiles(skillRoot).map(file => [
    file, digest(fs.readFileSync(path.join(skillRoot, file))),
  ]));
  const output = JSON.stringify({ version, files, skill }, null, 2) + '\n';
  const file = fileURLToPath(new URL('../assets/scaffold.json', import.meta.url));
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(file, 'utf8') !== output) throw new Error('Shipped SSSS payload differs from the canonical generator or skill');
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, output);
  }
  console.log('Canonical SSSS ' + version + ': ' + Object.keys(files).length +
    ' scaffold files, ' + Object.keys(skill).length + ' skill files');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
