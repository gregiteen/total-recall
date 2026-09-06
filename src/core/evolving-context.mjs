import fs from 'node:fs';
import path from 'node:path';
import {
  getCachedSection,
  loadSectionCache,
  saveSectionCache,
  computeSectionHash,
  manageContextBudget
} from './context-cache.mjs';

/**
 * Compile evolving context blocks across multi-domain SSSS nodes and plugins.
 * Supports deep token windows up to 500,000 tokens with section-level caching.
 *
 * @param {object} options
 * @param {string} [options.derivedDir] - Target directory for memory-derived artifacts
 * @param {Array<object>} [options.nodes] - SSSS memory nodes
 * @param {Array<object>} [options.plugins] - Active plugin descriptors
 * @param {number} [options.maxChars=500000] - Token/character budget ceiling
 * @param {number} [options.slidingWindowLimit=50] - Number of recent historical items to retain
 * @returns {Promise<{ content: string, cacheHits: number, cacheMisses: number, totalSections: number }>}
 */
export async function compileEvolvingContext(options = {}) {
  const {
    derivedDir,
    nodes = [],
    plugins = [],
    maxChars = 500_000,
    slidingWindowLimit = 50
  } = options;

  let cacheHits = 0;
  let cacheMisses = 0;

  const activeNodes = nodes.filter((n) => n && n.status !== 'deprecated' && n.status !== 'archived');

  // Partition nodes by domain
  const userProjects = activeNodes.filter((n) => n.category === 'user-projects');
  const benchmarks = activeNodes.filter((n) => n.category === 'benchmarks');
  const researchNodes = activeNodes.filter((n) => n.category === 'research' || n.category === 'frontier-capabilities');

  // Section 1: User Projects & Active Blockers (Priority 100 - unevictable)
  const projectsSection = await getCachedSection({
    derivedDir,
    sectionKey: 'user_projects',
    nodes: userProjects,
    generatorFn: async () => {
      if (userProjects.length === 0) return '';
      const lines = ['### 1. Grounded User Science & Active Blockers\n'];
      for (const p of userProjects) {
        lines.push(`* **Project**: \`${p.title || p.slug}\` (Path: \`${p.source?.repo_path || 'local'}\`)`);
        if (p.description) lines.push(`  * **Mission**: ${p.description}`);
        if (Array.isArray(p.enables) && p.enables.length > 0) {
          lines.push(`  * **Required Capabilities**: ${p.enables.join(', ')}`);
        }
      }
      return lines.join('\n');
    }
  });
  if (projectsSection.cached) cacheHits++; else cacheMisses++;

  // Section 2: Benchmark Ledger (Priority 90)
  const benchmarkSection = await getCachedSection({
    derivedDir,
    sectionKey: 'benchmark_ledger',
    nodes: benchmarks,
    generatorFn: async () => {
      if (benchmarks.length === 0) return '';
      const lines = [
        '### 2. State-of-the-Art Benchmark Ledger & Pareto Frontiers\n',
        '| Domain / Metric | Current World Record | Baseline | Verification Tier | Source / Lab |',
        '|---|---|---|---|---|'
      ];
      for (const b of benchmarks) {
        const src = b.source || {};
        const metricCode = src.metric_name || b.slug;
        const metricDisplay = b.title && metricCode && b.title !== metricCode
          ? `${b.title} (\`${metricCode}\`)`
          : `\`${metricCode || b.title}\``;
        const current = src.current_record ? `**${src.current_record} ${src.unit || ''}**`.trim() : '—';
        const baseline = src.previous_record ? `${src.previous_record} ${src.unit || ''}`.trim() : '—';
        const tier = src.verification_status || 'unverified';
        const ref = src.doi ? `[${src.doi}](https://doi.org/${src.doi})` : (src.lab || 'empirical');
        lines.push(`| ${metricDisplay} | ${current} | ${baseline} | ${tier} | ${ref} |`);
      }
      return lines.join('\n');
    }
  });
  if (benchmarkSection.cached) cacheHits++; else cacheMisses++;

  // Section 3: Verified Capability Breakthroughs (Priority 80)
  const breakthroughsSection = await getCachedSection({
    derivedDir,
    sectionKey: 'breakthroughs',
    nodes: researchNodes,
    generatorFn: async () => {
      if (researchNodes.length === 0) return '';
      const lines = ['### 3. Verified Capability Breakthroughs (What Is Now Possible)\n'];
      // Apply sliding window to prioritize the most recent breakthroughs
      const sorted = [...researchNodes].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      const windowed = sorted.slice(0, slidingWindowLimit);

      for (const r of windowed) {
        const src = r.source || {};
        const tier = src.epistemic_tier ? `[Tier ${src.epistemic_tier}] ` : '';
        const modality = src.empirical_modality ? `(\`${src.empirical_modality}\`)` : '';
        lines.push(`#### ${tier}${r.title || r.slug} ${modality}`);
        if (r.description) lines.push(`> **Capability**: ${r.description}\n`);
        if (src.doi) lines.push(`* **Primary DOI**: https://doi.org/${src.doi}`);
        if (Array.isArray(r.enables) && r.enables.length > 0) {
          lines.push(`* **Unlocks Subgraph**: ${r.enables.join(', ')}`);
        }
        lines.push('');
      }
      return lines.join('\n');
    }
  });
  if (breakthroughsSection.cached) cacheHits++; else cacheMisses++;

  // Section 4: Dynamic Plugin Injections
  const pluginSections = [];
  for (const plug of plugins) {
    const plugNodes = activeNodes.filter(n => Array.isArray(plug.categories) && plug.categories.includes(n.category));
    const pSec = await getCachedSection({
      derivedDir,
      sectionKey: `plugin_${plug.id}`,
      nodes: plugNodes,
      extraInput: JSON.stringify(plug.manifest || {}),
      generatorFn: async () => {
        const lines = [`### Plugin: ${plug.name || plug.id}\n`];
        if (plug.description) lines.push(`> ${plug.description}\n`);
        for (const pn of plugNodes) {
          lines.push(`- **${pn.title || pn.slug}**: ${pn.body || pn.description || ''}`);
        }
        return lines.join('\n');
      }
    });
    if (pSec.cached) cacheHits++; else cacheMisses++;
    pluginSections.push({ priority: 60, content: pSec.content });
  }

  // Manage total context budget
  const allSections = [
    { priority: 100, content: projectsSection.content, allowTruncation: false },
    { priority: 90, content: benchmarkSection.content },
    { priority: 80, content: breakthroughsSection.content },
    ...pluginSections
  ].filter(s => s.content && s.content.trim().length > 0);

  const assembledContent = manageContextBudget(allSections, { maxChars });

  // Persist to memory-derived/evolving-context.md if derivedDir is provided
  if (derivedDir) {
    try {
      if (!fs.existsSync(derivedDir)) {
        fs.mkdirSync(derivedDir, { recursive: true });
      }
      const targetPath = path.join(derivedDir, 'evolving-context.md');
      fs.writeFileSync(targetPath, assembledContent, 'utf8');
    } catch {
      // Best-effort write
    }
  }

  return {
    content: assembledContent,
    cacheHits,
    cacheMisses,
    totalSections: allSections.length
  };
}
