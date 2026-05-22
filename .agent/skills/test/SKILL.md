---
name: test
description: "Use this skill when running the Total Recall Test Suite. MANDATORY: You MUST read the full SKILL.md file before executing."
command: /test
metadata:
  version: "6.0.4"
---
# Test Skill - Total Recall Quality Assurance

This is the Single Source of Truth for the Total Recall Testing Architecture.

> [!CAUTION]
> **NO LOCALHOST TESTING**: The user's laptop cannot handle the Vite dev server. You are STRICTLY PROHIBITED from running `npm run dev` or testing against `localhost`. All E2E and visual tests MUST run against the Production environment (`https://total-recall.local`).

## The Testing Architecture

Total Recall is a daemonized headless OS. Therefore, the vast majority of logic is tested via fast unit and integration tests using Vitest.

### Tier 1: Vitest (Headless Logic)
Use Vitest for lightning-fast unit tests that do not require a DOM or a browser. The test suite is currently organized around the core Total Recall modules.

Total Recall's test suite covers:
- `utils`
- `ranking`
- `wiki`
- `episodes`
- `dream`
- `fts5`

To run the full suite:
```bash
npm test
```

### Tier 2: Agentic Browser Testing
Instead of writing brittle Playwright scripts, Total Recall uses the `browser_subagent` tool for any E2E testing against the Omnichannel Dashboard. The Gemma 4 Kernel spawns a browser subagent that is instructed to navigate to `https://total-recall.local` and perform natural language actions, verifying the dashboard state visually.

- **Execution**: The AI explicitly uses the `browser_subagent` to hit the Production server. If the subagent requires authentication, instruct it to either use the persistent Chrome profile, or manually log in using the credentials found in `.env.development.local`.

## The Rule of Zero Regressions
You are strictly prohibited from pushing code if it breaks the Vitest suite. Every time you finish a task, you MUST run `npm test` to verify.

## Test Maintenance
If an API boundary or SSSS schema changes, you must immediately update the corresponding tests in the `test/` directory of the Total Recall project. Do not leave broken tests.


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-22T01:44:36.765Z -->

<!-- END INJECTED MEMORY -->
