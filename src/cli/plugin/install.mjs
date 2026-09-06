import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { validatePluginManifest } from '../../core/plugin-loader.mjs';
import { CURATED_CATALOG } from '../../server/routes/plugins.mjs';

export async function installPlugin(args = []) {
  const isGlobal = args.includes('--global') || args.includes('-g');
  const isLink = args.includes('--link') || args.includes('-l');
  const cleanArgs = args.filter(a => a !== '--global' && a !== '-g' && a !== '--link' && a !== '-l');

  let source = cleanArgs[0];
  if (source) {
    const matched = CURATED_CATALOG.find(p => p.id.toLowerCase() === source.toLowerCase());
    if (matched) {
      console.log(`📦 Resolving plugin '${matched.id}' from catalog: ${matched.sourceUrl}`);
      source = matched.sourceUrl;
    }
  }

  if (!source) {
    console.error('❌ Error: Missing plugin source path or git URL.');
    console.error('   Usage: total-recall plugin install <path|git-url> [--link] [--global]\n');
    process.exit(1);
  }

  const pluginsBaseDir = isGlobal
    ? path.join(os.homedir(), '.agent', 'plugins')
    : path.join(process.cwd(), '.agent', 'plugins');

  if (!fs.existsSync(pluginsBaseDir)) {
    fs.mkdirSync(pluginsBaseDir, { recursive: true });
  }

  const isGitUrl = source.startsWith('http://') ||
                   source.startsWith('https://') ||
                   source.startsWith('git@') ||
                   source.endsWith('.git');

  if (isGitUrl) {
    console.log(`Cloning plugin from ${source}...`);
    const tempDir = path.join(os.tmpdir(), `tr-plugin-${Date.now()}`);
    const cloneRes = spawnSync('git', ['clone', '--depth', '1', source, tempDir], {
      stdio: 'inherit',
      encoding: 'utf8'
    });

    if (cloneRes.status !== 0) {
      console.error(`❌ Failed to clone repository from ${source}`);
      process.exit(1);
    }

    const manifestPath = path.join(tempDir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) {
      console.error(`❌ Cloned repository does not contain a plugin.json manifest`);
      fs.rmSync(tempDir, { recursive: true, force: true });
      process.exit(1);
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.error(`❌ Failed to parse plugin.json: ${err.message}`);
      fs.rmSync(tempDir, { recursive: true, force: true });
      process.exit(1);
    }

    const validation = validatePluginManifest(manifest);
    if (!validation.valid) {
      console.error(`❌ Invalid plugin manifest:`);
      for (const e of validation.errors) {
        console.error(`   - ${e}`);
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
      process.exit(1);
    }

    const destDir = path.join(pluginsBaseDir, manifest.id);
    if (fs.existsSync(destDir)) {
      console.error(`❌ Plugin '${manifest.id}' already exists at ${destDir}. Remove it first.`);
      fs.rmSync(tempDir, { recursive: true, force: true });
      process.exit(1);
    }

    fs.cpSync(tempDir, destDir, { recursive: true });
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`\n✅ Successfully installed plugin '${manifest.name}' (id: ${manifest.id}, v${manifest.version})`);
    console.log(`   Location: ${destDir}\n`);
    return;
  }

  // Local directory install / link
  const absSource = path.resolve(process.cwd(), source);
  if (!fs.existsSync(absSource)) {
    console.error(`❌ Source directory not found: ${absSource}`);
    process.exit(1);
  }

  const manifestPath = path.join(absSource, 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Directory '${absSource}' does not contain a plugin.json manifest`);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to parse plugin.json: ${err.message}`);
    process.exit(1);
  }

  const validation = validatePluginManifest(manifest);
  if (!validation.valid) {
    console.error(`❌ Invalid plugin manifest:`);
    for (const e of validation.errors) {
      console.error(`   - ${e}`);
    }
    process.exit(1);
  }

  const destDir = path.join(pluginsBaseDir, manifest.id);

  if (fs.existsSync(destDir)) {
    console.error(`❌ Plugin '${manifest.id}' is already installed at ${destDir}. Remove it first.`);
    process.exit(1);
  }

  if (isLink) {
    fs.symlinkSync(absSource, destDir, 'junction');
    console.log(`\n✅ Linked plugin '${manifest.name}' (id: ${manifest.id}, v${manifest.version})`);
    console.log(`   Symlink: ${destDir} -> ${absSource}\n`);
  } else {
    fs.cpSync(absSource, destDir, { recursive: true });
    console.log(`\n✅ Copied plugin '${manifest.name}' (id: ${manifest.id}, v${manifest.version})`);
    console.log(`   Location: ${destDir}\n`);
  }
}
