import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { replaceFirstManagedInjectionBlock, heuristicCompact, buildRulesBlock, extractWikilinks, mergeGlobalRuleNodes, isSurfaceCodeStale, compileSurface } from './surface.mjs';
import { ruleFingerprint } from './context-policy.mjs';

describe('instruction artifact integrity', () => {
  async function withBrain(layer, test) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-artifacts-'));
    const workspace = path.join(root, layer);
    const agent = path.join(workspace, '.agent');
    const skillsDir = path.join(agent, 'skills');
    const brain = path.join(skillsDir, 'total-recall');
    const config = path.join(brain, 'config');
    const surface = layer === 'global' ? agent : workspace;
    const options = { skillsDir, vaultDir: path.join(brain, 'memory-vault'),
      derivedDir: path.join(brain, 'memory-derived'), instructionsFile: path.join(surface, 'INSTRUCTIONS.md'), semantic: false };
    for (const dir of [config, options.vaultDir, options.derivedDir]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(config, 'clients.json'), JSON.stringify(['codex']));
    try { await test({ root, surface, config, options }); }
    finally { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); }
  }

  for (const layer of ['global', 'project']) {
    it(`${layer}: rejects a silent no-op write even with an existing nonempty surface`, () => withBrain(layer, async ({ options }) => {
      fs.writeFileSync(options.instructionsFile, '# stale authored text\n');
      const rename = fs.renameSync.bind(fs);
      vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (to !== options.instructionsFile) rename(from, to);
      });
      await expect(compileSurface(options)).rejects.toThrow(/verification|read-back/i);
      expect(fs.existsSync(path.join(options.derivedDir, 'vault-hash.txt'))).toBe(false);
    }));

    it(`${layer}: repairs deleted and edited outputs before allowing an unchanged skip`, () => withBrain(layer, async ({ surface, options }) => {
      await compileSurface(options);
      expect(fs.existsSync(path.join(options.vaultDir, 'index.md'))).toBe(false);
      expect(fs.existsSync(path.join(options.vaultDir, 'log.md'))).toBe(false);
      expect((await compileSurface(options)).skipped).toBe(true);
      const shim = path.join(surface, 'AGENTS.md');
      fs.unlinkSync(shim);
      expect((await compileSurface(options)).skipped).not.toBe(true);
      expect(fs.readFileSync(shim, 'utf8')).toContain('TOTAL RECALL');
      fs.writeFileSync(options.instructionsFile, '# authored note\n');
      expect((await compileSurface(options)).skipped).not.toBe(true);
      const repaired = fs.readFileSync(options.instructionsFile, 'utf8');
      expect(repaired).toContain('TOTAL RECALL');
      expect(repaired).toContain('# authored note');
      expect((await compileSurface(options)).skipped).toBe(true);
    }));

    it(`${layer}: client configuration changes invalidate output reuse`, () => withBrain(layer, async ({ surface, config, options }) => {
      await compileSurface(options);
      fs.writeFileSync(path.join(config, 'clients.json'), JSON.stringify(['codex', 'claude-code']));
      expect((await compileSurface(options)).skipped).not.toBe(true);
      expect(fs.readFileSync(path.join(surface, 'CLAUDE.md'), 'utf8')).toContain('TOTAL RECALL');
    }));

    it(`${layer}: compiles Hermes as an AGENTS.md client and writes no Hermes memory`, () => withBrain(layer, async ({ surface, config, options }) => {
      fs.writeFileSync(path.join(config, 'clients.json'), JSON.stringify({ clients: { hermes: { mode: 'symlink' } } }));
      await compileSurface(options);
      expect(fs.readFileSync(path.join(surface, 'AGENTS.md'), 'utf8')).toContain('TOTAL RECALL');
      expect(fs.existsSync(path.join(surface, '.hermes', 'memories'))).toBe(false);
    }));

    it(`${layer}: refuses a cached shim retargeted outside its selected workspace`,() => withBrain(layer, async ({ root, surface, options }) => {
      await compileSurface(options);
      const outside = path.join(root, 'outside.md');
      const content = fs.readFileSync(path.join(surface, 'AGENTS.md'), 'utf8');
      fs.writeFileSync(outside, content);
      fs.unlinkSync(path.join(surface, 'AGENTS.md'));
      fs.symlinkSync(outside, path.join(surface, 'AGENTS.md'));
      await expect(compileSurface(options)).rejects.toThrow(/outside the selected project/);
      expect(fs.readFileSync(outside, 'utf8')).toBe(content);
    }));
  }
});

describe('compileSurface writes the surface where the harness reads it', () => {
  // Regression: compilePointers stripped a trailing `.agent` from the
  // instructions directory, so the GLOBAL brain (whose instructionsFile is
  // `<home>/.agent/INSTRUCTIONS.md`) computed `<home>` as its base dir and wrote
  // `<home>/INSTRUCTIONS.md`. `<home>/.agent/INSTRUCTIONS.md` -- the file the
  // agent harness actually reads -- was never rewritten and stayed frozen at
  // 2026-05-25 until this was fixed, while compile still reported success and
  // "0 drift". Any layer whose agent dir is literally named `.agent` must still
  // resolve into that directory, not its parent.
  it('writes INSTRUCTIONS.md into an agent dir named .agent, not its parent', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-home-'));
    const agentDir = path.join(home, '.agent');
    const skillsDir = path.join(agentDir, 'skills');
    const vaultDir = path.join(skillsDir, 'total-recall', 'memory-vault');
    const derivedDir = path.join(skillsDir, 'total-recall', 'memory-derived');
    for (const d of [vaultDir, derivedDir, path.join(vaultDir, 'invariants')]) {
      fs.mkdirSync(d, { recursive: true });
    }
    try {
      await compileSurface({
        vaultDir, skillsDir, derivedDir,
        instructionsFile: path.join(agentDir, 'INSTRUCTIONS.md'),
        force: true, semantic: false,
      });
      // The surface belongs in the agent dir the harness reads, even on a first
      // compile where INSTRUCTIONS.md does not exist yet.
      const canonical = path.join(agentDir, 'INSTRUCTIONS.md');
      expect(fs.existsSync(canonical)).toBe(true);
      expect(fs.readFileSync(canonical, 'utf8')).toContain('TOTAL RECALL');
      // The relocation bug wrote the surface here instead. It must never return.
      expect(fs.existsSync(path.join(home, 'INSTRUCTIONS.md'))).toBe(false);
      expect(fs.existsSync(path.join(home, 'AGENTS.md'))).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('keeps the surface inside the agent dir when skillsDir lives there', async () => {
    // The real global shape: rebuild.mjs computes instructionsFile as
    // `<agentDir>/INSTRUCTIONS.md` and skillsDir as `<agentDir>/skills`, where
    // agentDir is `<home>/.agent`. The surface must land IN `.agent`, not in
    // `<home>`. The buggy code peeled the trailing `.agent` unconditionally.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-proj-'));
    const agentDir = path.join(home, '.agent');
    const skillsDir = path.join(agentDir, 'skills');
    const vaultDir = path.join(skillsDir, 'total-recall', 'memory-vault');
    const derivedDir = path.join(skillsDir, 'total-recall', 'memory-derived');
    for (const d of [vaultDir, derivedDir, path.join(vaultDir, 'invariants')]) {
      fs.mkdirSync(d, { recursive: true });
    }
    try {
      await compileSurface({
        vaultDir, skillsDir, derivedDir,
        instructionsFile: path.join(agentDir, 'INSTRUCTIONS.md'),
        force: true, semantic: false,
      });
      expect(fs.readFileSync(path.join(agentDir, 'INSTRUCTIONS.md'), 'utf8')).toContain('TOTAL RECALL');
      expect(fs.existsSync(path.join(home, 'INSTRUCTIONS.md'))).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('writes client shims beside INSTRUCTIONS.md, never into a nested .agent dir', async () => {
    // Regression: plugin-store.mjs passed `instructionsFile` as
    // `<project>/.agent/INSTRUCTIONS.md` for a PROJECT brain, so compilePointers
    // put `AGENTS.md`/`CLAUDE.md` in `<project>/.agent/` -- a directory no
    // harness reads. The install still reported `compilation.ok: true`, so every
    // plugin install silently refreshed nothing the agent actually sees.
    //
    // The surface directory is the PROJECT ROOT for a project brain, so all
    // shims must be siblings of INSTRUCTIONS.md there.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-shimroot-'));
    const agentDir = path.join(root, '.agent');
    const skillsDir = path.join(agentDir, 'skills');
    const vaultDir = path.join(skillsDir, 'total-recall', 'memory-vault');
    const derivedDir = path.join(skillsDir, 'total-recall', 'memory-derived');
    const config = path.join(skillsDir, 'total-recall', 'config');
    for (const d of [vaultDir, derivedDir, path.join(vaultDir, 'invariants'), config]) {
      fs.mkdirSync(d, { recursive: true });
    }
    fs.writeFileSync(path.join(config, 'clients.json'), JSON.stringify(['codex', 'claude-code']));
    try {
      await compileSurface({
        vaultDir, skillsDir, derivedDir,
        instructionsFile: path.join(root, 'INSTRUCTIONS.md'),
        force: true, semantic: false,
      });
      // Harness-facing shims belong at the project root...
      for (const file of ['INSTRUCTIONS.md', 'AGENTS.md', 'CLAUDE.md']) {
        expect(fs.existsSync(path.join(root, file)), `${file} should be at the project root`).toBe(true);
      }
      // ...and must NOT be buried in `.agent/`, which is where the bug put them.
      for (const file of ['AGENTS.md', 'CLAUDE.md', 'INSTRUCTIONS.md']) {
        expect(fs.existsSync(path.join(agentDir, file)), `${file} must not land in .agent/`).toBe(false);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

it('renders the same curated operative directive in bootstrap and task surfaces', async () => {
  const rule = { slug: 'short', category: 'invariants', status: 'active', body: 'Historical detail '.repeat(400) };
  const policy = { slug: 'routing', category: 'decisions', status: 'active', tags: ['context:policy'],
    body: JSON.stringify({ rules: { 'project:short': { source_hash: ruleFingerprint(rule), actions: ['universal'], directive: 'Preserve data.' } } }) };
  const block = await buildRulesBlock(null, [rule, policy], { bootstrap: true });
  expect(block).toContain('Preserve data.');
  expect(block).not.toContain('Historical detail');
  await expect(buildRulesBlock(null, [{ ...rule, body: 'Changed detail '.repeat(400) }, policy], { bootstrap: true })).resolves.not.toContain('Preserve data.');
});

describe('Surface Routing Accuracy', () => {

  it('does not replace injected-memory examples inside fenced code blocks', () => {
    const raw = [
      '# Skill',
      '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->',
      'old live block',
      '<!-- END INJECTED MEMORY -->',
      '',
      '```markdown',
      '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->',
      'example block',
      '<!-- END INJECTED MEMORY -->',
      '```',
      ''
    ].join('\n');

    const updated = replaceFirstManagedInjectionBlock(raw, 'new live block');

    expect(updated).toContain('new live block');
    expect(updated).toContain('example block');
  });

  it('heuristically compacts nodes to be within 180 characters and non-redundant', () => {
    const node = {
      title: 'Never run tsc directly',
      body: 'Always use the start-here script that handles environment variables and configures paths correctly.'
    };
    const compacted = heuristicCompact(node);
    expect(compacted).toBe('Never run tsc directly — Always use the start-here script that handles environment variables and configures paths correctly.');
    expect(compacted.length).toBeLessThanOrEqual(180);

    const redundantNode = {
      title: 'Always use single quotes',
      body: 'Always use single quotes in JavaScript files to maintain consistency across the codebase.'
    };
    const compactedRedundant = heuristicCompact(redundantNode);
    // Since the body starts with the title, titleIsEcho fires and uses body directly (more info for agents)
    expect(compactedRedundant).toBe('Always use single quotes in JavaScript files to maintain consistency across the codebase.');

    // Categorized nodes get modality markers
    const invariantNode = {
      title: 'Never run tsc',
      body: 'Use start-here scripts.',
      category: 'invariants',
      modality: 'must'
    };
    const compactedInvariant = heuristicCompact(invariantNode);
    expect(compactedInvariant).toBe('[MUST] Never run tsc: Use start-here scripts.');
  });

  it('compiles only invariants, preferences, and anti-patterns (category partitioning)', async () => {
    const nodes = [
      { slug: 'rule1', category: 'invariants', title: 'Always run tests', body: 'Must run tests.', status: 'active' },
      { slug: 'rule2', category: 'preferences', title: 'Single quotes', body: 'Use single quotes.', status: 'active' },
      { slug: 'rule3', category: 'anti-patterns', title: 'No global variables', body: 'Avoid globals.', status: 'active' },
      { slug: 'fact1', category: 'facts', title: 'Server port', body: 'Port is 3000.', status: 'active' }
    ];

    const block = await buildRulesBlock(null, nodes);
    expect(block).toContain('Always run tests');
    expect(block).toContain('Single quotes');
    expect(block).toContain('No global variables');
    expect(block).not.toContain('Server port'); // facts should be excluded (category partitioning)
  });

  describe('extractWikilinks', () => {
    it('extracts standard wikilinks correctly', () => {
      const body = 'Check out [[some-slug]] and [[another-slug|with alias]].';
      const links = extractWikilinks(body);
      expect(links).toEqual(['some-slug', 'another-slug']);
    });

    it('extracts relative Markdown link targets and excludes absolute URLs', () => {
      const body = 'See [also](./patterns/atomic-writes.md) or visit [Google](https://google.com).';
      const links = extractWikilinks(body);
      expect(links).toEqual(['atomic-writes']);
    });

    it('returns empty array when no links are present', () => {
      const body = 'Plain text without any links.';
      const links = extractWikilinks(body);
      expect(links).toEqual([]);
    });
  });
});

describe('mergeGlobalRuleNodes', () => {
  const rule = (slug, category, body = slug) => ({ slug, category, status: 'active', importance: 5, title: slug, body });

  it('adds global rules to a project that lacks them', () => {
    const merged = mergeGlobalRuleNodes([rule('own', 'invariants')], [rule('shared', 'anti-patterns')]);
    expect(merged.map((n) => n.slug)).toEqual(['own', 'shared']);
    expect(merged[1]._layer).toBe('global');
  });

  it('lets a project node override a global rule with the same slug', () => {
    const merged = mergeGlobalRuleNodes([rule('same', 'invariants', 'project wording')], [rule('same', 'invariants', 'global wording')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBe('project wording');
  });

  it('keeps global facts and concepts out of the surfaces', () => {
    const merged = mergeGlobalRuleNodes([], [rule('a-fact', 'facts'), rule('a-pref', 'preferences')]);
    expect(merged.map((n) => n.slug)).toEqual(['a-pref']);
  });

  it('does not mutate the cached global nodes', () => {
    const globalNode = rule('shared', 'invariants');
    mergeGlobalRuleNodes([], [globalNode]);
    expect(globalNode._layer).toBeUndefined();
  });

  it('preserves all unknown required rules without lossy overflow summaries', async () => {
    const prev = process.env.TR_RULE_BUDGET_CHARS;
    process.env.TR_RULE_BUDGET_CHARS = JSON.stringify({ corrections: 200 });
    try {
      const nodes = Array.from({ length: 16 }, (_, i) => ({
        ...rule(`c${i}`, 'anti-patterns', `Correction number ${i} body`),
        title: `Correction number ${i}`,
        modality: 'should',
        created: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      }));
      const block = await buildRulesBlock(null, nodes);
      expect(block).toContain('16 corrections');
      for (let i = 0; i < 16; i++) expect(block).toContain(`Correction number ${i}`);
      expect(block).not.toMatch(/\d+ more, one line each/);
      expect(block).not.toContain('not shown');
    } finally {
      if (prev === undefined) delete process.env.TR_RULE_BUDGET_CHARS;
      else process.env.TR_RULE_BUDGET_CHARS = prev;
    }
  });

  it('always writes MUST rules in full even when the budget is exhausted', async () => {
    const prev = process.env.TR_RULE_BUDGET_CHARS;
    process.env.TR_RULE_BUDGET_CHARS = JSON.stringify({ corrections: 1 });
    try {
      const nodes = [
        { ...rule('m1', 'anti-patterns', 'The full text of a must rule that has to be visible.'), modality: 'must', title: 'Must rule' },
      ];
      const block = await buildRulesBlock(null, nodes);
      expect(block).toContain('The full text of a must rule that has to be visible.');
      expect(block).not.toMatch(/more, one line each/);
    } finally {
      if (prev === undefined) delete process.env.TR_RULE_BUDGET_CHARS;
      else process.env.TR_RULE_BUDGET_CHARS = prev;
    }
  });

  it('renders an inherited global rule in the project rules block', async () => {
    const merged = mergeGlobalRuleNodes([], [{ ...rule('global-rule', 'anti-patterns'), title: 'Global correction', modality: 'must' }]);
    const block = await buildRulesBlock(null, merged);
    expect(block).toContain('1 corrections');
    expect(block).toContain('Global correction');
  });
});

describe('isSurfaceCodeStale', () => {
  it('is false for the code this process loaded and true once the file on disk changes', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-stale-')), 'surface.mjs');
    fs.writeFileSync(file, 'v1');
    const loaded = crypto.createHash('sha256').update('v1').digest('hex');
    expect(isSurfaceCodeStale(file, loaded)).toBe(false);
    fs.writeFileSync(file, 'v2');
    expect(isSurfaceCodeStale(file, loaded)).toBe(true);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('reports fresh code for the running module', () => {
    expect(isSurfaceCodeStale()).toBe(false);
  });
});

describe('readRuleBudgets', () => {
  it('reads surface.yml, lets a project override the global brain, and lets the env override both', async () => {
    const { readRuleBudgets } = await import('./surface.mjs');
    const skills = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-budget-'));
    fs.mkdirSync(path.join(skills, 'total-recall', 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(skills, 'total-recall', 'config', 'surface.yml'),
      'rules:\n  invariants_budget_chars: 12345\n  corrections_budget_chars: 0\n',
    );
    const prev = process.env.TR_RULE_BUDGET_CHARS;
    delete process.env.TR_RULE_BUDGET_CHARS;
    try {
      const b = readRuleBudgets(skills);
      expect(b.invariants).toBe(12345);
      expect(b.corrections).toBeUndefined(); // 0 is ignored, falls back to the default
      process.env.TR_RULE_BUDGET_CHARS = JSON.stringify({ invariants: 99 });
      expect(readRuleBudgets(skills).invariants).toBe(99);
    } finally {
      if (prev === undefined) delete process.env.TR_RULE_BUDGET_CHARS;
      else process.env.TR_RULE_BUDGET_CHARS = prev;
      fs.rmSync(skills, { recursive: true, force: true });
    }
  });
});

describe('readContextBudget', () => {
  it('defaults to the fixed totals and lets surface.yml and the env override them', async () => {
    const { readContextBudget } = await import('./surface.mjs');
    const skills = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-ctx-budget-'));
    fs.mkdirSync(path.join(skills, 'total-recall', 'config'), { recursive: true });
    const prev = process.env.TR_CONTEXT_BUDGET_TOKENS;
    delete process.env.TR_CONTEXT_BUDGET_TOKENS;
    try {
      expect(readContextBudget(skills)).toEqual({ total_tokens: 4000, bootstrap_total_tokens: 16000 });

      fs.writeFileSync(
        path.join(skills, 'total-recall', 'config', 'surface.yml'),
        'budget:\n  bootstrap_total_tokens: 12000\n  total_tokens: 0\n',
      );
      const fromFile = readContextBudget(skills);
      expect(fromFile.bootstrap_total_tokens).toBe(12000);
      expect(fromFile.total_tokens).toBe(4000); // 0 is ignored, falls back to the default

      process.env.TR_CONTEXT_BUDGET_TOKENS = JSON.stringify({ bootstrap_total_tokens: 333 });
      expect(readContextBudget(skills).bootstrap_total_tokens).toBe(333);
    } finally {
      if (prev === undefined) delete process.env.TR_CONTEXT_BUDGET_TOKENS;
      else process.env.TR_CONTEXT_BUDGET_TOKENS = prev;
      fs.rmSync(skills, { recursive: true, force: true });
    }
  });
});

