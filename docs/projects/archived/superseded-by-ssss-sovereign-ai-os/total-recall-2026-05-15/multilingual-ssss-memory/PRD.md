# Product Requirements Document: Multilingual SSSS Semantic Action Space

- **Project**: Total Recall open-source SSSS memory system
- **Status**: Draft
- **Owner**: Total Recall
- **Last Updated**: 2026-05-15
- **Phase**: Discovery
- **Priority**: P0 for public open-source positioning

## 1. Executive Summary

Total Recall should become a fully multilingual, open-source SSSS memory system where users can create, translate, rate, and reuse memory workflows across languages without losing provenance, semantic precision, or executable intent.

The deeper thesis is not that Total Recall needs to bolt translation onto an English system. **The models we use are already multilingual. SSSS is the shared latent space of available actions and meanings across those languages.** Natural language is the interface; SSSS is the semantic action layer. A user may say "follow up after the demo," "haz seguimiento despues de la demo," or "デモ後にフォローアップして"; the system should resolve those utterances into the same structured space of actions, constraints, tools, memories, and workflow meanings.

The transparent translation layer is still required, but it is not the core intelligence. It is the audit layer. It preserves original text, records how each localized artifact was produced, and gives reviewers a way to rate whether localized wording preserves the same SSSS meaning. A cross-language rating system then surfaces the best workflows globally, even when the original workflow was authored in a different language.

The near-term unlock is the **Gemma 4B-A + SSSS LoRA runtime**. This model is not positioned as a general chatbot. It is the local semantic compiler: cheap, fast, multilingual, and trained to map user language, workflow bodies, tool descriptions, memory nodes, and ratings into SSSS action signatures. That is the secret sauce: a small local model with a narrow, high-leverage job.

This turns Total Recall from an English-first memory vault into a global workflow commons: a Spanish-speaking founder, Japanese developer, Arabic-speaking operations team, and English-speaking researcher should all be able to discover the same high-quality workflow, inspect its provenance, and adapt it safely.

## 1.1 Core Thesis

SSSS is an **interlingua for agentic action**:

- Natural languages express intent.
- Multilingual models map that intent into shared latent representations.
- SSSS externalizes the important part of that latent representation as inspectable Markdown and YAML.
- Workflows, memories, rules, and skills become portable meaning objects rather than English text blobs.

This means multilingual support is not a separate mode. It is a property of the action system. Translation helps humans read, review, and trust artifacts; SSSS helps agents execute the same meaning consistently.

## 1.2 Conceptual Model

| Layer | Role | Example |
|---|---|---|
| Natural language | Human expression in any language | "Send a follow-up tomorrow if they did not reply." |
| Multilingual model latent space | Model-internal meaning representation | Intent: delayed conditional outreach. |
| SSSS semantic action space | Externalized, auditable meaning | `predicate: send_follow_up`, `condition: no_reply`, `delay: P1D`. |
| Localized Markdown body | Human-readable workflow instructions | Spanish, Japanese, Arabic, English, etc. |
| Translation ledger | Audit trail for human-facing language | Source hash, model, reviewer, fidelity score. |

## 1.3 Terminology Decision

This project should avoid describing the core system as "translation" alone. Translation is only one surface-level operation.

| Term | Meaning |
|---|---|
| **Semantic compilation** | Mapping a user utterance in any language into an SSSS action signature. |
| **Localization** | Rendering the human-readable Markdown body naturally for a target language or region. |
| **Translation ledger** | The audit trail for localized text, including source hash, model, reviewer, and deltas. |
| **Action-signature match** | A score indicating whether a localized artifact preserves the same executable SSSS meaning. |
| **Cross-language workflow discovery** | Finding the best workflow by meaning, not by the language of its title or body. |

## 1.4 Secret Sauce: One Semantic Router Endpoint

Total Recall should expose one primary semantic ingress endpoint. The endpoint does not mean one giant implementation file. It means one stable contract: **send the system any user utterance, event, workflow body, memory candidate, tool result, or localization request; receive an SSSS action signature, route decision, confidence, and result.**

```http
POST /v1/semantic
```

```json
{
  "input": {
    "modality": "text",
    "content": "Haz seguimiento manana si no respondieron despues de la demo.",
    "locale": "auto"
  },
  "mode": "auto",
  "context": {
    "workspace": "default",
    "risk_tolerance": "normal"
  },
  "dry_run": false
}
```

```json
{
  "action_signature": {
    "domain": "sales",
    "intent": "follow_up_after_demo",
    "predicate": "send_follow_up",
    "object": "prospect",
    "constraints": {
      "condition": "no_reply",
      "delay": "P1D"
    },
    "tools": ["email.send", "crm.update"],
    "risk": "medium"
  },
  "route": {
    "kind": "workflow.run",
    "target": "workflows/follow-up-after-demo/WORKFLOW.md"
  },
  "confidence": 0.91,
  "requires_review": false,
  "result": {
    "status": "queued"
  }
}
```

The endpoint can route to chat, memory search, memory write, workflow execution, tool execution, translation/localization, rating, or escalation. The caller should not need to know which subsystem applies. That routing decision is exactly what the SSSS LoRA is trained to produce.

## 2. Problem

Open-source agent memory systems usually fragment by language:

- Good workflows written in one language are invisible to users searching or speaking in another.
- Translations are opaque, so users cannot tell whether a workflow was human-authored, model-localized, reviewed, or degraded.
- Ratings do not travel well across languages because popularity in English can drown out better workflows written elsewhere.
- Semantic schemas often mix machine fields and natural-language fields, making multilingual support brittle.
- Agents can mistranslate instructions, policies, or workflow steps without leaving an audit trail.
- Systems treat translation as string conversion instead of verifying whether the same action meaning survived the conversion.

For Total Recall, this is especially risky because SSSS workflows are executable memory. A low-quality translation is not just bad copy; it can change what an agent does.

## 3. Goals

- Make SSSS memory nodes, skills, workflows, rules, and tasks first-class multilingual artifacts.
- Treat SSSS as the canonical semantic action space that remains stable across languages.
- Let multilingual models map user intent from any supported language into the same SSSS action schema.
- Use Gemma 4B-A + SSSS LoRA as the local default semantic compiler and router.
- Expose a single semantic-router endpoint that resolves any input into a routeable SSSS action signature.
- Provide a transparent translation ledger for every generated or reviewed translation.
- Allow users to compare original text, translated text, model metadata, confidence, reviewer notes, and back-translation deltas.
- Rank workflows across languages using normalized quality signals, not just raw popularity.
- Make translated workflows discoverable from any supported language query.
- Make semantically equivalent workflows discoverable even when no full human-readable translation exists yet.
- Keep the system database-free: all translation records, ratings, and indexes remain Markdown or rebuildable JSONL derived artifacts.
- Support future LoRA training by producing high-quality multilingual SSSS examples with explicit quality labels.

## 4. Non-Goals

- Do not build a full professional translation management system in the first phase.
- Do not require every workflow to be translated before it can be used.
- Do not hide the source language or pretend machine translations are human-authored.
- Do not store translation truth in Postgres, vector databases, or proprietary binary indexes.
- Do not force English as the user-facing authoring language.
- Do not force English as the canonical semantic layer; canonical fields are symbolic, not English prose.
- Do not use raw star counts as the global ranking signal.
- Do not assume translation is required for semantic search; models can map multilingual queries directly into SSSS fields.

## 5. Target Users

| User | Need |
|---|---|
| Open-source Total Recall user | Install workflows and memory packs in their preferred language. |
| Workflow author | Publish one canonical workflow and let the system translate it transparently. |
| Reviewer / maintainer | Compare translations, flag drift, and approve locale-specific variants. |
| Agent developer | Retrieve semantically equivalent workflows across languages for a task. |
| LoRA trainer | Harvest multilingual examples with labels for fidelity, usefulness, and safety. |

## 6. Product Principles

1. **SSSS is the action meaning layer.** It encodes what the system can do, what constraints apply, and what state changes are intended.
2. **Original text is never discarded.** Every translation must point back to a source artifact and source hash.
3. **Semantic fields remain language-neutral.** Fields such as `type`, `slug`, `modality`, `subject`, `predicate`, and `object` stay canonical and machine-readable.
4. **Human text can be multilingual.** Titles, descriptions, bodies, examples, comments, and reviewer notes may exist in any locale.
5. **Translation is auditable.** Users can see who or what localized a workflow, when, with what model, and with what confidence.
6. **Semantic equivalence matters more than literal equivalence.** A good localization may change phrasing, idiom, and examples while preserving the same SSSS action graph.
7. **Ratings are normalized across language communities.** A small but excellent Polish workflow should not be buried under a mediocre English workflow with more installs.
8. **Indexes are disposable.** Search and ranking indexes can be rebuilt from Markdown source files at any time.

## 7. Scope

### In Scope

- SSSS schema extensions for locale metadata.
- SSSS schema extensions for cross-language action signatures.
- Gemma 4B-A + SSSS LoRA runtime configuration as the default local semantic compiler.
- One semantic-router endpoint contract for chat, memory, workflows, tools, translation, ratings, and escalation.
- `type: translation` records stored as Markdown.
- `type: workflow_rating` records stored as Markdown.
- Rebuildable translation and rating indexes in `.agent/memory-derived/`.
- Dashboard UI for translation config and review.
- CLI commands for translation review, rating import/export, and index rebuild.
- Search behavior that maps multilingual queries into canonical SSSS action signatures, language aliases, and translated titles.
- Rating algorithm that combines quality, semantic fidelity, safety, usage, freshness, and locale coverage.
- Dataset hooks for future Gemma 4 SSSS LoRA multilingual fine-tuning.

### Out of Scope For Phase 1

- Payment or marketplace payout mechanics.
- Human translator assignment workflows.
- Legal localization certification.
- Fully automated deletion of low-rated translations.
- Mandatory cloud translation providers.

## 8. Functional Requirements

### FR0: SSSS Semantic Action Signatures

Each executable or reusable artifact should expose a language-neutral action signature. The signature is the bridge between multilingual model understanding and deterministic workflow discovery.

```yaml
action_signature:
  domain: sales
  intent: follow_up_after_demo
  subject: assistant
  predicate: send_follow_up
  object: prospect
  constraints:
    condition: no_reply
    delay: P1D
  tools: [email.send, crm.update]
  risk: medium
```

Acceptance criteria:

- [ ] A workflow can be discovered by action signature even if the query language differs from the workflow body language.
- [ ] Action signatures use symbolic predicates and constraints, not user-facing prose.
- [ ] Equivalent localized workflows resolve to the same or compatible action signature.
- [ ] Ratings can score whether a localized artifact preserves the original action signature.

### FR0.1: Gemma 4B-A + SSSS LoRA Runtime

The local model should be treated as a specialized semantic compiler, not as a generic assistant persona. Its primary output is structured SSSS routing data.

Acceptance criteria:

- [ ] The runtime can be configured as `gemma4b-a-ssss-lora` or equivalent deployment alias.
- [ ] The model produces valid SSSS action signatures for multilingual inputs.
- [ ] The model returns confidence and uncertainty reasons with every route decision.
- [ ] Low-confidence, high-risk, or action-drifting outputs escalate to the configured frontier judge.
- [ ] The same model can compile user utterances, workflow bodies, memory candidates, and localization records into comparable signatures.

### FR0.2: One Semantic Router Endpoint

Total Recall must expose one primary semantic endpoint that routes all high-level user and agent requests through the SSSS action layer.

```http
POST /v1/semantic
```

Required route kinds:

| Route kind | Meaning |
|---|---|
| `chat` | Respond conversationally after memory/context retrieval. |
| `memory.search` | Retrieve relevant SSSS memory nodes. |
| `memory.write` | Create or update a memory node. |
| `workflow.run` | Execute or queue a workflow. |
| `tool.call` | Call an available tool directly or through a workflow. |
| `localize` | Produce or revise localized Markdown body text. |
| `rate` | Write or update a workflow rating. |
| `escalate` | Send the request to a frontier model or human review path. |

Acceptance criteria:

- [ ] A caller can send natural language in any supported language to `/v1/semantic` and receive a route decision.
- [ ] The endpoint returns action signature, route kind, target artifact, confidence, and review requirement.
- [ ] The endpoint supports `dry_run` so clients can inspect route decisions without executing actions.
- [ ] Subsystems remain modular behind the router; the one-endpoint contract does not force one monolithic handler.
- [ ] Existing specialized endpoints may remain as internal or compatibility wrappers, but new external workflows should prefer `/v1/semantic`.

### FR1: Locale-Aware SSSS Frontmatter

Every SSSS primitive may include optional locale metadata:

```yaml
language: es
locale: es-MX
semantic_layer: ssss
source_language: en
canonical_action_signature: follow_up_after_demo.v1
supported_locales: [en, es-MX, fr, ja]
i18n:
  original_slug: follow-up-after-demo
  original_locale: en
  translation_status: reviewed
  last_translation_at: 2026-05-15T18:00:00Z
```

Acceptance criteria:

- [ ] Existing SSSS files without locale metadata remain valid.
- [ ] Locale metadata is preserved on read/write.
- [ ] Validation warns, but does not block, unknown locale tags.
- [ ] Canonical semantic fields and action signatures remain stable across translations.

### FR2: Transparent Translation Records

Each localization or translation must be represented as its own Markdown artifact:

```markdown
---
type: translation
translation_id: tr_20260515_001
source_path: workflows/follow-up-after-demo/WORKFLOW.md
source_sha256: "..."
source_locale: en
target_locale: es-MX
translator:
  type: model
  name: gemma4b-a-ssss-lora
  version: v1
status: draft
semantic_fidelity: 0.91
action_signature_match: 0.96
backtranslation_delta: 0.08
reviewed_by: null
reviewed_at: null
schema_version: 1
---

## Source Excerpt
...

## Translation
...

## Notes
...
```

Acceptance criteria:

- [ ] Translation records always include source path, source hash, source locale, and target locale.
- [ ] Model-generated localizations identify the model and adapter version.
- [ ] Human-reviewed translations record reviewer and timestamp.
- [ ] Users can inspect translation diff, back-translation summary, and action-signature drift.

### FR3: Translation Ledger

The system must maintain a transparent ledger under:

```text
.agent/translations/
├── workflows/
├── skills/
├── memory/
└── reviews/
```

Acceptance criteria:

- [ ] Every translation event writes a ledger record.
- [ ] The ledger is append-friendly and Git-versionable.
- [ ] A deleted translation leaves an archived ledger trail.
- [ ] Derived indexes can be rebuilt from ledger records.

### FR4: Cross-Language Workflow Ratings

Ratings must be stored as Markdown records:

```markdown
---
type: workflow_rating
workflow_slug: follow-up-after-demo
locale: es-MX
rating_id: wr_20260515_001
reviewer_type: human
semantic_fidelity: 5
usefulness: 5
safety: 4
clarity: 4
localization_quality: 5
executed_successfully: true
created: 2026-05-15T18:10:00Z
schema_version: 1
---

This translation preserves the original sales follow-up logic and adapts the tone naturally for Mexican Spanish.
```

Acceptance criteria:

- [ ] Ratings are tied to workflow slug and locale.
- [ ] Ratings separate semantic fidelity from general usefulness.
- [ ] Ratings include execution outcome when available.
- [ ] Ratings can be written by humans, agents, and eval harnesses, with reviewer type preserved.

### FR5: Global Workflow Score

The ranking system must calculate a normalized score:

```text
global_score =
  0.25 * action_signature_match
+ 0.18 * semantic_fidelity
+ 0.18 * usefulness
+ 0.14 * execution_success_rate
+ 0.10 * safety
+ 0.05 * localization_quality
+ 0.05 * freshness
+ 0.05 * locale_coverage
```

Acceptance criteria:

- [ ] Scores are computed from source Markdown and rating records.
- [ ] Locale communities are normalized to reduce English-language dominance.
- [ ] Low action-signature match caps the maximum global score, even if usefulness is high.
- [ ] Safety regressions reduce rank immediately.
- [ ] Users can filter by locale, source language, reviewed status, and score dimension.

### FR6: Multilingual Search

Search must match workflows by canonical action signatures, semantic fields, and translated human-facing fields.

Acceptance criteria:

- [ ] A Spanish query can find an English-authored workflow even before a Spanish translation exists, if the query maps to the same action signature.
- [ ] A Japanese query can find a workflow whose canonical semantic predicate matches the intent.
- [ ] Search results show source language, available translations, review status, and global score.
- [ ] Search can prefer reviewed translations over draft machine translations.

### FR7: Dashboard UI

The dashboard must expose translation configuration and review workflows.

Acceptance criteria:

- [ ] Settings includes a `translation.yml` editor.
- [ ] Workflow detail view shows available locales and translation status.
- [ ] Translation review view shows original, translated, back-translation delta, and rating controls.
- [ ] Workflow discovery view can sort by global score and filter by language.

### FR8: CLI Parity

Every UI translation action must have CLI parity.

Proposed commands:

```bash
total-recall translate workflows/follow-up-after-demo --to es-MX
total-recall translations list --status draft
total-recall translations review tr_20260515_001 --approve
total-recall rate workflow follow-up-after-demo --locale es-MX
total-recall rebuild-ratings
```

Acceptance criteria:

- [ ] CLI can create translation records.
- [ ] CLI can approve, reject, or request revision.
- [ ] CLI can write rating records.
- [ ] CLI can rebuild translation and rating indexes.

### FR9: LoRA Dataset Hooks

The translation/rating layer and action-signature layer must produce training-ready examples for multilingual SSSS LoRA improvement.

Acceptance criteria:

- [ ] Approved translations can be exported to JSONL.
- [ ] Export includes locale, source language, target language, fidelity score, and reviewer type.
- [ ] Failed or rejected translations can be exported as negative examples.
- [ ] Dataset export preserves the distinction between semantic YAML fields and localized Markdown body.
- [ ] Dataset export includes multilingual user utterances mapped to the same canonical action signature.

## 9. Non-Functional Requirements

- **Transparency**: Every translation and rating must be inspectable as plain text.
- **Multilingual-native**: The architecture assumes local and frontier models can understand multiple languages; the system uses SSSS to stabilize action meaning, not to compensate for monolingual models.
- **Single semantic ingress**: External clients should be able to integrate through one stable endpoint and let SSSS route by meaning.
- **Small-model leverage**: Gemma 4B-A + SSSS LoRA should handle routine semantic compilation locally; frontier models are reserved for uncertainty, review, and high-stakes reasoning.
- **Portability**: A vault copied to another machine carries its translation history and ratings.
- **Safety**: High-risk workflows require reviewed translations before default surfacing.
- **Performance**: Derived search/rating indexes must rebuild from 10,000 workflows in under 60 seconds on a modest local machine.
- **Offline-first**: Core translation review and rating features must work without cloud dependencies once translations exist.
- **Provider-neutral**: Translation models may be local, frontier, or human; schema cannot assume one vendor.

## 10. Proposed File Layout

```text
.agent/
├── translations/
│   ├── workflows/<workflow-slug>/<locale>/<translation-id>.md
│   ├── skills/<skill-slug>/<locale>/<translation-id>.md
│   ├── memory/<memory-slug>/<locale>/<translation-id>.md
│   └── reviews/<yyyy>/<mm>/<rating-id>.md
├── memory-derived/
│   ├── translation-index.jsonl
│   ├── workflow-ratings.jsonl
│   ├── action-signatures.jsonl
│   └── multilingual-search-aliases.jsonl
└── config/
    └── translation.yml
```

## 11. Suggested `translation.yml`

```yaml
translation:
  enabled: true
  default_locale: auto
  canonical_semantic_layer: ssss
  preserve_original: true
  require_review_for_high_risk: true
  treat_ssss_as_action_interlingua: true

models:
  multilingual_native: true
  local: gemma4b-a-ssss-lora
  fallback: frontier

semantic_router:
  endpoint: /v1/semantic
  default_mode: auto
  local_model: gemma4b-a-ssss-lora
  confidence_threshold: 0.72
  dry_run_supported: true
  route_kinds:
    - chat
    - memory.search
    - memory.write
    - workflow.run
    - tool.call
    - localize
    - rate
    - escalate

ledger:
  dir: .agent/translations
  write_backtranslation: true
  write_diff_summary: true
  write_action_signature_delta: true

ratings:
  enabled: true
  normalize_by_locale: true
  minimum_reviews_for_global_rank: 3
  dimensions:
    action_signature_match: 0.25
    semantic_fidelity: 0.18
    usefulness: 0.18
    execution_success_rate: 0.14
    safety: 0.10
    localization_quality: 0.05
    freshness: 0.05
    locale_coverage: 0.05
```

## 12. Beta / Open-Source Trust Criteria

This project is ready for public open-source promotion when:

- [ ] A contributor can read the PRD and understand how multilingual memory works without a call.
- [ ] A maintainer can inspect every translation and rating as Markdown.
- [ ] A non-English query can find a high-quality workflow authored in another language through its action signature.
- [ ] A client can use `/v1/semantic` for chat, memory, workflow, localization, and rating requests without learning subsystem-specific APIs.
- [ ] Gemma 4B-A + SSSS LoRA can compile routine multilingual requests locally with measurable confidence.
- [ ] A low-fidelity translation cannot outrank a reviewed high-fidelity translation.
- [ ] A localization with action-signature drift cannot outrank one that preserves executable meaning.
- [ ] At least 5 languages have reviewed workflow examples.
- [ ] The dashboard and CLI expose equivalent translation/rating controls.

## 13. Test Path

1. Create one canonical workflow in English.
2. Add a canonical action signature for that workflow.
3. Send English, Spanish, Japanese, Arabic, and Portuguese utterances to `/v1/semantic`.
4. Confirm Gemma 4B-A + SSSS LoRA maps all five utterances to the same action signature.
5. Generate translations for Spanish, French, Japanese, Arabic, and Portuguese.
6. Confirm each translation writes a `type: translation` record with model metadata and source hash.
7. Run back-translation and action-signature comparison; confirm both deltas are recorded.
8. Rate each translated workflow with separate action-signature match, semantic fidelity, and usefulness scores.
9. Rebuild derived indexes.
10. Search for the workflow using queries in all five target languages before and after full human-readable translations exist.
11. Confirm global ranking favors reviewed high-fidelity translations with high action-signature match.
12. Reject one intentionally bad translation and confirm it is not surfaced by default.
13. Export approved translations to LoRA JSONL and verify language metadata plus action signatures are preserved.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Localization changes executable workflow meaning | Require fidelity scoring, back-translation delta, action-signature comparison, and reviewed status for high-risk workflows. |
| Model understands the language but maps intent to the wrong action | Compare localized artifacts against the canonical action signature and cap ranking on drift. |
| One endpoint becomes a monolith | Keep `/v1/semantic` as a contract and dispatch to modular handlers behind it. |
| Small local model overroutes with false confidence | Require confidence calibration, uncertainty reasons, dry-run inspection, and frontier escalation thresholds. |
| English workflows dominate rankings | Normalize scores by locale and include locale coverage as a separate dimension. |
| Rating spam | Preserve reviewer type, source, and provenance; weight trusted maintainers and successful executions more heavily. |
| Schema bloat | Keep locale fields optional and place detailed translation metadata in separate `type: translation` records. |
| LoRA overfits translation style | Keep rejected translations and low-fidelity outputs as negative eval examples. |

## 15. Open Questions

- Which first five languages should be required for the public demo corpus?
- Should workflow authors be able to opt out of machine translation?
- What threshold makes a workflow "high risk" and therefore review-gated?
- Should locale-specific forks share one global slug or use locale-qualified slugs?
- Should cross-language ratings be signed for verified maintainers?
- Should action signatures be hand-authored first, model-inferred first, or both with reviewer reconciliation?
