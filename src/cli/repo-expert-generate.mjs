/**
 * repo-expert-generate.mjs — Auto-generate repo-expert SKILL.md from codebase analysis.
 *
 * Scans the target repository to produce a comprehensive, accurate repo-expert
 * skill file based on actual code structure, not manually-maintained docs.
 *
 * Usage:
 *   npx total-recall skill generate-expert [--repo <path>]
 *
 * Called from skill.mjs dispatch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Scan a repo and return structured architecture data.
 */
export function scanRepo(repoRoot) {
  const result = {
    name: '',
    description: '',
    packageManager: null,
    type: 'unknown',
    languages: [],
    frameworks: [],
    entryPoints: [],
    directoryTree: {},
    cliCommands: [],
    apiRoutes: [],
    frontendPages: [],
    components: [],
    coreModules: [],
    testFramework: null,
    hasTypeScript: false,
    skills: [],
    configFiles: [],
  };

  // 1. Package.json analysis
  const pkgPath = path.join(repoRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      result.name = pkg.name || path.basename(repoRoot);
      result.description = pkg.description || '';
      result.packageManager = 'npm';
      result.type = pkg.type || 'commonjs';

      // Detect frameworks from deps
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depNames = Object.keys(allDeps || {});

      if (depNames.includes('react')) result.frameworks.push('React');
      if (depNames.includes('next')) result.frameworks.push('Next.js');
      if (depNames.includes('vue')) result.frameworks.push('Vue');
      if (depNames.includes('express')) result.frameworks.push('Express');
      if (depNames.includes('fastify')) result.frameworks.push('Fastify');
      if (depNames.includes('vite')) result.frameworks.push('Vite');
      if (depNames.includes('vitest')) result.testFramework = 'Vitest';
      if (depNames.includes('jest')) result.testFramework = 'Jest';
      if (depNames.includes('typescript')) result.hasTypeScript = true;

      // Entry points from bin
      if (pkg.bin) {
        for (const [name, filePath] of Object.entries(pkg.bin)) {
          result.entryPoints.push({ name, path: filePath, type: 'bin' });
        }
      }
      if (pkg.main) result.entryPoints.push({ name: 'main', path: pkg.main, type: 'main' });

      // Scripts
      if (pkg.scripts) {
        result.configFiles.push({ file: 'package.json scripts', keys: Object.keys(pkg.scripts) });
      }
    } catch { /* ignore parse errors */ }
  }

  // 2. Language detection
  const extensions = new Map();
  function walkForExtensions(dir, depth = 0) {
    if (depth > 4) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkForExtensions(full, depth + 1);
        } else {
          const ext = path.extname(entry.name);
          if (ext) extensions.set(ext, (extensions.get(ext) || 0) + 1);
        }
      }
    } catch { /* permission errors */ }
  }
  walkForExtensions(repoRoot);

  const extCounts = [...extensions.entries()].sort((a, b) => b[1] - a[1]);
  // Aggregate related extensions into language groups
  const langTotals = {};
  for (const [ext, count] of extCounts) {
    if (['.mjs', '.js', '.cjs'].includes(ext)) langTotals['JavaScript'] = (langTotals['JavaScript'] || 0) + count;
    else if (['.ts', '.tsx'].includes(ext)) langTotals['TypeScript'] = (langTotals['TypeScript'] || 0) + count;
    else if (ext === '.py') langTotals['Python'] = (langTotals['Python'] || 0) + count;
    else if (ext === '.go') langTotals['Go'] = (langTotals['Go'] || 0) + count;
    else if (ext === '.rs') langTotals['Rust'] = (langTotals['Rust'] || 0) + count;
    else if (ext === '.md') langTotals['Markdown'] = (langTotals['Markdown'] || 0) + count;
    else if (ext === '.css') langTotals['CSS'] = (langTotals['CSS'] || 0) + count;
  }
  for (const [lang, count] of Object.entries(langTotals).sort((a, b) => b[1] - a[1])) {
    result.languages.push(`${lang} (${count} files)`);
  }

  // 3. Directory tree (top 2 levels)
  function scanDir(dir, depth = 0) {
    if (depth > 2) return null;
    const tree = {};
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.agent' && entry.name !== '.agents') continue;
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const childCount = countChildren(full);
          const children = depth < 2 ? scanDir(full, depth + 1) : null;
          tree[entry.name + '/'] = children || `${childCount} items`;
        }
      }
    } catch { /* ignore */ }
    return Object.keys(tree).length ? tree : null;
  }

  function countChildren(dir) {
    try {
      return fs.readdirSync(dir).filter(f => !f.startsWith('.')).length;
    } catch { return 0; }
  }

  result.directoryTree = scanDir(repoRoot) || {};

  // 4. CLI commands (if src/cli exists)
  const cliDir = path.join(repoRoot, 'src', 'cli');
  if (fs.existsSync(cliDir)) {
    try {
      const cliFiles = fs.readdirSync(cliDir)
        .filter(f => f.endsWith('.mjs') || f.endsWith('.js') || f.endsWith('.ts'))
        .filter(f => !f.includes('.spec.'));
      for (const file of cliFiles) {
        const name = file.replace(/\.(mjs|js|ts)$/, '');
        // Try to extract description from the file
        let description = '';
        try {
          const content = fs.readFileSync(path.join(cliDir, file), 'utf8');
          const docMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+)/);
          if (docMatch) description = docMatch[1].replace(/\*\//g, '').trim();
        } catch { /* ignore */ }
        result.cliCommands.push({ name, file, description });
      }
    } catch { /* ignore */ }
  }

  // 5. API routes (if src/server/routes exists)
  const routesDir = path.join(repoRoot, 'src', 'server', 'routes');
  if (fs.existsSync(routesDir)) {
    try {
      const routeFiles = fs.readdirSync(routesDir)
        .filter(f => (f.endsWith('.mjs') || f.endsWith('.ts')) && !f.includes('.spec.') && !f.startsWith('_'));
      for (const file of routeFiles) {
        const name = file.replace(/\.(mjs|ts)$/, '');
        // Count route handlers
        try {
          const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
          const getCount = (content.match(/\.(get|GET)\s*\(/g) || []).length;
          const postCount = (content.match(/\.(post|POST)\s*\(/g) || []).length;
          const putCount = (content.match(/\.(put|PUT)\s*\(/g) || []).length;
          const deleteCount = (content.match(/\.(delete|DELETE)\s*\(/g) || []).length;
          const total = getCount + postCount + putCount + deleteCount;

          // Extract route paths
          const routePaths = [];
          const pathMatches = content.matchAll(/\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)/gi);
          for (const m of pathMatches) {
            routePaths.push(`${m[1].toUpperCase()} ${m[2]}`);
          }

          result.apiRoutes.push({
            name,
            file,
            endpoints: total,
            routes: routePaths.slice(0, 10),
          });
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  // 6. Frontend pages
  const pagesDir = path.join(repoRoot, 'frontend', 'src', 'pages');
  if (!fs.existsSync(pagesDir)) {
    // Try alternate locations
    const altPages = [
      path.join(repoRoot, 'src', 'pages'),
      path.join(repoRoot, 'app'),
      path.join(repoRoot, 'pages'),
    ];
    for (const alt of altPages) {
      if (fs.existsSync(alt)) {
        scanPages(alt, result);
        break;
      }
    }
  } else {
    scanPages(pagesDir, result);
  }

  // 7. Frontend components
  const componentsDirs = [
    path.join(repoRoot, 'frontend', 'src', 'components'),
    path.join(repoRoot, 'src', 'components'),
    path.join(repoRoot, 'components'),
  ];
  for (const compDir of componentsDirs) {
    if (fs.existsSync(compDir)) {
      try {
        const files = fs.readdirSync(compDir, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile() && (f.name.endsWith('.tsx') || f.name.endsWith('.jsx') || f.name.endsWith('.vue'))) {
            if (!f.name.includes('.spec.')) {
              result.components.push(f.name.replace(/\.(tsx|jsx|vue)$/, ''));
            }
          } else if (f.isDirectory()) {
            // Brand, etc. — scan one level deep
            try {
              const subFiles = fs.readdirSync(path.join(compDir, f.name))
                .filter(sf => sf.endsWith('.tsx') || sf.endsWith('.jsx'))
                .filter(sf => !sf.includes('.spec.'));
              for (const sf of subFiles) {
                result.components.push(`${f.name}/${sf.replace(/\.(tsx|jsx)$/, '')}`);
              }
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
      break;
    }
  }

  // 8. Core modules
  const coreDir = path.join(repoRoot, 'src', 'core');
  if (fs.existsSync(coreDir)) {
    try {
      const coreFiles = fs.readdirSync(coreDir)
        .filter(f => (f.endsWith('.mjs') || f.endsWith('.ts')) && !f.includes('.spec.'));
      for (const file of coreFiles) {
        const name = file.replace(/\.(mjs|ts)$/, '');
        let exports = [];
        try {
          const content = fs.readFileSync(path.join(coreDir, file), 'utf8');
          const exportMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
          for (const m of exportMatches) {
            exports.push(m[1]);
          }
        } catch { /* ignore */ }
        result.coreModules.push({ name, file, exports: exports.slice(0, 8) });
      }
    } catch { /* ignore */ }
  }

  // 9. Agent skills
  const skillsDir = path.join(repoRoot, '.agent', 'skills');
  if (fs.existsSync(skillsDir)) {
    try {
      const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
      for (const d of skillDirs) {
        const skillMd = path.join(skillsDir, d.name, 'SKILL.md');
        let description = '';
        if (fs.existsSync(skillMd)) {
          try {
            const content = fs.readFileSync(skillMd, 'utf8');
            const descMatch = content.match(/description:\s*>?-?\s*\n?\s*(.+?)(?:\n|$)/);
            if (descMatch) description = descMatch[1].trim();
          } catch { /* ignore */ }
        }
        result.skills.push({ name: d.name, hasSkillMd: fs.existsSync(skillMd), description });
      }
    } catch { /* ignore */ }
  }

  // 10. Config files
  const configPatterns = [
    'tsconfig.json', 'vite.config.ts', 'vite.config.mjs', 'next.config.js', 'next.config.mjs',
    'vitest.config.ts', 'vitest.config.mjs', 'eslint.config.mjs', '.eslintrc.js',
    'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js',
    'Dockerfile', 'docker-compose.yml', '.env.example',
    'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'INSTRUCTIONS.md',
  ];
  for (const pattern of configPatterns) {
    if (fs.existsSync(path.join(repoRoot, pattern))) {
      result.configFiles.push({ file: pattern });
    }
  }

  return result;
}

function scanPages(dir, result) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.tsx') || f.endsWith('.jsx') || f.endsWith('.vue'))
      .filter(f => !f.includes('.spec.'));
    for (const file of files) {
      result.frontendPages.push(file.replace(/\.(tsx|jsx|vue)$/, ''));
    }
  } catch { /* ignore */ }
}

/**
 * Generate SKILL.md content from scan data.
 */
export function generateSkillMd(scan, repoRoot) {
  const lines = [];

  lines.push('---');
  lines.push('name: repo-expert');
  lines.push('description: >-');
  lines.push('  Use this skill when you need to understand codebase architecture, file');
  lines.push('  structure, and runtime topology. MANDATORY: You MUST read the full SKILL.md');
  lines.push('  file before executing.');
  lines.push('repo_scoped: true');
  lines.push(`generated_at: ${new Date().toISOString()}`);
  lines.push(`generated_from: ${repoRoot}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${scan.name || path.basename(repoRoot)} — Codebase Architecture`);
  lines.push('');
  if (scan.description) {
    lines.push(`> ${scan.description}`);
    lines.push('');
  }
  lines.push('> **Auto-generated** by `npx total-recall skill generate-expert`. Regenerate anytime to stay current.');
  lines.push('');

  // Stack summary
  lines.push('## Stack');
  lines.push('');
  if (scan.languages.length) lines.push(`- **Languages**: ${scan.languages.join(', ')}`);
  if (scan.frameworks.length) lines.push(`- **Frameworks**: ${scan.frameworks.join(', ')}`);
  if (scan.testFramework) lines.push(`- **Tests**: ${scan.testFramework}`);
  if (scan.hasTypeScript) lines.push(`- **TypeScript**: Yes`);
  lines.push(`- **Module system**: ${scan.type}`);
  if (scan.packageManager) lines.push(`- **Package manager**: ${scan.packageManager}`);
  lines.push('');

  // Directory structure
  lines.push('## Directory Structure');
  lines.push('');
  lines.push('```');
  function renderTree(tree, prefix = '') {
    const entries = Object.entries(tree);
    for (const [name, value] of entries) {
      if (typeof value === 'string') {
        lines.push(`${prefix}${name}  (${value})`);
      } else if (value && typeof value === 'object') {
        lines.push(`${prefix}${name}`);
        renderTree(value, prefix + '  ');
      }
    }
  }
  renderTree(scan.directoryTree);
  lines.push('```');
  lines.push('');

  // Entry points
  if (scan.entryPoints.length) {
    lines.push('## Entry Points');
    lines.push('');
    for (const ep of scan.entryPoints) {
      lines.push(`- **${ep.name}**: \`${ep.path}\` (${ep.type})`);
    }
    lines.push('');
  }

  // CLI commands
  if (scan.cliCommands.length) {
    lines.push('## CLI Commands');
    lines.push('');
    lines.push(`${scan.cliCommands.length} commands in \`src/cli/\`:`);
    lines.push('');
    lines.push('| Command | File | Description |');
    lines.push('|---------|------|-------------|');
    for (const cmd of scan.cliCommands.slice(0, 40)) {
      const desc = cmd.description ? cmd.description.slice(0, 60) : '';
      lines.push(`| ${cmd.name} | ${cmd.file} | ${desc} |`);
    }
    if (scan.cliCommands.length > 40) {
      lines.push(`| ... | +${scan.cliCommands.length - 40} more | |`);
    }
    lines.push('');
  }

  // API routes
  if (scan.apiRoutes.length) {
    lines.push('## API Routes');
    lines.push('');
    lines.push(`${scan.apiRoutes.length} route modules in \`src/server/routes/\`:`);
    lines.push('');
    for (const route of scan.apiRoutes) {
      lines.push(`### ${route.name} (${route.endpoints} endpoints)`);
      lines.push('');
      for (const r of route.routes) {
        lines.push(`- \`${r}\``);
      }
      lines.push('');
    }
  }

  // Frontend pages
  if (scan.frontendPages.length) {
    lines.push('## Frontend Pages');
    lines.push('');
    for (const page of scan.frontendPages) {
      lines.push(`- ${page}`);
    }
    lines.push('');
  }

  // Components
  if (scan.components.length) {
    lines.push('## Components');
    lines.push('');
    for (const comp of scan.components) {
      lines.push(`- ${comp}`);
    }
    lines.push('');
  }

  // Core modules
  if (scan.coreModules.length) {
    lines.push('## Core Modules');
    lines.push('');
    lines.push(`${scan.coreModules.length} modules in \`src/core/\`:`);
    lines.push('');
    for (const mod of scan.coreModules) {
      const exps = mod.exports.length ? ` — exports: ${mod.exports.join(', ')}` : '';
      lines.push(`- **${mod.name}**${exps}`);
    }
    lines.push('');
  }

  // Skills
  if (scan.skills.length) {
    lines.push('## Agent Skills');
    lines.push('');
    for (const skill of scan.skills) {
      const desc = skill.description ? `: ${skill.description}` : '';
      lines.push(`- **${skill.name}**${desc}`);
    }
    lines.push('');
  }

  // Config files
  if (scan.configFiles.length) {
    lines.push('## Config Files');
    lines.push('');
    for (const cf of scan.configFiles) {
      if (cf.keys) {
        lines.push(`- **${cf.file}**: ${cf.keys.join(', ')}`);
      } else {
        lines.push(`- ${cf.file}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate and write repo-expert SKILL.md for a target repo.
 */
export function generateRepoExpert(repoRoot, opts = {}) {
  const scan = scanRepo(repoRoot);
  const content = generateSkillMd(scan, repoRoot);

  const destDir = path.join(repoRoot, '.agent', 'skills', 'repo-expert');
  fs.mkdirSync(destDir, { recursive: true });

  const destFile = path.join(destDir, 'SKILL.md');
  const existed = fs.existsSync(destFile);

  if (existed && !opts.force) {
    // Back up existing
    const backupName = `SKILL.md.backup-${Date.now()}`;
    fs.copyFileSync(destFile, path.join(destDir, backupName));
  }

  fs.writeFileSync(destFile, content, 'utf8');

  return {
    success: true,
    repoRoot,
    destFile,
    existed,
    stats: {
      name: scan.name,
      languages: scan.languages.length,
      cliCommands: scan.cliCommands.length,
      apiRoutes: scan.apiRoutes.length,
      frontendPages: scan.frontendPages.length,
      coreModules: scan.coreModules.length,
      skills: scan.skills.length,
    },
  };
}

/**
 * CLI handler for `npx total-recall skill generate-expert`
 */
export default function generateExpertCmd(args) {
  const repoRoot = args.find(a => a !== '--force' && !a.startsWith('--')) || process.cwd();
  const force = args.includes('--force');

  console.log(`\n  Scanning ${repoRoot} ...`);
  const result = generateRepoExpert(path.resolve(repoRoot), { force });

  console.log(`\n  ✅ Generated repo-expert for: ${result.stats.name}`);
  console.log(`     → ${result.destFile}`);
  console.log(`     Languages: ${result.stats.languages}`);
  console.log(`     CLI commands: ${result.stats.cliCommands}`);
  console.log(`     API routes: ${result.stats.apiRoutes}`);
  console.log(`     Frontend pages: ${result.stats.frontendPages}`);
  console.log(`     Core modules: ${result.stats.coreModules}`);
  console.log(`     Agent skills: ${result.stats.skills}`);
  if (result.existed) console.log(`     (Previous SKILL.md backed up)`);
  console.log('');
}
