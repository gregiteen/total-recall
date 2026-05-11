# Total Recall Deployment Analysis (2026 Free Tiers)

This document analyzes the viability of various free-tier cloud hosting providers for deploying the **Total Recall Personal Brain Cloud Container**. 

## Architectural Constraints

Total Recall's SSSS architecture imposes strict infrastructure requirements:
1. **POSIX File System**: The engine (`vault.mjs`) natively reads/writes Markdown files to the disk (`.agent/memory-vault/`). It does not use external databases like Postgres.
2. **Persistence**: The storage must survive container restarts. Ephemeral disks will result in permanent memory loss.
3. **Background Processes**: The `dream.mjs` daemon runs 24/7 via cron. Serverless functions (which sleep instantly) cannot run background daemons natively.

---

## Provider Comparison Matrix

| Provider | Type | Free Storage Type | Background Daemons? | Viability for Total Recall |
| :--- | :--- | :--- | :--- | :--- |
| **Koyeb** | Managed PaaS | Persistent SSD (~2GB) | Yes (with caveats)* | 🟢 **Highly Recommended** |
| **Oracle Cloud** | Unmanaged VM | Persistent Block (200GB) | Yes (Always On) | 🔴 **Not Recommended (Vendor Lock-in)** |
| **here.now** | Agent API Host | "Drives" (Static/Files) | No (Static Host) | 🟡 **Viable for Data Only** |
| **Render** | Managed PaaS | Ephemeral (Wiped) | Yes | 🔴 **Not Viable** |
| **Railway** | Managed PaaS | Persistent Volume (0.5GB) | Yes | 🟡 **Viable but Not Free** |

*\*Koyeb's free tier scales to zero after inactivity, meaning the background cron might pause if no HTTP traffic hits the container.*

---

## Detailed Breakdown

### 1. Koyeb (The Best "One-Click" PaaS)
Koyeb provides a Docker-native platform with a permanent Free Tier that actually includes Persistent SSD storage.
- **Pros**: Genuine "Always Free" tier. Gives exactly what Total Recall needs: a container with a real disk to store SSSS Markdown files. Deploying is as simple as connecting a GitHub repo with a `Dockerfile`.
- **Cons**: Containers "sleep" when idle. If the container sleeps, the `dream.mjs` cron job will not run until the next time an API request wakes the container up.

### 2. Oracle Cloud (The Unstoppable VM)
Oracle Cloud Infrastructure (OCI) offers an "Always Free" tier providing a permanent Virtual Machine.
- **Pros**: Huge 200GB persistent block storage and 24GB RAM.
- **Cons**: It is an Oracle product. Vendor lock-in, notoriously hostile account creation processes, and a complete violation of our hardware-agnostic OS philosophy. We do not recommend building Sovereign infrastructure on Larry Ellison's servers.

### 3. here.now (The Agent-Native Host)
You were completely right, and I mistakenly confused this with Vercel's legacy name. **here.now** is a specialized, zero-config hosting service built specifically for AI agents (like Claude or Cursor) to publish files via API.
- **Pros**: It is completely free and designed explicitly for AI agents. It supports a "Drives" feature for storing private agent files, which perfectly aligns with storing the `.agent/memory-vault/`.
- **Cons**: It is primarily a static hosting service. It does not provide a runtime container that can execute the `dream.mjs` Node.js background cron job. 
- **Viability**: We could use `here.now` as a completely free, frictionless cloud storage drive for the memory vault, but we would still need the user's local machine or a separate execution environment to run the Dream Cycle daemon.

### 4. Render
- **Pros**: Great UI and GitHub integration.
- **Cons**: The Free Tier provides **Ephemeral Storage**. If the app restarts, the disk is wiped clean. Persistent disks cost $0.25/GB/month and require a paid tier.

### 5. Railway
- **Pros**: Excellent Persistent Volumes (0.5 GB) that map perfectly to the Total Recall filesystem.
- **Cons**: Railway no longer has a permanent free tier. It is only a Free Trial. Once the $5 trial credit is gone, the user's brain goes offline until they pay.

---

## Final Recommendation
For the Deployment Phase (Phase 12), we should optimize the `Dockerfile` for **Koyeb**. It is the only modern managed PaaS that offers a permanent free tier with the persistent POSIX filesystem required to store SSSS Markdown files.
