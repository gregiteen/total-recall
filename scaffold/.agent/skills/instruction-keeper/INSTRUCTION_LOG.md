## [2.4.0] - 2026-04-29

### Added
- **ADDED LAW 3 (THE DOC TRAIL MANDATE)**: Enforces that any new feature idea or pivot MUST be preceded by creating a `<PROJECT_PREFIX>_PROJECT_TRACKER.md` and `<PROJECT_PREFIX>_DEVELOPMENT_PLAN.md` inside `docs/projects/in-progress/<feature-name>/`. Cowboy-coding without a doc trail is strictly forbidden.

## [2.3.0] - 2026-04-28

### Changed
- **ADDED LAW 2**: Complete ban on stopping to ask for permission ("Shall I proceed?"). Agents must formulate a plan, state the skill, and execute continuously without stalling.

## [2.2.0] - 2026-04-28

### Changed
- **UPDATED SKILL-FIRST MANDATE**: Made the `SKILL-FIRST PRE-FLIGHT CHECK` explicitly loud and completely mandatory on EVERY SINGLE RESPONSE.
- **ENFORCED**: Agents MUST state what skill they are using in their response before executing tools, and failure to do so is a critical violation of protocol.

## [2.1.0] - 2026-04-12

### Added
- **CLARIFIED LAW #11**: Explicitly documented that agents are authorized to use `.env` and `.env.development.local` (Developer Secrets Env) for outside service integration (GitHub, SSH, DB, etc.).

## [2.0.0] - 2026-04-08

### Changed

- **UPDATED ARCHITECTURE MANDATE**: Integrated the `/repo-expert` v16.1 UNIFICATION protocol.
- **ABSOLUTE PURGE**: Deleted over 150 lines of strictly obsolete legacy laws (Law #3, Law #-1, Legacy generators, and VS Code activations).
- **ENFORCED**: This is a Code-Mode only environment.
- **CLARIFIED**: Product Skills run on the Code Mode substrate and are DB-backed instruction guidance, rather than tool bundles.
- **ADDED LAW #11**: Codified IDE-Agnostic Keychain for Developer Secrets Env.

## [1.5.0] - 2026-03-30

### Added

- **LAW #10**: Permanent ban on manual `tsc` or `lint` scans.
- **ENFORCED**: Must rely exclusively on background daemon reports (`typescript-fullrepo-errors.txt`, `lint-status.txt`).
- **PENALTY**: Violating this rule crashes the 8GB memory environment and enrages the user.

## [1.4.0] - 2026-03-15

### Changed

- **UPDATED LAW #-2**: Elevated `list_dir` to SAFEST priority for searching.
- **ENFORCED**: Added explicit "no excuses" clause for using default tools that are known to fail.

## [1.3.0] - 2026-01-29

### Changed

- **UPDATED LAW #-2**: Explicitly banned "search_files" and "find_by_name" default tools.
- **CLARIFIED REASON**: Mentioned "Bad CPU type" error specifically.
- **MANDATED**: Native search tools for all searching.

## [1.2.0] - 2026-01-20

### Changed

- **ADDED LAW #6**: Mandatory usage of Agentic Skills as primary OS.
- **ENFORCED SCRIPT LOCALITY**: All skill-related scripts MUST reside in `.agent/skills/<Skill>/scripts/`. Global script pollution is now forbidden.

## [1.1.0] - 2026-01-19

### Changed

- **BANNED** `default_api:find_by_name` explicitly in Rule #-2.
- **MANDATED** native `find_by_name` or `grep_search` for all search operations.
- **REASON**: The internal `fd` binary provided by the agent environment is incompatible with the system's CPU architecture (Bad CPU Type), causing persistent crashes. Using a standard compatible search solves this.

## [1.0.0] - 2026-01-17

- Initial skill creation for cross-IDE instruction management.
- Implementation of `INSTRUCTION_LOG.md` protocol.
- Added LAW #-6 forbidding automatic dev server execution
