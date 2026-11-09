import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { loadNodes } from './vault.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/total-recall.mjs');

/** Use remember's length, duplicate and validated-write guards, with a pinned brain. */
export function rememberLessonRule(content, { brainDir, title, sourceRef, hold = false, execute = execFile } = {}) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('Lesson rule has no content');
  const agentDir = path.resolve(brainDir, '../..');
  if (path.resolve(agentDir, 'skills', 'total-recall') !== path.resolve(brainDir)) throw new Error('Lesson remember requires a standard brain path');
  const slug = `lesson-rule-${crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
  const existing = loadNodes(path.join(brainDir, 'memory-vault')).find(node => node.slug === slug);
  if (existing && existing.body?.trim() === content.trim()) return Promise.resolve({ slug, existing: true });
  const args = [cli, 'remember', 'invariant', content, '--global', '--slug', slug,
    '--status', hold ? 'draft' : 'active', '--tags', 'lesson-review',
    ...(title ? ['--title', title] : [])];
  return new Promise((resolve, reject) => {
    execute(process.execPath, args, { env: { ...process.env, AGENT_DIR: agentDir, TR_SESSION_ID: sourceRef }, timeout: 120_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => error ? reject(new Error(`Lesson remember failed: ${stderr || error.message}`)) : resolve({ slug, stdout }));
  });
}
