// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import init, { connectDetectedClients } from './init.mjs';

describe('init.mjs', () => {
  it('exports default', () => {
    expect(init).toBeDefined();
  });
});

describe('connectDetectedClients', () => {
  it('connects each detected IDE once so compile writes its instruction shim', async () => {
    const calls = [];
    const connected = await connectDetectedClients(
      [
        { clients: ['claude-code'] },
        { clients: ['antigravity', 'gemini'] },
        { clients: ['claude-code'] },
      ],
      { connectFn: async (args) => { calls.push(args[0]); } },
    );
    expect(calls).toEqual(['claude-code', 'antigravity']);
    expect(connected).toEqual(['claude-code', 'antigravity']);
  });

  it('skips targets with no known connect client and keeps going after a failure', async () => {
    const connected = await connectDetectedClients(
      [{ clients: ['not-a-client'] }, { clients: ['codex'] }, { clients: ['claude-code'] }],
      { connectFn: async ([c]) => { if (c === 'codex') throw new Error('boom'); } },
    );
    expect(connected).toEqual(['claude-code']);
  });
});


describe('plugin dependency wiring failure isolation', () => {
  it('init source guards preparePluginDependencies so one bad plugin cannot abort later steps', () => {
    // Regression: an unguarded preparePluginDependencies() threw
    // "Cannot find module '@gregiteen/ssss-cli'" for a vendored plugin and killed
    // `init` before step 3.7, so global skills were never projected into any
    // IDE's skill root, and their slash menus stayed empty with no error the
    // user could connect to the cause. The call site must stay inside try/catch.
    const source = fs.readFileSync(fileURLToPath(new URL('./init.mjs', import.meta.url)), 'utf8');
    const callIndex = source.indexOf('preparePluginDependencies(target)');
    expect(callIndex).toBeGreaterThan(-1);

    const before = source.slice(0, callIndex);
    const tryIndex = before.lastIndexOf('try {');
    const catchIndex = source.indexOf('} catch', callIndex);
    expect(tryIndex).toBeGreaterThan(-1);
    expect(catchIndex).toBeGreaterThan(callIndex);

    // The guard must be the immediately enclosing block, not a distant earlier one.
    expect(before.slice(tryIndex)).not.toContain('}\n  }');
  });
});


describe('bootstrap token store resolution', () => {
  // Regression: `init --project` issued the bootstrap PAT into the project's
  // OWN key store, but the server answering http://localhost:3000 derives its
  // store from AGENT_DIR — the GLOBAL brain under launchd. So the token written
  // into brain.json was accepted by nobody: init printed "pre-authorized" and
  // every request answered 401, which is what made `startup check` report
  // `brain failed` (instructions-http-401) for project after project.
  const projectBrain = '/repo/.agent/skills/total-recall';
  const globalBrain = '/home/user/.agent/skills/total-recall';

  /** A real on-disk brain directory, because an established store is required. */
  function establishedBrain(prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const brain = path.join(root, 'skills', 'total-recall');
    fs.mkdirSync(path.join(brain, 'config'), { recursive: true });
    fs.writeFileSync(path.join(brain, 'config', 'keys.jsonl'), '');
    return { root, brain };
  }

  it('mints a loopback project token into the store the local server reads', async () => {
    const { resolveServingBrainDir } = await import('./init.mjs');
    const serving = establishedBrain('tr-serving-');
    try {
      for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
        expect(resolveServingBrainDir({
          brainDir: projectBrain, isProject: true, brainUrl: url, globalBrainDir: serving.brain,
        })).toBe(serving.brain);
      }
    } finally {
      fs.rmSync(serving.root, { recursive: true, force: true });
    }
  });

  it('keeps the target brain store for a global run and for a remote brain', async () => {
    const { resolveServingBrainDir } = await import('./init.mjs');
    const serving = establishedBrain('tr-serving-');
    try {
      // A global init targets the store the server reads, so it must not divert.
      expect(resolveServingBrainDir({
        brainDir: serving.brain, isProject: false, brainUrl: 'http://localhost:3000', globalBrainDir: serving.brain,
      })).toBe(serving.brain);

      // A remote brain is served by a machine whose store we cannot write.
      for (const url of ['https://brain.example.com', 'http://100.64.0.1:3000', 'not-a-url']) {
        expect(resolveServingBrainDir({
          brainDir: projectBrain, isProject: true, brainUrl: url, globalBrainDir: serving.brain,
        })).toBe(projectBrain);
      }
    } finally {
      fs.rmSync(serving.root, { recursive: true, force: true });
    }
  });

  it('adopts only an established serving store and never collapses onto the project', async () => {
    // Two constraints pull against each other, and both are pinned here.
    // (a) `getGlobalAgentDir()` honours AGENT_DIR, so deriving the serving
    //     store from it collapsed the "global" brain onto the project under
    //     AGENT_DIR — the exact condition that produced the useless token —
    //     and the bug survived the first fix.
    // (b) An explicit root owns its whole layout, so init must never create
    //     $HOME/.agent behind a caller that named a different root.
    const { resolveServingBrainDir } = await import('./init.mjs');
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-serving-store-'));
    const established = path.join(fixture, 'established', 'skills', 'total-recall');
    fs.mkdirSync(path.join(established, 'config'), { recursive: true });
    fs.writeFileSync(path.join(established, 'config', 'keys.jsonl'), '');
    const selected = path.join(fixture, 'selected', 'skills', 'total-recall');

    const previous = process.env.AGENT_DIR;
    process.env.AGENT_DIR = path.join(fixture, 'selected');
    try {
      // (a) an AGENT_DIR pinned at the project must not make the serving store
      // the project store when a real established global store is passed.
      expect(resolveServingBrainDir({
        brainDir: selected, isProject: true, brainUrl: 'http://localhost:3000', globalBrainDir: established,
      })).toBe(established);

      // (b) nothing is adopted — and therefore nothing is created — when no
      // established store was named, even though $HOME is a temp dir here.
      const missing = path.join(fixture, 'missing', 'skills', 'total-recall');
      expect(resolveServingBrainDir({
        brainDir: selected, isProject: true, brainUrl: 'http://localhost:3000', globalBrainDir: missing,
      })).toBe(selected);
      expect(fs.existsSync(path.join(fixture, 'missing'))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.AGENT_DIR;
      else process.env.AGENT_DIR = previous;
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('issues the bootstrap key through a store bound to the resolved serving brain', async () => {
    const { resolveServingBrainDir } = await import('./init.mjs');
    const source = fs.readFileSync(fileURLToPath(new URL('./init.mjs', import.meta.url)), 'utf8');

    // The bootstrap must go through keyStoreFor(<serving brain>), not the
    // default `issueKey` import, which is pinned to AGENT_DIR and therefore
    // cannot express a project brain's serving store.
    expect(source).toContain('keyStoreFor(servingBrainDir)');
    expect(source).toContain('resolveServingBrainDir({ brainDir, isProject, brainUrl: brainCfg.url, globalBrainDir: servingGlobalBrainDir })');

    // `servingGlobalBrainDir` must be home-relative, NOT derived from
    // getGlobalAgentDir(), which honours AGENT_DIR and collapses onto the
    // project whenever AGENT_DIR is pinned there.
    expect(source).toContain("path.join(os.homedir(), '.agent', 'skills', 'total-recall')");
  });
});


describe('compatibility initialization explicit root isolation', () => {
  for (const layer of ['global', 'project']) {
    it(`initializes the explicit ${layer} root without writing HOME/.agent`, () => {
      const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-legacy-init-root-'));
      const home = path.join(fixture, 'home'), cwd = path.join(fixture, 'repository'), selected = path.join(fixture, 'selected-agent');
      fs.mkdirSync(home); fs.mkdirSync(cwd);
      try {
        execFileSync(process.execPath, [fileURLToPath(new URL('../../bin/total-recall.mjs', import.meta.url)), 'init', '--yes', ...(layer === 'project' ? ['--project'] : [])], {
          cwd, timeout: 20000, stdio: 'pipe', env: { ...process.env, HOME: home,
            AGENT_DIR: selected, _TR_TEST_AGENT_DIR: selected, TR_SECRETS_NO_KEYCHAIN: '1',
            TR_SECRETS_BRAIN: path.join(selected, 'skills', 'total-recall'),
            TR_ENV_FILE: path.join(fixture, 'missing.env'), TR_SECRETS_PASSWORD: '', TR_MASTER_PASSWORD: '',
            OPENROUTER_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_API_KEY: '', ANTHROPIC_API_KEY: '',
            TR_EMBEDDINGS_DISABLED: '1', DISABLE_DAEMON: 'true' },
        });
        expect(fs.existsSync(path.join(selected, 'skills', 'total-recall', 'config', 'brain.json'))).toBe(true);
        expect(fs.existsSync(path.join(home, '.agent'))).toBe(false);
        const result = execFileSync(process.execPath, [fileURLToPath(new URL('../../bin/total-recall.mjs', import.meta.url)), 'auth', 'password', 'set', '--stdin', '--json'], {
          cwd, timeout: 20000, encoding: 'utf8', input: 'fixture-password-only\n',
          env: { ...process.env, HOME: home, AGENT_DIR: selected, _TR_TEST_AGENT_DIR: selected,
            TR_SECRETS_BRAIN: path.join(selected, 'skills/total-recall'), TR_SECRETS_PASSWORD: 'fixture-master-only',
            TR_SECRETS_NO_KEYCHAIN: '1', TR_ENV_FILE: path.join(fixture, 'missing.env') },
        });
        expect(JSON.parse(result).updated).toBe(true);
        const bytes = fs.readFileSync(path.join(selected, 'skills/total-recall/config/secrets.enc'));
        expect(bytes.includes(Buffer.from('fixture-password-only'))).toBe(false);
        // Project init also creates the repository-owned expert skill.
        expect(fs.existsSync(path.join(cwd, '.agent', 'skills', 'total-recall', 'config', 'brain.json'))).toBe(false);
        expect(fs.existsSync(path.join(cwd, '.agent', 'skills', 'total-recall', 'config', 'secrets.enc'))).toBe(false);
      } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
    });
  }
});


describe('project brain-state gitignore', () => {
  // Regression: `init --project` wrote brain.json (a live plaintext PAT) into
  // the repository without excluding it, so twelve repositories tracked it and
  // published a credential on every commit. Twelve tracked it; the tokens were
  // inert only because they were also minted into the wrong store (the v3.40.6
  // bug), which is luck, not safety.
  it('excludes brain-local runtime state and keeps existing rules', async () => {
    const { ensureProjectGitignore } = await import('./init.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gitignore-'));
    try {
      fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n*.log\n');
      const added = ensureProjectGitignore(root);

      const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
      // Pre-existing rules survive untouched.
      expect(content).toContain('node_modules/');
      expect(content).toContain('*.log');
      // The credential-bearing paths are excluded.
      expect(content).toContain('.agent/skills/total-recall/config/brain.json');
      expect(content).toContain('.agent/skills/total-recall/config/keys.jsonl');
      expect(content).toContain('.agent/skills/total-recall/config/secrets.enc');
      expect(added).toContain('.agent/skills/total-recall/config/brain.json');

      // Idempotent: a second run adds nothing and does not duplicate.
      expect(ensureProjectGitignore(root)).toEqual([]);
      expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(content);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('dry run reports the exclusions without writing', async () => {
    const { ensureProjectGitignore } = await import('./init.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gitignore-dry-'));
    try {
      const planned = ensureProjectGitignore(root, { dryRun: true });
      expect(planned.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(root, '.gitignore'))).toBe(false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('is wired into project init', () => {
    const source = fs.readFileSync(fileURLToPath(new URL('./init.mjs', import.meta.url)), 'utf8');
    expect(source).toContain('ensureProjectGitignore(cwd, { dryRun: opts.dryRun })');
  });
});
