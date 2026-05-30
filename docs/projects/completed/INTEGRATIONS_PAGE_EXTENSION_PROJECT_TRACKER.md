# Project Tracker: Chrome Extension Permanent Card and Permission Fixes

This project tracker implements two critical improvements to the Chrome Extension connection and onboarding:
1. **Tabs Permission & Defensive Querying**: Add `"tabs"` to `"permissions"` in `extension/manifest.json`, and safeguard `getCurrentTab` calls in `extension/sidepanel/sidepanel.js` and `extension/popup/popup.js`. This guarantees that the quick-action buttons (Remember Page, Research Page) successfully retrieve `tab.url` and `tab.title` without throwing 400 Bad Request errors.
2. **Permanent Integrations Card**: Add a permanent **Chrome Extension Card** to `frontend/src/pages/IntegrationsPage.tsx` right next to other integrations, providing a direct, reliable download button pointing to `/api/extension/download`.

## 📋 Status & Checklist

- [x] **Phase 1: Manifest Permission Update**
  - [x] Add `"tabs"` to `"permissions"` in `extension/manifest.json`.

- [x] **Phase 2: Sidepanel and Popup Javascript Hardening**
  - [x] Update `getCurrentTab` and quick-actions in `extension/sidepanel/sidepanel.js` to handle `undefined` or empty tab/url states defensively.
  - [x] Update `popup.js` to handle empty/undefined active tab states gracefully.

- [x] **Phase 3: Permanent Integrations Card**
  - [x] Modify `frontend/src/pages/IntegrationsPage.tsx` to add a permanent Chrome Extension Card.
  - [x] Ensure the card features a download button linking to `/api/extension/download`.

- [x] **Phase 4: Code Quality and Tests**
  - [x] Run typescript checks via code-quality scripts.
  - [x] Run eslint checks via code-quality scripts.
  - [x] Run the full Vitest test suite.

---

## 🛠️ Proposed Changes

### Chrome Extension

#### [MODIFY] [manifest.json](file:///Users/greg/Github/total-recall/extension/manifest.json)
- Add `"tabs"` to `"permissions"` array so the extension can read active tab `url` and `title` without page gestures.

#### [MODIFY] [sidepanel.js](file:///Users/greg/Github/total-recall/extension/sidepanel/sidepanel.js)
- Update `getCurrentTab()` or action clicks to defensively verify `tab` and `tab.url`, throwing a user-friendly error if they are missing or if the user is on a system page.

#### [MODIFY] [popup.js](file:///Users/greg/Github/total-recall/extension/popup/popup.js)
- Add defensive checks for tab availability and URL presence.

### Frontend UI

#### [MODIFY] [IntegrationsPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/IntegrationsPage.tsx)
- Add a beautiful permanent integration card for the Chrome Extension.
- Implement a download button linking to `${baseUrl}/api/extension/download`.

---

## 🧪 Verification Plan

### Automated Verification
- Run Vitest suite: `npm run test`
- Run quality checks: `node .agent/skills/code-quality/scripts/start-here-ts.mjs` and `node .agent/skills/code-quality/scripts/start-here-lint.mjs`

### Manual Verification
- Check that the Integrations page displays the Chrome Extension card and triggers download successfully.
