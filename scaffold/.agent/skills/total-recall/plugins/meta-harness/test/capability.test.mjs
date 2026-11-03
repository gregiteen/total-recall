import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMetaHarness,
  ADAPTER_CATALOG,
  validateAdapterManifest,
  classifyTaskComplexity,
  selectOptimalHarness,
  buildBootstrapEnvelope,
  evaluateGateCascade,
  computeEmpiricalScorecard
} from '../capability/index.mjs';

test('capability brick exports all pure functions', () => {
  assert.equal(typeof createMetaHarness, 'function');
  assert.equal(typeof classifyTaskComplexity, 'function');
  assert.equal(typeof selectOptimalHarness, 'function');
  assert.equal(typeof evaluateGateCascade, 'function');
  assert.equal(typeof computeEmpiricalScorecard, 'function');
  assert.ok(ADAPTER_CATALOG.agy);
  assert.ok(ADAPTER_CATALOG.claude);
  assert.ok(ADAPTER_CATALOG.ollama);
});

test('classifyTaskComplexity ranks architectural refactor as frontier', () => {
  const result = classifyTaskComplexity('Refactor authentication system to WebAuthn and passkeys across all repos');
  assert.equal(result.tier, 'frontier');
  assert.ok(result.score >= 70);
  assert.ok(result.isFrontierRecommended);
});

test('classifyTaskComplexity ranks doc typo as local/budget', () => {
  const result = classifyTaskComplexity('Fix typo in README docstring');
  assert.equal(result.tier, 'local');
  assert.ok(result.score <= 35);
  assert.ok(result.isLocalRecommended);
});

test('selectOptimalHarness selects frontier model for high complexity', () => {
  const result = selectOptimalHarness('Architect new multi-agent security framework');
  assert.ok(['agy', 'claude', 'codex', 'openhands'].includes(result.selected));
});

test('selectOptimalHarness selects local zero-cost model for simple task', () => {
  const result = selectOptimalHarness('Fix typo in comment', ['ollama', 'agy', 'dsh']);
  assert.equal(result.selected, 'ollama');
});

test('evaluateGateCascade escalates failed local run to budget/frontier from available pool', () => {
  const cascade = evaluateGateCascade('ollama', { testsPassed: false, linterPassed: true, typecheckPassed: true }, ['ollama', 'aider', 'claude']);
  assert.equal(cascade.escalationRequired, true);
  assert.equal(cascade.recommendedHarness, 'aider');

  // Escalate from frontier to a distinct model family
  const crossFamily = evaluateGateCascade('claude', { testsPassed: false }, ['claude', 'agy', 'codex']);
  assert.equal(crossFamily.escalationRequired, true);
  assert.ok(['agy', 'codex'].includes(crossFamily.recommendedHarness));
});

test('computeEmpiricalScorecard aggregates run success rates', () => {
  const runs = [
    { harness: 'agy', success: true, durationMs: 1200 },
    { harness: 'agy', success: true, durationMs: 800 },
    { harness: 'dsh', success: false, durationMs: 500 }
  ];
  const scorecard = computeEmpiricalScorecard(runs);
  assert.equal(scorecard.agy.total, 2);
  assert.equal(scorecard.agy.passRate, 100);
  assert.equal(scorecard.dsh.total, 1);
  assert.equal(scorecard.dsh.passRate, 0);
});

test('validateAdapterManifest validates custom schema', () => {
  const valid = validateAdapterManifest({ name: 'Custom Runner', bin: 'custom', costScore: 4, qualityScore: 8 });
  assert.equal(valid.valid, true);

  const invalid = validateAdapterManifest({ name: 123 });
  assert.equal(invalid.valid, false);
});
