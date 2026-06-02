# Development Plan: Auto-Update Feature

## 🏗️ Design & Architecture
We will implement an automated update checker and trigger system that allows users to see if a newer version of Total Recall is available on the npm registry and trigger a Git-based pull update with automatic server restart directly from the Health page in the UI.

### 1. Update Checker (`GET /api/update/check`)
- The server will query the npm registry endpoint `https://registry.npmjs.org/total-recall-brain/latest`.
- It will read the current version from `package.json`.
- It will compare the two semantic versions and return `{ currentVersion, latestVersion, updateAvailable }`.

### 2. Update Executor (`POST /api/update/run`)
- If triggered, the server will respond immediately to the client with a success message, then schedule a child process execution:
  - Run `git pull` to fetch and merge the latest code from the remote repository.
  - Run `npm install` to update dependencies.
  - Force-restart the server by killing the current Node.js process (`process.exit(0)`), allowing the supervisor `daemon-loop.mjs` to automatically start the new version.

### 3. UI Dashboard Updates (`HealthPage.tsx`)
- On mount, query the checker endpoint.
- If an update is available:
  - Show a banner or badge highlighting the update.
  - Provide a "Click to Update" button.
  - Clicking the button will trigger a confirmation dialog.
  - Show a loading screen during the update and poll `/health` continuously until the server is back online, then refresh the dashboard.

---

## 🛠️ Step-by-Step Implementation

### Step 1: Implement Update Routes in `src/server/rest.mjs`
- Create `GET /api/update/check`.
- Create `POST /api/update/run`.
- Implement robust child-process calling for updates and scheduled server exits.

### Step 2: Implement UI Components in `HealthPage.tsx`
- Add API call hooks to check status.
- Add confirmation dialog and spinner overlay state.
- Implement polling logic to detect when the server finishes upgrading and re-initializes.

### Step 3: Verify and Build
- Run linting and TypeScript checks.
- Build production assets.
- Verify tests pass.
