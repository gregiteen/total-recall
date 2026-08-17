# Recurring fixes

Mechanical recipes for findings that show up repeatedly. Apply the narrow fix,
never the broad cast — and never a suppression comment.

## TypeScript

| Code | Meaning | Fix |
|:---|:---|:---|
| `TS6133` | Declared but never read | Delete it. If it is a required signature param, prefix `_`. **Never** `@ts-ignore`. |
| `TS2532` / `TS18048` | Possibly undefined | Narrow with a guard (`if (!x) return`) or `?.`. Not `!`. |
| `TS2345` | Argument type mismatch | Fix the source type. A cast at the call site hides the real defect. |
| `TS2739` / `TS2741` | Missing properties | Add the properties, or make them optional in the type if genuinely optional. |
| `TS7006` | Implicit `any` param | Annotate it. Infer from the call site rather than reaching for `any`. |
| `TS2322` | Not assignable | Usually a union that needs narrowing, or a wrong generic argument. |
| `TS4111` | Index-signature access | Use `obj['key']`, or give the type a real property. |

**Optional properties under `exactOptionalPropertyTypes`:** omit the key rather
than passing `undefined`.

```ts
// ✗ const opts = { retries, timeout: timeout ?? undefined }
const opts = { retries, ...(timeout !== undefined && { timeout }) };
```

## ESLint / Biome

- `no-unused-vars` — delete; `_`-prefix only for required signature positions.
- `no-explicit-any` — replace with `unknown` plus a narrowing guard.
- `react-hooks/exhaustive-deps` — add the dep, or hoist the value out of the
  component. Do not disable the rule.
- `i18next/no-literal-string` — extract to `en.json`. Suppressing this is
  banned outright in festech.live.

If a disable is genuinely correct, scope it to **one rule on one line** with a
reason comment. Blanket file-level disables are gated.

## Python

- `F401` unused import — delete.
- `E501` line too long — the repo allows 160; reflow rather than `# noqa`.
- `E203` / `W503` — already ignored in `.flake8`; do not re-add.
- mypy `no-untyped-def` — annotate the signature; avoid `Any` returns.
- Formatting findings from `black --check` are applied with
  `scripts/format.py`, never hand-reflowed.

## SSSS

SSSS findings are **contract violations, not style**. Never resolve one by
loosening a schema or skipping a fixture.

- **Registry validation failure** — an extension collides with a core type, or
  a `required_field` is missing. Fix the primitive definition.
- **Conformance failure** — do not claim conformance from an HTTP 200, a file
  appearing on disk, or a passing typecheck. Only the conformance gate proves it.
- **Envelope errors** — a `type: 'patch'` envelope needs a `patches` object; a
  YAML `content:` block alone is a dead patch that silently no-ops.
- **Idempotency** — keys must be unique per attempt for repeatable writes. A
  constant key per entity makes the second write a silent no-op.
- **VFS-first** — state mutations flow through the SSSS Core Contract. Never
  `db.insert/update/delete`, never a raw `fs.writeFileSync` for application state.

## Working through a large backlog

1. `report.mjs count` — find the biggest bucket.
2. `report.mjs type` — see if one recipe clears many at once.
3. Fix whole files, not scattered lines; re-running has a fixed cost, so
   batching amortizes it.
4. Relaunch the background check, keep fixing from the current report.
5. `report.mjs worst 4`, `worst 8` … to page deeper without re-running.

Files marked `🔄` in the report changed after the run started — their findings
may already be fixed. Don't chase them; they'll be re-evaluated next run.
