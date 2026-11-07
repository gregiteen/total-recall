#!/usr/bin/env node
/**
 * Publish from a real checkout. In a linked worktree `.git` is a file, npm cannot read the commit,
 * and the release goes out with no gitHead. A source checkout then cannot follow it, because
 * `updateSourceBrainPackage` refuses a release with no verified commit, and a published version
 * can never be corrected. To publish a frozen tree, use `git clone`, which has a real `.git`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function publishSourceProblem(root, { stat = fs.statSync } = {}) {
  let entry;
  try { entry = stat(path.join(root, '.git')); } catch { return 'There is no .git here, so the release would record no source commit.'; }
  if (entry.isDirectory()) return null;
  return 'This is a linked git worktree, so npm would record no gitHead. Publish from a real checkout or a git clone.';
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const problem = publishSourceProblem(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if (problem) {
    console.error(`❌ ${problem}`);
    process.exit(1);
  }
}
