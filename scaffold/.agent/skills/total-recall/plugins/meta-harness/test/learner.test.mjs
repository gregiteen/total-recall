import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordRunReceipt, learnFromHistory } from '../src/learner.mjs';

test('recordRunReceipt stores execution receipt in isolated home and learnFromHistory summarizes without side effects', (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'learner-home-'));
  const origHome = process.env.HOME;
  process.env.HOME = tmpHome;
  t.after(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  const receipt = {
    harness: 'agy',
    task: 'Test task execution',
    complexityScore: 65,
    success: true,
    durationMs: 450
  };

  const recResult = recordRunReceipt(receipt);
  assert.equal(recResult.ok, true);
  assert.ok(recResult.totalRuns > 0);

  const learnResult = learnFromHistory();
  assert.equal(learnResult.ok, true);
  assert.ok(learnResult.totalHistoryRuns > 0);
  assert.ok(learnResult.scorecard.agy);
  assert.ok(Array.isArray(learnResult.proposals));
});
