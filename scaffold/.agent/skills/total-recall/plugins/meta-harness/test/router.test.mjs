import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectQuotas, getBenchmarks, routeTask } from '../src/router.mjs';

test('inspectQuotas returns honest system memory and never fabricates subscription percentages', async () => {
  const result = await inspectQuotas({ openRouterKey: '' });
  assert.equal(result.ok, true);
  assert.ok(result.quotas.system.totalMemGB > 0);
  assert.ok(result.quotas.system.freeMemGB >= 0);
  // Subscription runners report null percentages when no local telemetry file is present (never fake numbers)
  assert.equal(result.quotas.agy.billingModel, 'subscription');
  assert.equal(result.quotas.agy.rolling5hRemainingPercent, null);
  assert.equal(result.quotas.ollama.costUSD, 0);
  assert.equal(result.quotas.metered.status, 'unconfigured');
});

test('getBenchmarks combines external benchmarks with local pass rates', () => {
  const result = getBenchmarks({
    ledger: [
      { harness: 'agy', success: true, durationMs: 400 },
      { harness: 'agy', success: true, durationMs: 600 }
    ]
  });
  assert.equal(result.ok, true);
  assert.ok(result.matrix.agy.sweBenchPro > 60);
  assert.equal(result.matrix.agy.localRuns, 2);
  assert.equal(result.matrix.agy.localPassRatePercent, 100);
  assert.ok(result.matrix.claude.terminalBench2 > 70);
  assert.ok(result.matrix.aider.costPer1kTokens < 0.01);
});

test('routeTask evaluates complexity and recommends optimal harness from available pool', async () => {
  const route = await routeTask('Refactor encryption and authentication layer', {
    availableHarnesses: ['claude', 'agy', 'ollama']
  });
  assert.equal(route.ok, true);
  assert.equal(route.tier, 'frontier');
  assert.ok(['claude', 'agy'].includes(route.selected));
  assert.ok(route.candidates.length === 3);
  assert.ok(route.quotaSnapshot.freeMemGB >= 0);
});
