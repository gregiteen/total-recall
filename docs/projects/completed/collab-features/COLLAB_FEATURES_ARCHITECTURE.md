# Architecture Specification: Collaborative Workspace Overlay & Messaging

## 1. System Topology
The system consists of a backend Node.js microservice (`backend`) running Express and a custom WebSockets registry, paired with a React + TS single-page app (`frontend`) representing the dashboard interface and collaboration sandbox.

```
                    ┌────────────────────────┐
                    │  React SPA Frontend   │
                    │   (Vite / Dashboard)   │
                    └───────────┬────────────┘
                                │
               HTTP Requests    │   WebSocket Frames
               (JWT Bearer)     │   (JSON/Url-Bound)
                                ▼
                    ┌────────────────────────┐
                    │    Express + ws        │
                    │   Backend Server       │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ JSON Flat-File Storage │
                    │    (data/*.json)       │
                    └────────────────────────┘
```

## 2. Backend Design
* **Database Engine (`db.js`)**:
  * Implements synchronous JSON read/write operations using `fs.readFileSync` and `fs.writeFileSync`.
  * Avoids external database systems (e.g. SQLite, PostgreSQL) to align with sovereign offline design.
* **REST API Route Design (`server.js`)**:
  * `POST /api/auth/register`: Create user + auto-create default workspace group + return token.
  * `POST /api/auth/login`: Validate hash and sign JWT.
  * `GET /api/groups`: Fetch all groups where the caller is a member.
  * `POST /api/groups`: Generate new group & 8-character invite code.
  * `POST /api/groups/join`: Join a group via invite code.
  * `GET /api/annotations?url=...`: Retrieve URL-tied comments filtered by client's groups.
  * `POST /api/annotations`: Pinned annotation write route. Broadcasts `ANNOTATION_ADDED` to WS clients.
* **WebSockets Sync Engine**:
  * Upgrades HTTP connections after verifying JWT passed via `token` query parameters.
  * Keeps active connection state containing: WebSocket instance, `username`, and `currentUrl`.
  * Supports the following frames:
    * `SUBSCRIBE` (Client -> Server): Subscribes client to a page URL context. Broadcasts `USER_JOINED` to other clients.
    * `CHAT_MESSAGE` (Client -> Server): Broadcasts a chat frame with timestamp, author, and text to all clients currently on the same URL.
    * Broadcast Helper `broadcastToUrl(url, messageObj, excludeWs)` loops over active clients, checking if `currentUrl === url` and sending the payload.

## 3. Frontend Component Structure
* **`main.tsx` & `App.tsx`**: Standard Vite bootstrapping.
* **Routing Structure**:
  * `/login`: Unauthenticated entrance.
  * `/dashboard`: Main control panel managing groups, join/create views, and navigation.
  * `/sandbox`: Interactive preview of the page-level overlay. Simulates navigating to different URLs to demonstrate live annotations and real-time chat.
* **Design Tokens (`index.css` & `App.css`)**:
  * Vibrant dark mode palette (Slate/Charcoal background, Indigo/Purple accents, emerald success indicators).
  * Glassmorphism (`backdrop-filter: blur(16px)` + transparent borders).
  * Micro-animations for button presses and navigation transitions.
