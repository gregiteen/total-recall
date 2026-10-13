### The audit (document 1): what "extensive" means

Use [references/audit-template.md](../../references/audit-template.md). Copy it to `<PROJECT_PREFIX>_AUDIT.md` and fill every section; a section that does not apply says `N/A` and why. The audit is read from the **code and the running system**, not from the repo's own docs (which drift). Cite `path:line` or a command and its output for every claim.

An audit is extensive when it covers all of these, at a depth matching the project's blast radius:

1. **Scope and method:** what was audited, the commit hash, the date, what was deliberately left out.
2. **Inventory:** entry points, directory map, sizes of the largest files, generated versus authored files, what is tracked in git and what should not be (binaries, backups, env files, PII).
3. **Runtime surface:** every HTTP route or command, scheduled job, background process, and who can call it (public, visitor, admin, token). Every environment variable and where it is read.
4. **Data and state:** where state lives, its format, who writes it, what is personal data, what is deployed or synced and what must not be.
5. **Integrations:** every third-party service and account the code touches, the credentials it uses, and where they come from (secret store versus env versus code).
6. **Security and privacy:** authentication and authorization paths, cookie and token handling, injection or traversal risks in the paths the project touches, secrets or PII in git.
7. **Standing-rule conflicts:** compare the code with the user's invariants and corrections (Total Recall rules, banned providers or products, hardcoding rules, open-source rules). Every conflict is a finding.
8. **Quality baseline:** run the repo's real test and gate commands on the sanctioned host (the Mac mini) **before any change**, and record pass/fail counts and every failure with its cause. Note lint/type status and coverage gaps around the files the project will touch.
9. **Debt and dead code:** stray scripts, unused features, duplicated logic, TODO/FIXME, features that are half-built or over-claimed.
10. **Deploy and operations:** how it ships, where, with what excludes, what can be destroyed by a deploy, how to roll back.
11. **Content and product fit** (when the project has user-facing content): does the copy, data and behaviour say what the owner needs it to say today.
12. **Findings register:** one table, every finding with an ID (`A-001`), severity `P0-critical` / `P1-high` / `P2-medium` / `P3-low`, evidence, impact, recommendation, and a disposition (`fix in this project` / `defer` / `won't fix` with reason).
13. **Impact on the requested change:** which findings block, shape, or are affected by what the user asked for.
14. **Decisions:** questions that only the owner can answer, each with a recommended default so work is never blocked waiting.

Rules for the audit:
- It **records; it does not change code.** Bugs found are logged with an ID. Per the standing "fix what you see" rule they are then fixed immediately as the first items of the tracker, never left broken and never silently patched during the audit.
- Read whole files for the parts the project touches; use search for the rest. Say which is which.
- Baseline tests run **before** scoped edits on the repository's sanctioned host. Prefer a clean audited export; when the authorized session includes uncommitted work, explicitly identify the working-tree snapshot and record its limitations. Never describe that evidence as a clean-commit baseline.
- Mark `Audit Status: Complete` only when sections 1–14 are filled and the baseline was run. Until then the other documents must not exist.
- A small change gets a short audit (sections may be one line each), never no audit. An existing-code project (integration, rewrite, feature in a large repo) gets the full one.

