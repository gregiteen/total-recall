### Contamination Prevention

A previous cron job blindly pushed skills across all repos, causing cross-contamination (UltraChat skills leaked into Total Recall and vice versa). This has been fixed:
- Cron job removed from `crons.mjs`
- `repo_scoped: true` enforced on repo-specific skills
- Future: Skills Management Upgrade (Phase 12) will add proper global templates with per-repo customization
