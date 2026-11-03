# OpenWiki Capability Brick

Portable documentation discovery, markdown knowledge hub parsing, upstream version comparison, and directory scaffolding without host dependencies.

## Installation & Vendoring

Vendor this brick into any standalone project using Total Recall:

```bash
total-recall plugin vendor openwiki
```

## API Usage

```javascript
import {
  discoverWikiHubs,
  parseWikiHub,
  inspectWikiStaleness,
  bootstrapWikiPages,
  compareSemanticVersions,
  createPropagationPlan,
  formatPropagationReceipt
} from './capability/index.mjs';

// 1. Discover all documentation hubs in a project
const hubs = discoverWikiHubs({ root: process.cwd() });
console.log(`Discovered ${hubs.length} hubs`);

// 2. Parse a hub document
const hubData = parseWikiHub('# Architecture\n\nSystem overview [Details](details.md)');
console.log(hubData.title); // "Architecture"

// 3. Inspect directory staleness
const staleness = inspectWikiStaleness({ root: process.cwd() });
console.log(staleness.isStale);

// 4. Compare version strings
const comparison = compareSemanticVersions('0.7.3', '0.7.2');
console.log(comparison > 0); // true

// 5. Build propagation plan across registered repositories
const plan = createPropagationPlan({
  projects: [{ name: 'api', root: '/repos/api' }],
  latestVersion: '0.7.3',
  currentVersion: '0.7.2'
});
console.log(plan.updateRequired); // true

// 6. Bootstrap wiki skeleton
const result = bootstrapWikiPages({
  targetDirectory: './openwiki',
  templates: {
    'README.md': '# Project Knowledge Base\n'
  },
  dryRun: false
});
```

## Invariants

- Zero Total Recall runtime dependencies
- Zero network requests
- Pure filesystem and text operations
