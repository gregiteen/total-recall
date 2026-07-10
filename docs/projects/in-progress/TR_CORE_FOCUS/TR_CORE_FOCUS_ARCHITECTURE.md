---
type: project_document
title: TR_CORE_FOCUS — Architecture
tags: ["project-management", "TR_CORE_FOCUS"]
timestamp: 2026-07-10T00:00:00Z
---

# TR_CORE_FOCUS — Architecture

## Target layout (conceptual)

```text
~/.agent/total-recall/                 # global brain (portable)
  memory-vault/                        # SSSS nodes
  openwiki/                            # personal knowledge wiki (ships with TR)
  secrets/                             # encrypted secrets store (not vault markdown)
  skills-registry/                     # catalog of user skills + install map
  config/                              # brain.json, budget, providers

<repo>/.agent/total-recall/            # project overlay
  memory-vault/                        # project facts/decisions
  openwiki/                            # auto-scaffolded repo docs
  skills/                              # deployed skills for THIS repo only
  surfaces/                            # compiled inject fragments

<repo>/CLAUDE.md, AGENTS.md, ...       # connect targets (inject blocks only)
```

## Nested skills → modules (not skills)

Today (bloated):

```text
.agent/skills/total-recall/
  SKILL.md                    # keep — only agent skill for operating TR
  skills/tr-ssss/             # REMOVE as skill
  skills/tr-research/         # REMOVE as skill
  skills/tr-skill/            # REMOVE as skill
  skills/tr-cli-agents/       # REMOVE as skill
```

Target:

```text
.agent/skills/total-recall/
  SKILL.md                    # sole skill: how AIs operate Total Recall
  modules/                    # plain docs + scripts — NOT agent skills
    ssss.md + scripts/        # was tr-ssss functionality
    research.md + scripts/    # optional; demoted
    skill-deploy.md + scripts/# was tr-skill
    agents.md + scripts/      # was tr-cli-agents registry helpers
  openwiki/                   # default personal wiki templates
  references/                 # CLI/API compact refs
```

**Rule:** Only `SKILL.md` at the total-recall skill root is an IDE “skill.” Everything else is implementation detail files TR and the skill *read*, not nested skill packages.

## Skill deploy model

1. User skills live in a **registry** (global): id, version, source path, tags.
2. `total-recall skill deploy <id> [--repo .]` copies/adapts into `<repo>/.agent/skills/<id>/` or host convention.
3. **Adapt pass:** rewrite skill description/triggers using project openwiki + detected stack (package.json, etc.).
4. Registry records install location for cross-repo tracking.

## Secrets model

- Separate from memory vault (no secrets in `remember` nodes).
- Encrypted at rest (`secrets.enc` / future libsodium); scopes: global | project | provider.
- Operations: `secret set|get|list|rotate|audit`.
- Cost/usage: attach meter events per provider key (usage log JSONL); dashboard or CLI `usage`.

## Openwiki shipping

- TR package/scaffold always includes `openwiki/` starter pages (architecture, memory, secrets, skills, ide).
- `init` / `connect` ensures openwiki exists globally and per project.
- Optional ingest (`ingest-openwiki`) remains for search indexing into vault *summaries*, not full dump of secrets.

## IDE personalization

Keep `connect` matrix; compile from vault → inject block. Skills deploy is additive to connect, not a replacement.

## Demotion map (current → target)

| Current surface | Target |
|-----------------|--------|
| fact-seeker, dream, research-queue | Optional `modules/` or delete from default install |
| tr-ssss skill | `modules/ssss.*` + use `@ssss/cli` |
| tr-research skill | Optional module or out of core |
| tr-skill skill | `modules/skill-deploy` + registry |
| tr-cli-agents skill | `modules/agents` config only |
| repo-expert mega-skills in hosts | Host openwiki + TR project vault |
| frontend dashboard bloat | Thin secrets/usage/memory viewer later; not OS control plane |
