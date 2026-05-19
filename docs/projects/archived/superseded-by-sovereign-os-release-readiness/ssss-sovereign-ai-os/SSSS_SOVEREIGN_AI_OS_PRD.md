# SSSS Sovereign AI OS PRD

- **Plane**: Projects
- **Last Updated**: 2026-05-15
- **Summary**: Canonical Total Recall product definition for SSSS as an open, database-free, sovereign AI substrate and reference runtime.

## Product Thesis

Total Recall is the open-source home of SSSS and the reference implementation of the sovereign AI brain. Its job is to prove that a user's memory, workflows, skills, model routing, scheduler, and learning loop can live as portable SSSS files instead of opaque hosted database state.

UltraChat is the product layer. Total Recall is the protocol, CLI, local runtime, conformance suite, and sovereign optimizer.

## Product Statement

Total Recall provides:

- the canonical SSSS skill/spec
- schema validators and migrations
- a database-free file kernel
- the Dream Cycle background optimizer
- a local model runtime for unlimited private inference
- conformance tests for SSSS-compatible systems
- CLI commands for init, sync, lint, export, import, deploy, and upgrade
- a reference OpenAI-compatible brain endpoint for UltraChat and other clients

## Strategic Role

Total Recall should be open and canonical. SSSS itself is not defended by secrecy. The moat comes from becoming the standard and maintaining the best reference implementation, conformance tests, migration tooling, and product ecosystem through UltraChat.

## Relationship To UltraChat

| Repo | Responsibility |
|---|---|
| `total-recall` | Open SSSS spec, validators, CLI, local brain, Dream Cycle, conformance suite, reference model runtime |
| `ultrachat-ai-powered` | Hosted product UX, collaboration, marketplace, billing, model management UI, projection health, enterprise controls |

The two repos share the same end state: SSSS is canonical, databases are projections, and local sovereign AI continuously optimizes private user/workspace state.

## Core Requirements

- [ ] SSSS skill/spec remains canonical in this repo.
- [ ] SSSS validators are shipped as reusable reference implementation.
- [ ] All generated indexes are disposable and rebuildable.
- [ ] The Dream Cycle stages improvements as reviewable SSSS proposals.
- [ ] The local brain exposes an OpenAI-compatible endpoint.
- [ ] The local brain can be registered as a normal UltraChat model through `MODEL.md`.
- [ ] Conformance tests prove compatibility for SSSS files, operations, projections, and migrations.
- [ ] Protocol updates ship through reviewed schema proposals and migrations.

## What Total Recall Owns

### SSSS Core

- memory nodes
- skills
- tasks
- sessions
- conflicts
- proposals
- schema versions
- migrations
- derived index formats

### Reference Kernel

- read/write SSSS files
- validate frontmatter and bodies
- detect conflicts
- apply safe patches
- compile instructions and skill memory
- rebuild indexes
- export/import vaults

### Sovereign Runtime

- local model serving
- OpenAI-compatible brain endpoint
- local-only privacy defaults
- frontier escalation gates
- background task queue
- Dream Cycle optimizer

### Conformance

- fixtures for valid and invalid SSSS files
- operation validation fixtures
- projection rebuild tests
- migration tests
- CLI compatibility tests

## Non-Goals

- Total Recall does not own UltraChat's hosted billing, team UX, marketplace, or commercial packaging.
- Total Recall does not require a specific frontier provider.
- Total Recall does not hide the SSSS spec for lock-in.
- Total Recall does not let background user optimizers silently redefine the global SSSS protocol.

## Success Criteria

- [ ] A clean host can run a Total Recall brain with no relational database.
- [ ] A user can export the entire brain as files and import it elsewhere.
- [ ] UltraChat can select the brain through model management without hardwired routes.
- [ ] The local model can run private background optimization loops.
- [ ] Accepted optimizer output becomes future SSSS context.
- [ ] SSSS protocol updates are versioned, tested, and migratable.
