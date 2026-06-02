# Development Plan: Collaborative Teams Platform & Glassmorphic Graph Overlay

## 🏗️ Design & Architecture
We are implementing a collaborative workspaces and messaging feature for Total Recall, alongside a dedicated documentation rendering dashboard and a glassmorphic floating message overlay on top of the 3D Sovereign Graph.

### 1. Collaborative Workspaces & Pinned Annotations
- Workspaces, user groups, and annotations are stored directly under the user's sovereign VFS directory: `<brainDir>/collab/`.
- Groups support invite-code based registration.
- Notes/annotations are pinned to specific URLs for page simulation sandbox.
- Real-time synchronization is driven by a live WebSocket channel (`/collab-ws`).

### 2. Help API & Dashboard Document Viewer
- Standalone local markdown-rendering viewer page (`HelpPage.tsx`).
- Backed by an extensible `/api/help` endpoint in `src/server/rest.mjs` reading documentation files directly from disk (`docs/`).
- Document options: CLI Reference, SSSS specifications, System Architecture, and the new Collaboration Platform guide.

### 3. Glassmorphic Graph Overlay Chat
- 3D Sovereign Graph renders persistently in the background of the Chat dashboard.
- Active chat bubble messages overlay the graph with translucent backdrop-filter glass styling and pointer-events adjustments for interactive graph rotation behind messages.

---

## 🛠️ Step-by-Step Implementation

### Step 1: Backend Routes & WebSockets (Complete)
- Create [collab.mjs](file:///Users/greg/Github/total-recall/src/server/routes/collab.mjs) handling user workspaces, invite-code based groups, URL-pinned notes, and WebSocket channel sync upgrades (`/collab-ws`).
- Integrate routes into index server and REST routing in [index.mjs](file:///Users/greg/Github/total-recall/src/server/index.mjs) and [rest.mjs](file:///Users/greg/Github/total-recall/src/server/rest.mjs).

### Step 2: Front-End UI Routing & Sub-pages (Complete)
- Create [CollabPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/CollabPage.tsx) for group management and sandbox note simulation.
- Create [GraphPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/GraphPage.tsx) for dedicated 3D Graph layout.
- Create [HelpPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/HelpPage.tsx) for markdown rendering of help guides.
- Wire navigation layout, sidebar link additions, and routes inside [App.tsx](file:///Users/greg/Github/total-recall/frontend/src/App.tsx).
- Position `Graph3D` behind glass-morphic translucent chats inside [ChatPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/ChatPage.tsx).

### Step 3: Help Documentation Updates (In Progress)
- Add a new help guide document `docs/reference/collab.md` detailing the workspace collaboration design, WebSocket sync system, and Page simulation sandbox.
- Mount the new guide topic into the server-side `/api/help` endpoint.
- Verify that both the frontend help page and backend REST API successfully serve the content.

### Step 4: Verification & Build (In Progress)
- Run typescript compilation quality checks.
- Run lint checks.
- Run Vitest integration test suite.
- Build production assets using Vite.
