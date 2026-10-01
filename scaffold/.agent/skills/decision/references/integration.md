# Decision integration

Verified against primary documentation on 2026-10-01. Recheck alpha API contracts before implementation.

## Discover and configure

Use the installed decision plugin's manifest/help to discover supported commands. Its skill is the same `decision` capability; do not install an additional Jev skill. Plugin presence or documentation alone does not prove live dispatch or persistence. Validate the adapter before relying on it.

Reuse the repository's credential and provider configuration. Prefer schema-validated portable defaults and repo-owned config/overlays. Use the existing layered skill contract where supported: plugin-owned `core/config.schema.json`, canonical repo-owned SSSS `skill_config`, disposable `config.json` projection. Do not invent those interfaces where no consumer exists. No personal paths/hosts, credentials or injected memory belong in shipped defaults.

## Jev boundary

OpenRouter documents `POST /api/alpha/decisions` for plain HTTP/OpenRouter SDK calls and `POST /api/v1/systemone` for the TypeSafe SDK format. Confirm the chosen surface's request schema; do not interchange formats blindly. Select the model in configuration and record the actual response version. The separate Jev Router selects chat models/reasoning effort; it does not implement skill selection.

Use Choice for a bounded label set, Noul for probability of yes and Score for an ordered probability-weighted result. Choice and Score expose distributions and confidence; Noul does not expose a separate confidence value. Validate finite ranges, membership and required answer fields; missing confidence never becomes 1. A weighted Score is not a discrete level. Pin the actual adapter contract and fixture responses before wiring gates.

## OpenAI Decisions preview

OpenAI announced a Luna-powered Decisions API on 2026-09-29 for finite predefined answers from text or image context. It is in limited preview; the public endpoint, schema and this account's access are unverified. OpenRouter's `/api/alpha/decisions` currently documents Jev, and its public model catalog did not list OpenAI Decisions on 2026-10-01. Keep OpenAI as a configurable future engine in this one `decision` skill, without guessing a model slug or sending requests through the Jev endpoint. Use the deterministic path until the official contract and actual access are verified. [OpenAI announcement](https://openai.com/index/devday-2026-recap/) · [OpenRouter Jev contract](https://openrouter.ai/docs/guides/community/jev).

## Evidence and fallback

Tune gates with representative labelled cases, including ambiguous input, no matching option, label wording changes and incomplete state. Report false selections, missed selections, abstention, latency and cost. Typed validity does not establish semantic accuracy. Cache by task, catalog/content hashes and configuration/model version; invalidate on relevant changes. Network/configuration/parse failures preserve the deterministic path. Avoid unneeded outbound private data; log no secrets.

Sources: [OpenRouter Jev guide](https://openrouter.ai/docs/guides/community/jev), [TypeSafe confidence](https://docs.typesafe.ai/confidence), [Choice](https://docs.typesafe.ai/primitives/choice), [Score](https://docs.typesafe.ai/primitives/score), [Noul](https://docs.typesafe.ai/primitives/noul).
