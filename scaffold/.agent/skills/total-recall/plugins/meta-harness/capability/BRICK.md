# Meta Harness Capability Brick

A zero-dependency, host-free pure ES module providing universal agent harness discovery, two-stage complexity classification, cost-vs-frontier routing, gate cascade evaluation, and execution envelope construction.

## Why This Brick Exists

Modern software engineering with autonomous AI harnesses suffers from two structural traps:
1. **The Correction Penalty**: Sub-frontier models on complex architectural tasks burn more tokens retrying than frontier models take in a single shot.
2. **Confirmation Bias**: An agent that writes flawed code often passes its own validation review unless evaluated by a separate model family.

This brick encapsulates the core deterministic intelligence needed to route, coordinate, and score agent harnesses without binding your application to any host runtime or secrets store.

## Installation / Vendoring

When vendoring into another repository using Total Recall:
```bash
total-recall plugin vendor meta-harness
```

Or import the capability directly in any standard ES module environment:
```javascript
import {
  createMetaHarness,
  ADAPTER_CATALOG,
  classifyTaskComplexity,
  selectOptimalHarness,
  evaluateGateCascade,
  computeEmpiricalScorecard
} from './capability/index.mjs';
```

## Core API

### `classifyTaskComplexity(taskDescription, options)`
Analyzes instructions for architectural indicators, security keywords, blast radius, and length:
```javascript
const complexity = classifyTaskComplexity("Refactor auth system to WebAuthn with test verification");
// Returns: { score: 95, tier: 'frontier', isFrontierRecommended: true, factors: [...] }
```

### `selectOptimalHarness(taskDescription, availableHarnesses, quotaStatus)`
Computes cost-vs-quality utility across available CLI runners:
```javascript
const selection = selectOptimalHarness("Fix typo in README.md", ['agy', 'dsh', 'ollama']);
// Returns: { selected: 'ollama', complexity: { tier: 'local' }, candidates: [...] }
```

### `evaluateGateCascade(currentHarness, gateResults)`
FrugalGPT gate cascade: keeps cheap models on simple tasks, escalating only upon verified failure:
```javascript
const cascade = evaluateGateCascade('ollama', { testsPassed: false, linterPassed: true });
// Returns: { escalationRequired: true, recommendedHarness: 'dsh', reason: '...' }
```

### `computeEmpiricalScorecard(historyRuns)`
Aggregates pass rates, failure frequencies, and average latencies across runs:
```javascript
const scorecard = computeEmpiricalScorecard(runs);
```
