/** Per-worker isolation must exist before modules initialize config or logging. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const previous = process.env._TR_TEST_AGENT_DIR;
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-suite-brain-'));
process.env._TR_TEST_AGENT_DIR = fixture;
afterAll(() => {
  if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR;
  else process.env._TR_TEST_AGENT_DIR = previous;
  fs.rmSync(fixture, { recursive: true, force: true });
});
