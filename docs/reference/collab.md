# Collaboration Platform & Workspaces Guide

Total Recall provides a fully localized, sovereign collaboration and team messaging system. This allows multiple user groups or workspace agents to coordinate, share pinned annotations, and sync active views in real time.

## 🏗️ Core Architecture

### 1. Zero-Database VFS Storage
All teams, user workspaces, and pinned page annotations are persisted inside the user's sovereign Virtual File System (VFS) data directory:
`<brainDir>/collab/`

- **workspaces.json**: Contains workspace mappings and active environments.
- **groups.json**: Lists created collaboration teams and group invite codes.
- **annotations.json**: Stores notes and annotations pinned to specific URLs.

### 2. WebSocket Sync Protocol
Real-time message propagation and presence updates are powered by WebSockets via the `/collab-ws` route. When a user creates or replies to an annotation, the event broadcasts instantly to all active sockets connected to the matching workspace channel.

---

## 🛠️ Dashboard Controls

### 1. Collaboration Page
Accessible via the sidebar navigation under the **Collaboration** tab:
- **Workspace Settings**: Setup or switch between collaborative project workspaces.
- **Group Registration**: Create a team or join an existing one using an invite code.
- **Simulation Sandbox**: Pin annotations to target URLs, mock navigation events, and chat in real time directly on simulated web spaces.

### 2. 3D Sovereign Graph Overlay
In the **Chat** workspace, the 3D Sovereign memory node graph runs persistently in the background. A glassmorphic translucent message bubble container overlays the graph, providing an interactive layout that lets you rotate, zoom, and inspect nodes while conversing with your brain.
