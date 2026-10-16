## Establish Ground Truth First

Do not infer the contract from an installed skill snapshot.

1. Find the repository root and inspect `package.json`, `VERSION`,
   `registry/core.json`, and `docs/ssss-spec.md` when they exist.
2. Treat `registry/core.json` as the machine-readable primitive contract and
   `docs/ssss-spec.md` as the normative explanation.
3. Treat `src/engine.mjs`, `src/runtime.mjs`, `src/semantic.mjs`,
   `src/bundle.mjs`, `src/registry.mjs`, and `src/frontmatter.mjs` as the
   reference behavior.
4. Treat host schemas and services as adapters or extension registries. Never
   promote host-only fields into the core standard without an explicit spec and
   registry change.
5. Read the current package name and version instead of hard-coding an alias.
   The CLI binary is `ssss`; the package identity must come from live metadata.

If those files are absent, resolve the installed package that provides the
`ssss` binary and inspect its exported `registry/core.json`. Use the bundled
reference only as a fallback and report that the result is snapshot-based.

