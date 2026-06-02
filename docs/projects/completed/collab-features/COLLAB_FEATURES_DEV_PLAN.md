# Development Plan: Collaborative Workspace Overlay & Messaging

## Phase 1: Styling System
* Update `collab/frontend/src/index.css` to define our premium dark-mode, glassmorphism CSS theme.
* Provide clear typographic systems (Inter/Outfit style), smooth glowing card components, inputs, and button structures.

## Phase 2: Auth Flow
* Build registration and login UI in `collab/frontend/src/components/AuthView.tsx`.
* Securely save the JWT and logged-in username in `localStorage`.
* Provide loading and error notifications with smooth transitions.

## Phase 3: Dashboard View
* Build the main layout displaying current logged-in user, current joined groups, and workspace navigation.
* Build "Create Team" and "Join Team via Invite Code" modals/sections.
* Integrate with backend Express `/api/groups` and `/api/groups/join` routes.

## Phase 4: Simulated Page Collaboration Sandbox
* Create a sandbox interface that lets users type in a URL.
* Provide an active WS connection manager that connects to `ws://localhost:3001` with the JWT.
* Upon updating the URL, automatically unsubscribe from the previous URL and subscribe to the new one.
* Build a split-screen view:
  * Left: Pinned annotations feed for the URL, with form to add new notes targeting any joined group.
  * Right: Live WebSocket chat sidepanel with connection state, real-time message stream, and active participant presence notifications.

## Phase 5: Verification & Quality Audits
* Run standard TypeScript quality checks.
* Run ESLint static audits.
* Run Vite production build compiling client files.
