## Bundles and Portability

Every document primitive resolves to one portability class:

- `structural` — reusable model shipped in templates and sale bundles.
- `tenant_private` — operator/customer runtime data; excluded from template and
  sale exports.
- `resource_bound` — exported only as a requirement declaration; never leak the
  seller's bound resource value.

Bundle paths must be unique, safe, and symlink-free. Validate content hashes,
required extensions, primitive inventory, core version, parameters, and link
integrity before import. Preflight the complete plan before the first commit so a
late invalid envelope cannot leave a partial install. Provisioning produces
deterministic Operation Contract envelopes; re-import must be a no-op.

