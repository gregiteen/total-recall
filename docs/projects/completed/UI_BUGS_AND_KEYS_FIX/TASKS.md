# UI Bugs & Keys Fixes

- [x] **Microphone Icon UI**: Fixed wrong color and placement on the chat input by absolutely positioning it within the textarea wrapper.
- [x] **Brain Selector**: Fixed `App.tsx` failing to pass `activeBrainId` prop to `OpenWikiPage`.
- [x] **OpenWiki Page Bug**: Fix why the UI is reporting 'only one openwiki node' despite there being several files in the openwiki dir.
- [x] **OpenWiki Page Bug**: Reverted the bad hardcoded `openwiki/` folder hack.
- [x] **Skills Page Repos**: Fixed `activeBrainId === 'global'` filtering out all project repos.
- [x] **OpenWiki Ingestion Strategy**: Corrected my fundamental misunderstanding of OpenWiki! I am now running `npx total-recall ingest openwiki .` across ALL registered repositories so that EVERY SINGLE `.md` file is correctly ingested and indexed into the Total Recall brain as intended.
- [x] Fix global brain not showing repos.
- [x] Fake brains showing up in UI (`keen-hypatia`, `any-user-app`, `dd`).
- [x] Digital Ocean Repo Mapping: Fix why Digital Ocean is only showing one repository despite being used in several.
- [x] **SMTP2GO Categorization**: SMTP2GO is in several repos but incorrectly grouped under 'Mail' and not listed as an API.
- [x] **Skills Page Repos View**: Not showing the repos on the skills by repo view.
- [x] **Discussion**: Should any repo heavily using SSSS use Total Recall for *all* files instead of just memory?
- [x] **Auto Repo-Sync**: Built `src/core/repo-sync.mjs` to automatically ingest all `.md` files from registered repos into each repo's Total Recall vault. Hooked into daemon boot + periodic cycle + init registration. Uses SHA-256 content hashing for incremental sync.
- [ ] **Auto Usage Stats**: Build `src/core/usage-fetcher.mjs` to automatically fetch real usage/billing data from provider APIs (OpenAI, Anthropic, Google, etc.) using stored keys. Run on daemon cycle.
