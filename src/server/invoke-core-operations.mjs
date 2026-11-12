/** Owner adapters for the retired one-off remote routes. */
import fs from 'node:fs';
import path from 'node:path';
import matter from '../core/frontmatter.mjs';
import { readRegisteredProjects } from '../core/brain-registry.mjs';
import { InvokeError } from './invoke-execution.mjs';

export const CORE_OPERATIONS = Object.freeze({
  'context.preview': { scope: 'memory:read', family: 'context' },
  'context.stream': { scope: 'memory:read', family: 'context' },
  'context.flash.health': { scope: 'memory:read', family: 'context' },
  'brains.sync': { scope: 'memory:write', family: 'brains' },
  'tasks.cleanup': { scope: 'tasks:write', family: 'tasks' },
  'tasks.failed': { scope: 'tasks:read', family: 'tasks' },
  'vault.hash': { scope: 'memory:read', family: 'vault' },
});

export function validateCoreParams(operation, params) {
  if (params.timeoutMs !== undefined && (!Number.isFinite(Number(params.timeoutMs)) || Number(params.timeoutMs) <= 0)) {
    throw new InvokeError(400, 'invalid-timeout', 'timeoutMs must be positive and finite.');
  }
  const allowed = new Set(['target', 'timeoutMs']);
  if (!['brains.sync', 'context.flash.health'].includes(operation)) allowed.add('brainId');
  if (operation === 'context.stream') for (const key of ['query', 'budget_tokens', 'concurrency', 'min_score']) allowed.add(key);
  if (Object.keys(params).some(key => !allowed.has(key))) throw new InvokeError(400, 'unknown-parameter', 'Unsupported operation parameter.');
  if (params.brainId !== undefined && (typeof params.brainId !== 'string' || !params.brainId || params.brainId.includes(','))) {
    throw new InvokeError(400, 'invalid-brain', 'brainId must select one brain.');
  }
  if (params.brainId !== undefined && !['server', 'global'].includes(params.brainId) &&
    !/^project:[^/\\\0,]+$/.test(params.brainId)) {
    throw new InvokeError(400, 'invalid-brain', 'brainId must select the server or a registered project.');
  }
  if (operation === 'context.stream') {
    if (typeof params.query !== 'string' || !params.query.trim()) throw new InvokeError(400, 'invalid-query', 'query is required.');
    for (const [key, min, max] of [['budget_tokens', 1, 65536], ['concurrency', 1, 4], ['min_score', 0, 100]]) {
      if (params[key] !== undefined && (!Number.isInteger(params[key]) || params[key] < min || params[key] > max)) {
        throw new InvokeError(400, 'invalid-parameter', `Invalid ${key}.`);
      }
    }
  }
}

function selectedBrain(brainId, brain, registryBrain) {
  if (brainId === undefined || brainId === 'server' || brainId === 'global') return brain;
  if (brainId.startsWith('project:')) {
    const name = brainId.slice('project:'.length);
    const project = readRegisteredProjects(registryBrain).find(row => row.name === name || row.project_id === name);
    if (project?.brainDir && fs.existsSync(path.join(project.brainDir, 'memory-vault'))) return project.brainDir;
  }
  throw new InvokeError(404, 'brain-unavailable', 'Selected brain is unavailable.');
}

export async function executeCoreOperation(operation, params, { brain, registryBrain }) {
  if (!Object.hasOwn(CORE_OPERATIONS, operation)) throw new InvokeError(404, 'unknown-operation', 'Unknown operation.');
  validateCoreParams(operation, params);
  const selected = selectedBrain(params.brainId, brain, registryBrain);
  const vaultDir = path.join(selected, 'memory-vault');
  switch (operation) {
    case 'context.preview': {
      const { previewContext } = await import('../core/context-compiler.mjs');
      return previewContext({ vaultDir });
    }
    case 'context.stream': {
      const { streamParallelContext } = await import('../core/parallel-context.mjs');
      const result = await streamParallelContext({ query: params.query, vaultDir,
        budgetTokens: params.budget_tokens, concurrency: params.concurrency, minScore: params.min_score });
      // Provider diagnostics can contain a credential-bearing URL.
      return { ...result, scored: result.scored.map(({ error, ...row }) => error ? { ...row, error: 'provider-failed' } : row) };
    }
    case 'context.flash.health': {
      const { checkFlashHealth } = await import('../core/parallel-context.mjs');
      const { error, ...result } = await checkFlashHealth();
      return error ? { ...result, error: 'provider-unavailable' } : result;
    }
    case 'brains.sync': {
      const { syncAllRepos } = await import('../core/repo-sync.mjs');
      const result = await syncAllRepos({ registryBrain });
      if (result.repos.some(row => row.errors)) throw new InvokeError(502, 'sync-failed', 'Some repositories failed to sync.');
      return { ok: true, ...result };
    }
    case 'tasks.cleanup': {
      const queue = path.join(selected, 'scheduler/queue');
      let deleted = 0;
      if (fs.existsSync(queue)) for (const entry of fs.readdirSync(queue, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const file = path.join(queue, entry.name);
        const { data } = matter(fs.readFileSync(file, 'utf8'));
        if (data.status === 'completed') { fs.unlinkSync(file); deleted++; }
      }
      return { deleted };
    }
    case 'tasks.failed': {
      const { listTasks } = await import('../core/task-envelope.mjs');
      const tasks = listTasks(path.join(selected, 'scheduler/queue'), { status: 'failed' });
      return { total: tasks.length, tasks };
    }
    case 'vault.hash': {
      const file = path.join(selected, 'memory-derived/vault-hash.txt');
      return { vault_hash: fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null, vault_dir: vaultDir };
    }
  }
}
