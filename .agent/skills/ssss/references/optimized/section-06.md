## Append, Lease, and Path Safety

- `conversation` and `run` are append-only. Preserve prior bytes and append new
  records; never rewrite or delete them.
- Events are immutable.
- Paths must be relative, contained vault paths. Reject absolute paths,
  backslashes, null bytes, empty segments, `.`/`..`, directory targets, and
  symlink escapes.
- Leases are actor-owned, operation-linked, expiring locks. Missing, mismatched,
  malformed, or unreadable lease state fails closed.
- Hosts must overwrite caller-supplied actor data with verified session identity
  before authorization.

