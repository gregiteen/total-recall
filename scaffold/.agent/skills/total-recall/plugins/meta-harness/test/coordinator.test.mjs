import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { coordinateTask } from '../src/coordinator.mjs';

test('coordinateTask pipeline plans and executes Architect -> Implementer -> Verifier across distinct families', async (t) => {
  const planned = await coordinateTask('Build distributed rate limiter', {
    mode: 'pipeline',
    availableHarnesses: ['claude', 'agy', 'codex']
  });
  assert.equal(planned.ok, true);
  assert.equal(planned.mode, 'pipeline');
  assert.equal(planned.executedLive, false);
  assert.equal(planned.stages.length, 3);
  assert.equal(planned.stages[0].role, 'Architect');
  assert.equal(planned.stages[1].role, 'Implementer');
  assert.equal(planned.stages[2].role, 'Verifier');
  assert.notEqual(planned.stages[1].modelFamily, planned.stages[2].modelFamily);
  assert.equal(planned.heterogeneousFamiliesVerified, true);

  // Also test live execution with a mock dispatch function and temporary workspace
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-home-'));
  t.after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));
  const calls = [];
  const executed = await coordinateTask('Implement token bucket', {
    mode: 'pipeline',
    execute: true,
    cwd: tmpHome,
    availableHarnesses: ['claude', 'agy', 'codex'],
    dispatchFn: async (req) => {
      calls.push(req);
      return { ok: true, response: `Completed stage for ${req.agent}` };
    }
  });
  assert.equal(executed.ok, true);
  assert.equal(executed.executedLive, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].permissions.write, false); // Architect is read-only
  assert.equal(calls[1].permissions.write, true);  // Implementer has write enabled
  assert.equal(calls[2].permissions.write, false); // Verifier is read-only
});

test('coordinateTask council plans and executes consensus across models', async () => {
  const result = await coordinateTask('Evaluate database migration plan', {
    mode: 'council',
    availableHarnesses: ['agy', 'claude', 'codex']
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'council');
  assert.equal(result.consensus, 'planned');
  assert.ok(result.votes.length === 3);
});
