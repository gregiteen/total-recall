# SSSS — Authoring Principles

**Companion to [`ssss-spec.md`](ssss-spec.md). Binding on authors.**

> The spec defines *what SSSS is*. This file defines *how to write for it well*.
> Read it before authoring any SSSS file, writing any importer/exporter, or
> converting foreign data into SSSS.
>
> Every principle is tagged:
>
> - **`[spec]`** — a normative spec rule, restated for authors. Violating it
>   produces an **invalid file or a rejected operation**. Not negotiable.
> - **`[craft]`** — an authoring recommendation. Violating it produces a file
>   that is *technically valid but degraded* — harder to retrieve, harder to
>   convert, harder to trust. Treat these as near-mandatory.
>
> If a `[craft]` principle and the spec ever appear to conflict, the spec wins.

---

## 0. The Mental Model — Understand SSSS Intrinsically

Before any rule, hold these five facts. An agent that internalizes them writes
correct SSSS without consulting the schema each time.

1. **A vault is a graph of typed primitives, not a folder of files.** The file is
   only the storage medium. What you write is a `memory`, an `assistant`, a
   `run` — a node with a known shape. Decide the `type` *first*; everything else
   follows from it.

2. **Frontmatter is the machine; the body is the mind.** Frontmatter is exact,
   structured, queried, validated. The body is natural-language reasoning for a
   human or agent to read. Two different audiences — never blur them.

3. **Two clocks run at once.** Replace-type documents answer *"what is true
   now?"*. The append-only event log answers *"what happened, in order?"*. Both
   are source-of-truth. Projections answer neither — they are disposable caches.

4. **The control vocabulary is a protocol, not a language.** `type`, `status`,
   `modality`, the primitive names, the enum values — symbolic identifiers, like
   a JSON key or an HTTP verb. *Never* translated. Only natural-language
   *content* carries language.

5. **Every mutation is an envelope.** Agents never touch vault files directly. A
   write is an `operation` / `patch` / `event` submitted to the Operation
   Contract, which validates, de-duplicates, locks, commits, and audits it.
   Writing is therefore safe to retry and always reviewable.

Understand those five and the rest of this document is just precision.

---

## 1. Authoring Principles

### Group A — Type & Schema

#### P1 — Declare the type, always · `[spec]`
Every SSSS file **MUST** open with YAML frontmatter carrying a `type` that
matches a primitive in spec §5. A file with no frontmatter, or missing `type`,
is **not an SSSS file**; on the Operation Contract path it is rejected. Never
submit a write and let the host guess.

#### P2 — Every REQUIRED field, present and non-empty, before submit · `[spec]`
Validation is deterministic (spec §9): a missing or empty REQUIRED field is a
hard `422`. Author the *complete* primitive — check the per-type schema in
§5.4 — before submitting. Use repair feedback to catch genuine mistakes, not as
a first draft.

#### P3 — Never invent required fields; namespace host fields with `x_` · `[spec]`
You **MUST NOT** add required fields beyond the spec. Host-specific fields are
OPTIONAL only and **MUST** be prefixed `x_` (e.g. `x_ultrachat_workspace_tier`).
Reserved keys — `type`, `slug`, `schema_version`, `status`, `feedback`,
`confidence` — **MUST NOT** be repurposed.

### Group B — The Two Regions

#### P4 — Structured signal in frontmatter; reasoning in the body · `[craft]`
Machine-consumed signal (scores, counts, IDs, enums, dates) belongs in
frontmatter. Natural-language reasoning belongs in the body. Do not bury a flag
in a sentence, and do not paste prose into a frontmatter value.

```markdown
# ❌ signal trapped in prose — no consumer can read it
---
type: memory
slug: deploy-after-ci
---
This is an active, fairly important rule (confidence ~0.9).

# ✅ signal in frontmatter, reasoning in body
---
type: memory
slug: deploy-after-ci
category: patterns
title: "Deploy only after CI is green"
status: active
schema_version: 2
confidence: 0.9
importance: 4
modality: must
subject: agent
predicate: deploy_after_ci_pass
object: deploy_pipeline
sentiment_polarity: directive_must
---
A deploy started before the commit's CI run is green risks shipping an
untested artifact. CI is the gate.
```

#### P5 — The control vocabulary is symbolic — never localize it · `[spec]`
Frontmatter **keys** and enumerated **values** **MUST** be the exact identifiers
from the spec, in every vault and every locale.

```yaml
# ❌ keys and enum values translated — breaks every validator and consumer
tipo: memoria
estado: activo
modalidad: debe

# ✅ vocabulary symbolic; only the human-readable content is localized
type: memory
status: active
modality: must
title: "Escribir siempre los archivos de forma atómica"
```

#### P6 — Content MAY be any language; write meaning, not keywords · `[craft]`
`title`, `description`, bodies, and comments **MAY** be authored in any language
(spec §11.2). Write them for *meaning* — the semantic layer matches on meaning,
not shared tokens. Do not keyword-stuff a title to "help search", and do not
machine-translate content to "normalize" it. Clear native-language content is
correct; degraded content is not.

### Group C — Identity & References

#### P7 — Slugs and IDs are stable, unique, language-neutral · `[spec]` / `[craft]`
A `slug` / `thread_id` / `model_id` / `conflict_id` is a permanent join key.
Once published it **MUST NOT** change `[spec]` — other primitives, events, and
projections reference it. Slugs are `kebab-case` and **SHOULD** be
language-neutral concept identifiers, not sentences `[craft]`.

#### P8 — Write self-contained primitives; reference by stable ID · `[craft]`
Each primitive must be interpretable in isolation by an agent that has read no
other file. Do not write "see the other doc" or "as above". Cross-references use
a stable slug / `thread_id` / `model_id` — never positional or relative hints.

#### P9 — Anchor semantics with a stable triple · `[spec]` (when `schema_version: 2`)
For `memory` nodes at `schema_version: 2`, `subject`/`predicate`/`object` are
REQUIRED and **SHOULD** be stable, language-neutral *concept identifiers*, not
localized prose. The triple is the semantic anchor that survives translation,
re-embedding, and format conversion.

```yaml
# ❌ triple is localized prose — not a stable anchor; won't dedupe cross-language
subject: "el agente"
predicate: "debería escribir de forma atómica"

# ✅ triple is symbolic; the localized phrasing lives in `title`
subject: agent
predicate: use_atomic_write
object: file_system
title: "El agente debe escribir los archivos de forma atómica"
```

### Group D — Granularity

#### P10 — One primitive, one concept — keep nodes atomic · `[craft]`
A `memory` states **one** rule, pattern, or fact. An `assistant` defines **one**
persona. Do not pack three unrelated rules into one node to save files. Atomic
primitives are independently retrievable, scorable, conflict-checkable, and
de-duplicable; compound ones are none of those — a single low score or conflict
poisons everything bundled with it.

### Group E — Mutation & History

#### P11 — Mutate only through the Operation Contract · `[spec]`
Agents **MUST NOT** write vault files directly. Every change is an envelope
submitted to the contract, which validates, leases, commits, and audits it.
Direct filesystem writes bypass all of that and are forbidden.

#### P12 — Choose the right envelope · `[craft]`
Pick the envelope that matches your intent — using the wrong one is valid but
wasteful or unsafe.

| Intent | Envelope | Notes |
|--------|----------|-------|
| Create a file, or fully replace one you are rewriting whole | `operation` | Carries full `content`. |
| Change a few frontmatter keys, or append a record to an existing file | `patch` | Carries `patches`; safer — won't clobber fields you didn't touch. |
| Append a turn/step to an append-type doc (`conversation`, `run`) | `patch` | Use the reserved `__body__` key to *append* the body — never re-`operation` the whole transcript. |
| Record that something happened (feedback, audit, spawn, signal) | `event` | `content` is a JSON payload, not SSSS Markdown. Append-only. |

Prefer `patch` over `operation` for edits to a live document: it is lower-risk
under concurrency and keeps Git diffs minimal.

#### P13 — Idempotency keys: one logical write, one stable key · `[spec]` / `[craft]`
Every envelope carries an `idempotency_key` (UUID v4) `[spec]`. Use it correctly
`[craft]`:

- **One logical write = one key.** Generate it *before* the first attempt and
  reuse the *same* key on every retry, so a retry after a crash replays instead
  of duplicating.
- **Distinct writes = distinct keys**, even if the content is byte-identical.
- **Never derive the key from a timestamp** (changes on retry → duplicates) or
  from a content hash alone (two legitimately-distinct writes collide).

#### P14 — Validate before you commit; release what you lease · `[craft]`
When generating a primitive programmatically, submit it with `dry_run: true`
first (spec §6.3): it runs validation without committing and returns the verdict
— treat repair feedback as the spec talking back. For a multi-operation
read-modify-write on one path, acquire a `lease`, present its `lease_id` on every
operation, and **release it the moment the last operation commits** — an
unreleased lease blocks every other agent until it expires.

#### P15 — Respect append-only — never rewrite history · `[spec]`
For `conversation` and `run` (append-type), a write **MUST** only *append* a
record — never rewrite, reorder, or delete an existing turn/step. Event-log
entries are likewise immutable: no UPDATE, no DELETE. If something was wrong,
**append a correction** — never edit the past.

#### P16 — Never author into a projection · `[spec]`
SQL tables, search indexes, embedding indexes, and the event-graph index are
disposable projections (spec §10). Author into the *vault*. State written into a
projection vanishes on the next rebuild.

#### P17 — Record provenance on append-type records · `[craft]`
A `conversation` turn or `run` step **SHOULD** capture which assistant, model,
skills, and memory nodes produced it (spec §11.4). Provenance is what lets a
later quality signal propagate back to the responsible primitives. An outcome
with no provenance is an outcome whose cause can never be found.

#### P18 — Feedback is an event; the rollup is derived · `[spec]`
Raw feedback **MUST** be a `type: event` entry in the append-only log. The
`feedback:` frontmatter block is a *periodic rollup* of those events — never
hand-write raw feedback into frontmatter, and never make a primitive depend on
feedback to function (feedback is an enhancement layer, spec §11.6).

---

## 2. Import Principles — Bringing a Vault In

An importer reconstructs a vault from an external source (another vault, a
backup, a foreign system). Get these wrong and the imported vault is silently
corrupt.

#### I1 — The vault is the unit of import/export · `[spec]`
The portable artifact is a directory tree of Markdown files plus the event log.
There is no proprietary container. Export the **vault**, never a projection — a
projection re-derives from the vault, so exporting it is redundant *and* not
source-of-truth.

#### I2 — Validate every file on import; quarantine, never drop · `[spec]`
Every imported file **MUST** pass the Operation Contract pipeline. An invalid
file **MUST** be quarantined with its repair feedback recorded — never silently
discarded, never silently "fixed". Silent loss is the worst import outcome.

#### I3 — Round-trip fidelity is mandatory · `[spec]` / `[craft]`
`export` then `import` (or the reverse) **MUST** yield semantically identical
primitives: same `type`, same REQUIRED fields, same body, same slugs/IDs, same
append-record order `[spec]`. Importers **SHOULD** also preserve frontmatter key
order and formatting, to keep Git diffs meaningful `[craft]`.

#### I4 — Identifiers are the join graph — preserve them exactly · `[spec]`
Slugs, `thread_id`s, `model_id`s, `event_id`s, `correlation_id`s, and
`caused_by` references **MUST** survive import unchanged. Re-keying orphans every
cross-reference and the event graph. If an ID *must* change (collision), every
inbound reference **MUST** be rewritten in the same transaction.

#### I5 — The event log imports in order, append-only · `[spec]`
Import the event log as an ordered append. Never reorder events; never drop
events to "clean up". The event graph (`caused_by` / `correlation_id` edges) is
reconstructed *from* log order — corrupt the order and the saga trees become
unrecoverable.

#### I6 — Detect conflicts on import — do not blind-overwrite · `[spec]`
If an imported primitive contradicts an existing one, the importer **MUST**
create a `conflict` record (spec §5.4) and block promotion — never silently
overwrite, never silently keep both. Import is a merge, not a clobber.

#### I7 — Rebuild derived artifacts after import; never import them · `[spec]`
Search indexes, embedding indexes, projections, and the event-graph index are
**rebuilt** from the imported vault, not imported. An embedding index is valid
only for the `embedding_model` + `dim` that produced it (spec §11.3) — a fresh
import **REQUIRES** a full reindex.

---

## 3. Semantic Conversion Principles — Foreign Data → SSSS

Conversion turns non-SSSS data (a DB row, a JSON blob, a doc from another tool)
into a conformant SSSS primitive. The goal: **zero information loss** and
**preserved meaning**.

#### C1 — Choose the closest primitive deliberately · `[craft]`
Conversion starts by selecting the `type` whose purpose best matches the source
(spec §5.1): a chat log → `conversation`, a persona config → `assistant`, a
knowledge row → `memory`. If nothing fits, propose a schema change through the
governed path (spec §15) — do **not** invent an off-spec type.

#### C2 — Map fields to their spec home; never force a fit · `[spec]` / `[craft]`
Map each source field to the matching REQUIRED/OPTIONAL spec field. A source
field with no spec equivalent goes into an `x_`-prefixed OPTIONAL field `[spec]`
— never crammed into an unrelated reserved field `[craft]`.

#### C3 — Lose nothing — preserve unmapped data · `[craft]`
Every byte of meaningful source data must survive: structured leftovers into
`x_` fields, unstructured leftovers into the body. If something genuinely cannot
be represented, record what was dropped (e.g. a conversion `event`) — silent
loss is forbidden.

```markdown
# Converting a CRM row → memory. Source:
#   { id: 4192, fact: "Acme prefers email over phone",
#     channel: "email", crm_owner: "rep-17", confidence_pct: 80 }

---
type: memory
slug: acme-prefers-email          # C5: stable, minted ID
category: preferences
title: "Acme prefers email over phone"   # C2: source `fact` → title
status: active
schema_version: 2
confidence: 0.8                   # C2: 80% → 0..1
importance: 3
modality: should
subject: contact_acme             # C6: synthesized semantic anchor
predicate: prefers_channel
object: channel_email
sentiment_polarity: preference
x_source_system: crm              # C3 + C7: unmapped data + origin, namespaced
x_source_id: 4192
x_crm_owner: rep-17
---
Imported from CRM record 4192. Acme's stated channel preference is email.
```

#### C4 — Separate the two layers during conversion · `[craft]`
Structured source data → frontmatter; natural-language source data → body
(see P4). A converter that dumps a whole JSON blob into frontmatter, or flattens
structured fields into prose, produces a file that validates but is unusable.

#### C5 — Preserve language; never machine-translate content · `[craft]`
Convert content in the language it was authored in. The semantic layer is
cross-lingual by design (spec §11.2) — translating during conversion adds no
value and destroys provenance and nuance. Translate the control vocabulary?
Never (P5). Translate the content? Also never.

#### C6 — Synthesize the semantic anchor · `[craft]`
When converting to `memory`, derive a stable, language-neutral
`subject`/`predicate`/`object` triple and the correct `category` (see P9). The
triple is what makes the converted node deduplicable and conflict-checkable
against nodes from any source and any language.

#### C7 — Mint stable identifiers; record the origin · `[craft]`
Assign each converted primitive a stable `slug`/ID (P7) and record where it came
from (`x_source_*` fields or a conversion `event`). Origin provenance lets the
conversion be audited, re-run, and trusted.

#### C8 — Re-embed and re-validate — do not assume · `[spec]`
After conversion, every primitive **MUST** pass deterministic validation, and
the semantic layer **MUST** be re-embedded so converted nodes share one vector
space with native ones. Conversion is done when the file validates *and* is
semantically reachable — not when it is written.

#### C9 — Conversion that touches the schema is a governed change · `[spec]`
Converting a source that needs a *new field or new type* is a schema change. It
**MUST** go through the §15 governed path — proposal → interpret → validate →
review → version → migrate. Conversion never silently widens the contract.

---

## 4. Quick Self-Check Before Any SSSS Write

- [ ] Correct `type` chosen, and every REQUIRED field present and non-empty? (P1, P2)
- [ ] Structured signal in frontmatter, reasoning in the body — not mixed? (P4)
- [ ] All keys/enums the exact symbolic identifiers — nothing localized? (P5)
- [ ] Host-specific fields prefixed `x_`, reserved keys untouched? (P3)
- [ ] `slug`/ID stable, unique, language-neutral? (P7)
- [ ] Primitive stands alone — interpretable with no other file open? (P8)
- [ ] For `memory`: stable `subject`/`predicate`/`object` triple? (P9)
- [ ] One concept per primitive — nothing bundled? (P10)
- [ ] Right envelope for the intent — `patch` for edits/appends? (P12)
- [ ] Stable idempotency key, reused only for *this* logical write? (P13)
- [ ] For append-type: appending only, never rewriting? (P15)
- [ ] Writing to the vault, not a projection? (P16)
- [ ] If converting/importing: nothing lost, identifiers preserved exactly? (I4, C3)

Every box checked ⇒ the write is conformant. Any box unchecked ⇒ fix it before
submitting, not after a `422`.
