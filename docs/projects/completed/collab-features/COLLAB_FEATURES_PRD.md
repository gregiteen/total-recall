# Product Requirement Document (PRD): Collaborative Workspace Overlay & Messaging

## 1. Goal & Context
The goal of `total-recall-collab` is to enable users of the Total Recall ecosystem to collaborate, annotate web pages, and engage in real-time communication tied directly to the URLs they visit. This turns the web browser into a shared multiplayer space, filtered and secured by private user groups/teams.

## 2. Target Audience & Use Cases
* **Sovereign Teams**: Teams wishing to share research notes, security briefs, or web audit logs on live pages without relying on public SaaS tools.
* **Co-Workers/Groups**: Reviewing docs, staging pages, or online articles together with contextual chat and persistent page notes.

## 3. Core Features
* **Multi-User Authentication**: Register and login endpoints securing sessions with JWT.
* **Groups & User Teams**:
  * Create a group/team workspace with a user-friendly name.
  * Auto-generate a unique, short, random invite code for each team.
  * Join a group using its invite code.
  * Verify group membership before reading/writing team-bounded page notes.
* **URL-Tied Page Annotations**:
  * Persistent notes containing: URL (without hash fragments), target group, author, text comments, optional text excerpts.
  * Bounded view: Annotations are only fetched and visible to members belonging to the specified target group.
* **Real-time Webpage Chat Rooms**:
  * WebSockets-driven channel subscription based on current URL.
  * Live status notifications: "USER_JOINED", "USER_LEFT".
  * Real-time text chat messages broadcasted to all users currently subscribed to the same URL context.
* **Sleek Premium Frontend UX**:
  * Glassmorphism, HSL tailormade colors, responsive layouts.
  * Auth flow, team management dashboard, and page simulator to test URL-based annotations/chat overlays before extension deployment.
