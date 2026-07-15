# Total Recall — AI OS Installation & Setup

This guide details the complete installation pipeline, environment initialization, and selectable deployment strategies for the **Total Recall Local AI OS**.

---

## 🚀 1. The `npx total-recall init` Wizard

The primary entry point to initialize Total Recall in any environment is the interactive setup wizard. To start the wizard, execute:

```bash
npx total-recall init
```

The wizard automates the provisioning of both the **Global Brain Layer** and the **Project-specific configurations** inside your active repository.

### Interactive Steps:
1. **Model Endpoint Configuration**: Configures local reasoning paths (Ollama/Gemma 4) and credentials for optional frontier fallbacks (OpenAI, Anthropic).
2. **Personal Access Token (PAT) Generation**: Provisions the Bearer token required for all REST API operations (stored in `.agent/skills/total-recall/config/brain.json`).
3. **Selectable Deployment Location**: Prompts you to select your public UI and server access layout.

---

## 🌐 2. Selectable UI Deployment Modes

During initialization, you can select one of the following deployment configurations:

| Mode | Target | Description | Configuration Key |
| :--- | :--- | :--- | :--- |
| **Local Bind** | `http://127.0.0.1:3000` | Bind strictly to localhost. Ideal for standard local operations. | `deploy-mode: local` |
| **Quick Tunnel** | `https://*.trycloudflare.com` | Instantly spins up a public Cloudflare quick tunnel for remote browser access. | `deploy-mode: quick-tunnel` |
| **Named Tunnel** | `https://your-tunnel.domain.com` | Connects securely to a pre-configured Cloudflare named tunnel daemon. | `deploy-mode: named-tunnel` |
| **Custom Domain** | `https://your-domain.com` | Hooks up to your own public DNS reverse-proxied through a custom server. | `deploy-mode: custom-domain` |

> [!TIP]
> **Cloudflare Tunnels on Headless Servers:**
> If you are running Total Recall on a headless home server (e.g. a Mac Mini or Linux rig), selecting **Quick Tunnel** allows you to securely access the React Dashboard from any browser worldwide without manual port-forwarding or dynamic DNS.

---

## 🏗️ 3. Automatic Frontend Compilation

Total Recall features a self-compiling React frontend. 

When you start the OS daemon using `npm start` or the background service, the Express server executes the following startup sequence:
1. Checks for the existence of compiled static files in the target directory (`frontend/dist/index.html`).
2. **If missing**: The daemon automatically wakes up, executes `npm install`, and triggers the production build pipeline (`npm run build`) in the `frontend` subdirectory.
3. Serves the resulting React Single Page Application (SPA) on port `3000` dynamically, ensuring a zero-setup dashboard experience.

```mermaid
sequenceDiagram
    participant Daemon as Node.js OS Daemon
    participant FS as Local VFS
    participant Builder as Vite/React Compiler
    participant Browser as Web Browser

    Daemon->>FS: Check for frontend/dist/index.html
    alt Missing compiled assets
        Daemon->>Builder: Execute npm install && npm run build
        Builder-->>FS: Output production static assets in dist/
    end
    Daemon->>FS: Serve dist/ via express.static()
    Browser->>Daemon: Request Dashboard on Port 3000
    Daemon-->>Browser: Render beautiful Glassmorphic React SPA
```

---

## 🧠 4. Dual-Layer Brain Provisioning

During the initialization phase, the system configures the brain to operate as a **Dual-Layer Memory System**:

### Global Layer (`~/.agent/`)
- Contains global preferences, master API keys, global logs, and the identity layer (`SOUL.md`, `USER.md`).
- Loaded by the kernel upon booting to establish baseline system behavior.

### Project Layer (`<repo>/.agent/`)
- Contains repository-specific facts, workspace patterns, and localized research agendas.
- Overrides global configurations when active inside a project directory, allowing for highly contextual workspace intelligence.

### Interoperability:
- **Together**: The rebuilder automatically merges both directories, allowing project-specific facts to interact with global invariants.
- **Separately**: In air-gapped workspaces, the global layer can be fully disabled to restrict the agent's memory to the local repository boundaries.
