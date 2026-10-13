# TR_LAUNCH_HARNESS_DISCOVERY — Audit and requirements capture

> **Project Prefix**: `TR_LAUNCH_HARNESS_DISCOVERY`
> **Kanban State**: In Progress
> **Audit Status**: In progress
> **Audited commit**: Existing dirty total-recall checkout, October 11, 2026
> **Author**: Codex

## 1. Scope and owner direction

Greg requests saving launch ideas, completing the Total Recall public landing site, promoting it as an optional free open-source Gro CRM resource, obtaining Pi and Hermes source for experiments, assessing other harnesses and considering owning plugins like DSH. This is a source/readiness audit and requirements capture, not an implementation or release certification.

## 2. Inventory

Total Recall is MIT licensed (`LICENSE`); package declares 3.39.1. Current checkout contains extensive pre-existing core/plugin migration changes. Do not sweep these into a marketing commit. Tracked HTML entrypoints are dashboard/collaboration shells; no dedicated landing implementation was identified by the scoped landing/website source search. The intended public domain and deployed landing ownership still need verification.

Pi source: `/Users/greg/Github/pi`, upstream `https://github.com/earendil-works/pi.git`, fetched commit `8bb180bec133199c913ca8ef9bb30bd9ab12a72b`.

Hermes source: `/Users/greg/Github/hermes-agent`, upstream `https://github.com/NousResearch/hermes-agent.git`, fetched commit `e4d86423856350825a3a0dc4f52aed89759e11bd`.

Both are shallow upstream clones, clean after acquisition. Sources are downloaded; dependencies, executables, provider auth and real model sessions were not installed or tested. Their upstream commit dates use UTC; this capture uses Greg's October 11 Denver date.

## 3. Runtime surface

`src/cli/connect.mjs` contains Pi, Hermes, DSH and OpenClaw connection presets. These project instructions/files; they do not establish a full harness lifecycle adapter. `src/core/meta-harness.mjs` has no Pi/Hermes dispatch specifications. Neither `pi` nor `hermes` was found on the current PATH.

## 4. State

Keep canonical SSSS memory in Total Recall, with explicit project/profile scope. Harness-native transcripts and execution journals are a separate responsibility. Never copy Greg's live brain into an upstream test checkout. Experiments require isolated temporary homes and disposable test brains.

## 5. Integrations and reuse candidates

| Candidate | Proposed reuse / comparison | Current evidence |
| --- | --- | --- |
| [Pi](https://github.com/earendil-works/pi) | Extension/package, SDK/RPC, agent-core/model adapters; evaluate durable runtime | Official source cloned; connector exists; native integration untested |
| [Hermes](https://github.com/NousResearch/hermes-agent) | Native memory-provider/tools plugin; keep scheduler, gateway and skills upstream | Official source cloned; file connector exists; native integration untested |
| [OpenCode](https://github.com/anomalyco/opencode) | External coding-agent/server integration and client experience | Local `opencode` directory exists; source identity/runtime not verified |
| [Goose](https://github.com/aaif-goose/goose) | Extensible agent and tool/MCP integration patterns | Official repository reviewed; no local test |
| [OpenHands SDK](https://github.com/OpenHands/software-agent-sdk) | Agent server, workspaces and isolated execution | Official repository reviewed; no local test |
| [Aider](https://github.com/Aider-AI/aider) | Editing/Git workflow and repository-context baseline | Official repository reviewed; no local test |
| [OpenClaw](https://github.com/openclaw/openclaw) | Assistant/channel orchestration | Connector exists; avoid double-counting Pi-based infrastructure as independent invention |

Check exact component/dependency licenses at the pinned versions before copying or redistribution. Source acquisition does not import upstream code into Total Recall.

## 6. Preservation and credential boundaries

Existing Hermes connect writes global MEMORY.md and slices instructions at 2,200 characters; it needs preservation and budget handling before real-profile use. Pi's global symlink also needs project-switch isolation proof. Credentials remain in the owning auth store; no keys in source/docs or browser assets.

## 7. Standing constraints

Optional integration capabilities belong in their owning plugin repositories. For personal workflows, load them through Total Recall. Apps built for distribution own vendored/scaffolded capability code; Gro does not acquire a Total Recall runtime dependency. The CRM cross-promotion request changes marketing scope, not that ownership rule.

## 8. Quality baseline

No code changed and no suites run for this requirements capture. Existing historical core suite results do not certify the dirty checkout or new upstream clones. Before implementation, complete this audit, pin the experiment snapshot and run the owning gates on the sanctioned Mac mini.

## 9. Existing DSH plugin status

`/Users/greg/Github/tr-plugin-dsh` has a 1.1.0 manifest, CLI and UI sources. The live `total-recall dsh status` probe returned “DeepSeek Harness is not running” (exit 1). Its source discovery scans fixed ports and is not reliable identity proof; README records discovery, generator and UI gaps. This is a useful ownership example, not a verified complete integration to copy blindly. No new DSH changes were made.

## 10. Launch and landing acceptance

Public landing: explain one concrete memory problem; show a real short demonstration; provide current installation, source/license and compatibility information; offer the first-party portfolio survey and an optional Gro CRM workflow. Distinguish tested support from planned integrations. Verify mobile, links, fresh install, isolated-brain use and all advertised commands before publishing. Hosting and rollout remain unverified.

## 11. Product fit

User acquisition hypothesis: people already using Gro or switching coding agents may value portable memory. This has not been validated with external users. Promotion alone does not establish demand. Track installs, successful first workflow, repeated use and qualitative failure reports separately from visits/signups.

## 12. Findings

| ID | Finding | Disposition |
| --- | --- | --- |
| LH-001 | Public landing implementation/deployment ownership unverified | Establish source/domain and finish acceptance before launch |
| LH-002 | Pi/Hermes connection files are not native integration proof | Reuse existing seams; isolated preservation/retrieval/writeback experiments |
| LH-003 | Hermes truncates/overwrites; Pi global instructions may cross project boundaries | Repair in owning integration scope before real-profile connection |
| LH-004 | DSH source exists but runtime probe fails and documented gaps remain | Report incomplete; do not use it as blanket readiness evidence |

## 13. Next bounded experiments

Use the same small fictional project decision in each harness alone and with Total Recall. Measure required-rule retrieval, correction persistence, switching, context isolation, setup effort and recovery. Separate native Pi/Hermes extensions from Total Recall-side lifecycle plugins. Proposed owners are `tr-plugin-pi` and `tr-plugin-hermes`; they do not exist yet in the inspected GitHub directory.

## 14. Decisions and action log

Preserve upstream packages rather than large forks. Build thin adapters first. No adoption/superiority claims until measured. Finish baseline and source/domain ownership audit before PRD/architecture/implementation documents. Gro recruiting/commission ideas live in its own seller-platform project; portfolio-site owns the adaptive survey.

2026-10-11, Codex: saved owner requirement through canonical project CLI (local indexes compiled); cloned both official sources and recorded HEAD/clean state; inspected current connection/meta-harness/DSH source and actual DSH status. No dependency install, suite, provider experiment, publication, production change or new plugin performed. This audit stays in progress.
