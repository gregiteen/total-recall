---
name: composable-cli
description: "Total Recall composable CLI plugin: create, compose, register, test and safely run custom verbs; every command listed in the instruction surfaces."
version: 0.2.0
---

# Composable CLI

Total Recall composable CLI plugin: create, compose, register, test and safely run custom verbs.

## Usage

This skill is provided by the `composable-cli` Total Recall capability plugin.

### Composable CLI
```bash
npx total-recall composable-cli status
npx total-recall composable-cli create <name> <code> [--description "..." --risk read|write|money|...]
npx total-recall composable-cli list [--json]
npx total-recall composable-cli show <name> [--json]
npx total-recall composable-cli history <name>
npx total-recall composable-cli upgrade <name>
npx total-recall composable-cli promote <name> --to-plugin <dir>
```

### Commands (via `total-recall`)
```bash
total-recall command create <name> "<code>" [--description "..."] [--risk <class>]
total-recall command list [--json]
total-recall command show <name> [--json]
total-recall command history <name>
total-recall command rollback <name> <version>
```

### v2 Command Contract
Commands export `meta` and a default function:
```js
export const meta = {
  name: 'my-command',
  description: 'Does something useful',
  risk: 'read',
  version: 2,
  background: false,
};

export default async function main(args, { tr, json, dryRun, log }) {
  const id = await tr('project-id', ['--json']);
  return { data: { project: id.data?.project_id } };
}
```

### Risk Classes
| Risk | Default | --yes required |
|------|---------|----------------|
| read, write | runs | no |
| money, dns-cert, production-deploy, secret-revoke | dry-run (exit 3) | yes |

### Composition
```js
import { tr } from 'tr-plugin-composable-cli/src/compose.mjs';
const result = await tr('project-id', ['--json']);
// -> { ok: true, exitCode: 0, data: { project_id: '...' } }
```