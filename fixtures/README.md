# SSSS Conformance Fixtures

These fixtures are the canonical valid and invalid SSSS file examples.
Both Total Recall and UltraChat import this directory to run conformance tests.

## Structure

```
fixtures/
├── valid/              # Files that MUST pass validation
│   ├── memory-node.md
│   ├── conflict-record.md
│   ├── task.md
│   ├── proposal.md
│   ├── schema-proposal.md
│   ├── migration.md
│   ├── release.md
│   └── operation-envelope.json
├── invalid/            # Files that MUST fail validation
│   ├── memory-missing-fields.md
│   ├── memory-bad-schema-version.md
│   ├── conflict-missing-id.md
│   ├── proposal-bad-category.md
│   └── operation-missing-key.json
└── README.md
```

## Usage

```js
import { SSSS_SCHEMAS } from 'total-recall/src/core/schema.mjs';
import matter from 'gray-matter';
import fs from 'fs';

const raw = fs.readFileSync('fixtures/valid/memory-node.md', 'utf8');
const { data } = matter(raw);
const result = SSSS_SCHEMAS[data.type].safeParse(data);
assert(result.success === true);
```
