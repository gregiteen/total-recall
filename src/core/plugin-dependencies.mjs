/** Wire declared scaffold dependencies to the installed host packages. No download or alternate version. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PACKAGE_ROOT } from './plugin-loader.mjs';

export function preparePluginDependencies(pluginDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8'));
  const host = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const require = createRequire(path.join(PACKAGE_ROOT, 'package.json'));
  for (const [name, range] of Object.entries(manifest.dependencies || {})) {
    let source;
    if (name === host.name) source = PACKAGE_ROOT;
    else {
      source = path.dirname(require.resolve(name));
      while (true) {
        const file = path.join(source, 'package.json');
        if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).name === name) break;
        const parent = path.dirname(source);
        if (parent === source) throw new Error(`Required plugin dependency ${name} is unavailable`);
        source = parent;
      }
    }
    const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;
    const match = /^(\^|~)?(\d+)\.(\d+)\.(\d+)$/.exec(range);
    const actual = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match || !actual) throw new Error(`Unsupported plugin dependency contract ${name}`);
    const wanted = match.slice(2).map(Number), have = actual.slice(1).map(Number);
    const atLeast = have[0] > wanted[0] || have[0] === wanted[0] && (have[1] > wanted[1] || have[1] === wanted[1] && have[2] >= wanted[2]);
    const compatible = match[1] === '^' ? have[0] === wanted[0] && (wanted[0] !== 0 || have[1] === wanted[1]) && atLeast
      : match[1] === '~' ? have[0] === wanted[0] && have[1] === wanted[1] && atLeast : version === range;
    if (!compatible) throw new Error(`Installed plugin dependency ${name} does not satisfy its declared version`);
    const target = path.join(pluginDir, 'node_modules', name);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(source, target, 'junction');
  }
}
