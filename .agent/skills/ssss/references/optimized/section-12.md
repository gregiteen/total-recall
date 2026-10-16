## Validation

Validate a Markdown document with the dependency-free skill helper:

```bash
node skills/ssss/scripts/validate-schema.mjs path/to/document.md
```

In the SSSS reference repository, the required gate is:

```bash
npm test
```

It covers registry/engine parity, shipped-skill conformance, Operation Contract
fixtures, workflow runtime behavior, lease/frontmatter regressions,
extension-registry hardening, semantic/localization behavior,
bundle/provisioning round trips, and CLI smoke tests.

For host adapters, run the host's named SSSS conformance command as well. Do not
substitute a loose YAML parse or a generic typecheck for the SSSS gate.

