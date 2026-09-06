import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function printHelp() {
  console.log(`
  Usage:
    total-recall ingest openwiki <openwiki-path> [options]

  Options:
    --dry-run                 Preview import without writing
    --global                  Target the global brain
    --project                 Target the project brain (default)
    --plugins                 Discover and ingest OpenWiki hubs from installed plugins
    --help, -h                Show this help
  `);
}

export async function runOpenWikiIngest(args) {
  let openwikiPath = null;
  let dryRun = false;
  let includePlugins = false;
  let layerFlag = '--project';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dry-run': dryRun = true; break;
      case '--global': layerFlag = '--global'; break;
      case '--project': layerFlag = '--project'; break;
      case '--plugins': includePlugins = true; break;
      case '--help': case '-h': help = true; break;
      default:
        if (!arg.startsWith('-') && !openwikiPath) {
          openwikiPath = arg;
        }
    }
  }

  if (help || (!openwikiPath && !includePlugins)) {
    printHelp();
    return;
  }

  if (openwikiPath && !fs.existsSync(openwikiPath)) {
    console.error(`❌ Error: OpenWiki directory not found at ${openwikiPath}`);
    process.exit(1);
  }

  console.log(`\n  📥 Importing LangChain OpenWiki from: ${openwikiPath}`);
  console.log(`  🧠 Target Brain: ${layerFlag.replace('--', '')}`);
  if (dryRun) console.log('  ⚠️  DRY RUN: No actual writes will be committed.\n');

  // Find all markdown files recursively
  const mdFiles = [];
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.agent') continue;
      
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        mdFiles.push(fullPath);
      }
    }
  }
  
  scanDir(openwikiPath);

  let imported = 0;
  let errors = 0;

  for (const file of mdFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      
      // Try to extract title from the first heading, else use filename
      let title = path.basename(file, '.md').replace(/[-_]/g, ' ');
      const titleMatch = content.match(/^#\\s+(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      const relPath = path.relative(openwikiPath, file);
      const slugBase = relPath.replace(/\.md$/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slug = 'openwiki-' + slugBase.toLowerCase();

      if (dryRun) {
        console.log(`  🟢 [DRY RUN] Would import: ${slug} ("${title}")`);
        imported++;
        continue;
      }

      const cliArgs = [
        process.argv[1],
        'remember', 'fact',
        content,
        '--title', title,
        '--slug', slug,
        '--tags', 'openwiki,architecture,auto-generated',
        layerFlag
      ];

      const result = spawnSync(process.argv[0], cliArgs, { encoding: 'utf8' });
      
      if (result.status === 0) {
        console.log(`  🟢 Imported: ${slug}`);
        imported++;
      } else {
        console.error(`  🔴 Error importing ${slug}:\\n${result.stderr}`);
        errors++;
      }
    } catch (err) {
      console.error(`  🔴 Exception on ${file}: ${err.message}`);
      errors++;
    }
  }

  if (includePlugins) {
    console.log(`\n  🔌 Ingesting OpenWiki hubs from installed plugins...`);
    const pluginResults = await syncPluginOpenWikiHubs({ dryRun, layerFlag });
    for (const r of pluginResults) {
      if (r.status === 'imported' || r.status === 'dry_run') {
        console.log(`  🟢 [Plugin Hub] ${r.slug} ("${r.title}")`);
        imported++;
      } else {
        console.error(`  🔴 [Plugin Hub] Error importing ${r.slug}: ${r.error}`);
        errors++;
      }
    }
  }

  console.log(`\n  Import Summary:`);
  console.log(`  🟢 Imported: ${imported} files`);
  console.log(`  🔴 Errors:   ${errors} files`);
  
  if (!dryRun && imported > 0) {
     console.log(`\n  ✅ OpenWiki successfully integrated into Total Recall.`);
  }
}

/**
 * Discover and ingest OpenWiki hubs declared by installed plugins.
 */
export async function syncPluginOpenWikiHubs(options = {}) {
  const { projectRoot = process.cwd(), dryRun = false, layerFlag = '--project' } = options;
  const { discoverPlugins } = await import('../core/plugin-loader.mjs');
  const plugins = discoverPlugins(projectRoot);
  const results = [];

  for (const plugin of plugins) {
    const hubs = plugin.manifest?.openwiki_hubs || [];
    for (const hub of hubs) {
      if (!hub.path) continue;
      const hubFilePath = path.isAbsolute(hub.path) ? hub.path : path.join(plugin.dir, hub.path);
      if (!fs.existsSync(hubFilePath)) continue;

      try {
        const content = fs.readFileSync(hubFilePath, 'utf8');
        const title = hub.title || path.basename(hub.path, '.md').replace(/[-_]/g, ' ');
        const slug = `openwiki-plugin-${plugin.id}-${path.basename(hub.path, '.md')}`.toLowerCase();

        if (dryRun) {
          results.push({ slug, title, status: 'dry_run' });
          continue;
        }

        const cliArgs = [
          process.argv[1],
          'remember', 'fact',
          content,
          '--title', title,
          '--slug', slug,
          '--tags', `openwiki,plugin,plugin-${plugin.id}`,
          layerFlag
        ];

        const res = spawnSync(process.argv[0], cliArgs, { encoding: 'utf8' });
        results.push({
          slug,
          title,
          status: res.status === 0 ? 'imported' : 'error',
          error: res.status === 0 ? null : res.stderr
        });
      } catch (err) {
        results.push({ slug: hub.path, title: hub.title, status: 'error', error: err.message });
      }
    }
  }

  return results;
}
