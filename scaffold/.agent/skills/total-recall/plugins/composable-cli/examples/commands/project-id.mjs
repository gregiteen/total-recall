/**
 * total-recall project-id [--json] | --all
 *
 * Prints this project's stable random-UUID id, creating it on first use.
 *
 * v2 example demonstrating the composable CLI contract with meta export,
 * tr() composition, and risk declaration.
 *
 * Run: total-recall project-id [--json]
 */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export const meta = {
  name: 'project-id',
  description: 'Print this project\'s random-UUID project id (created on first use, stored in config/brain.json)',
  risk: 'read',
  version: 2,
  background: false,
};

const BRAIN_FILE = path.join(process.cwd(), '.agent', 'skills', 'total-recall', 'config', 'brain.json');

function readProjectBrain() {
  try {
    if (fs.existsSync(BRAIN_FILE)) {
      return JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf8'));
    }
  } catch { /* not found or invalid */ }
  return null;
}

function ensureProjectId() {
  const brain = readProjectBrain() || {};
  let created = false;
  if (!brain.project_id) {
    brain.project_id = crypto.randomUUID();
    created = true;
    fs.mkdirSync(path.dirname(BRAIN_FILE), { recursive: true });
    fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain, null, 2) + '\n');
  }
  return { project_id: brain.project_id, created };
}

/**
 * v2 entry point — receives (args, context)
 */
export default async function main(args = [], context = {}) {
  const { json = false, tr, log } = context;

  const safeArgs = args.filter((a) => a !== 'project-id');

  if (safeArgs.includes('--help') || safeArgs.includes('-h')) {
    const usage = 'Usage: total-recall project-id [--json]\n\nPrints this project\'s random-UUID project id.';
    if (json) return { ok: true, data: { usage } };
    console.log(usage);
    return { ok: true, data: null };
  }

  const { project_id, created } = ensureProjectId();
  const result = {
    project_id,
    name: path.basename(process.cwd()),
    created,
    path: process.cwd(),
  };

  if (json) {
    return { ok: true, data: result };
  }
  console.log(project_id);
  return { ok: true, data: result };
}