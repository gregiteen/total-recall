### Running Tests

> **IMPORTANT**: The full suite runs ONLY on the Mac Mini — never on a laptop or the cloud droplet. A single spec file may run on any mesh node.

```bash
# Run specific test file
npx vitest run src/core/surface.spec.mjs

# Run tests matching a pattern
npx vitest run --grep "deduplication"

# Run all backend tests
npx vitest run src/

# Run all frontend tests
npx vitest run frontend/
```

