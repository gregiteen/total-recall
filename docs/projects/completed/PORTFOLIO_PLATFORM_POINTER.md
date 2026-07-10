# Portfolio Platform — Total Recall Pointer

Canonical cross-repository project record:
[Portfolio Platform tracker](../../../../portfolio-site/docs/projects/in-progress/portfolio-platform/PORTFOLIO_PLATFORM_TRACKER.md)
and its [PRD](../../../../portfolio-site/docs/projects/in-progress/portfolio-platform/PORTFOLIO_PLATFORM_PRD.md).

## What Total Recall owns

- Pulling the portfolio's authenticated backup bundle and generated-assets archive:
  `src/core/portfolio-sync.mjs`
- Scheduling and exposing portfolio-sync status:
  `src/core/scheduler.mjs`, `src/server/rest.mjs`, and `src/server/routes/sync.mjs`
- Protecting the integration token through the local secret store:
  `src/core/config.mjs`
- Sync regression coverage:
  `src/core/portfolio-sync.spec.mjs`
- The document and approval cockpit:
  `src/server/routes/docs.mjs`, `frontend/src/pages/VaultPage.tsx`,
  `frontend/src/pages/InboxPage.tsx`, `frontend/src/components/DocumentTable.tsx`,
  and `frontend/src/components/DocumentEditorModal.tsx`

## Operating contract

`PORTFOLIO_ADMIN_TOKEN` is local-only. The portfolio extension registry is
bound when validating and replaying each bundle file through the SSSS
Operation Contract; the generic CLI import path cannot import those extension
types. Runtime customer data remains tenant-private in the portfolio vault and
is never included in a sale/template export.
