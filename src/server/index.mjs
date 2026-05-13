/**
 * Total Recall — Unified Server Entry
 *
 * Mounts all HTTP routes on a single Express app:
 *   - /v1/chat/completions  → API proxy (api.mjs)
 *   - /health               → System diagnostics
 *   - /*                    → React SPA (frontend/dist/)
 *
 * Usage:
 *   node src/server/index.mjs
 *   PORT=3000 node src/server/index.mjs
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// ─── Watchdog ───────────────────────────────────────────────────────────────────
// Attach circuit-breaker log monitor before any subsystem can emit events.
import { attachLogMonitor } from '../core/watchdog.mjs';
attachLogMonitor();

// ─── App ────────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

import fs from 'node:fs';

// ─── Health Check ───────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  let disk = { free: 0, total: 0 };
  try {
    const stat = fs.statfsSync('/');
    disk.free = stat.bavail * stat.bsize;
    disk.total = stat.blocks * stat.bsize;
  } catch (e) {
    // ignore
  }

  let ollamaStatus = 'unknown';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    const ollamaRes = await fetch('http://localhost:11434/', { signal: controller.signal });
    clearTimeout(timeoutId);
    ollamaStatus = ollamaRes.ok ? 'online' : 'offline';
  } catch (e) {
    ollamaStatus = 'offline';
  }

  res.json({
    status: 'healthy',
    version: '3.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    disk,
    ollama: ollamaStatus
  });
});

// ─── API Routes (/v1/chat/completions) ──────────────────────────────────────────

try {
  const { apiRouter } = await import('./api.mjs');
  if (apiRouter) {
    app.use(apiRouter);
    console.error('[Server] API routes mounted at /v1/chat/completions');
  }
} catch (err) {
  // api.mjs may still be in standalone mode — mount it directly
  console.error('[Server] API router not exported as middleware, loading standalone routes...');
  const { callFrontier, loadFrontierConfig } = await import('../core/frontier.mjs');
  const os = await import('node:os');

  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
      }

      const configPath = path.join(os.homedir(), '.agent', 'config', 'frontier.yml');
      const config = loadFrontierConfig(configPath);
      const { messages, model, temperature } = req.body;

      if (!messages || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      const systemMessage = messages.find(m => m.role === 'system')?.content || '';
      const userPrompt = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');

      const responseContent = await callFrontier(userPrompt, systemMessage, {
        ...config,
        model: model || config.model,
        temperature: temperature || config.temperature
      });

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: config.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: responseContent },
          finish_reason: 'stop'
        }]
      });
    } catch (error) {
      console.error('[API Error]', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// ─── MCP Gateway (/mcp) ────────────────────────────────────────────────────────

try {
  const { mountMcp } = await import('./mcp.mjs');
  const { requireAuth, mcpRateLimiter } = await import('./auth.mjs');
  if (mountMcp) {
    app.use('/mcp', mcpRateLimiter(), requireAuth);
    mountMcp(app);
    console.error('[Server] MCP gateway mounted at /mcp');
  }
} catch (err) {
  console.error('[Server] MCP gateway not available:', err.message);
}

// ─── Static Frontend (SPA catch-all) ────────────────────────────────────────────

const frontendDist = path.join(ROOT, 'frontend', 'dist');
app.use(express.static(frontendDist));

// SPA fallback — serve index.html for all unmatched routes
app.get(/^(.*)$/, (req, res) => {
  const indexPath = path.join(frontendDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // Frontend not built yet — return a helpful message
      res.status(200).json({
        message: 'Total Recall Brain is running.',
        endpoints: {
          api: 'POST /v1/chat/completions',
          memory: 'GET /api/memory',
          sandbox: 'POST /api/sandbox',
          health: 'GET /health',
          dashboard: 'Build frontend first: cd frontend && npm run build'
        }
      });
    }
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.error(`\n  ┌─────────────────────────────────────────────┐`);
  console.error(`  │  Total Recall Brain v3.0.0                  │`);
  console.error(`  │                                             │`);
  console.error(`  │  API:       http://localhost:${PORT}/v1/chat/completions │`);
  console.error(`  │  Memory:    http://localhost:${PORT}/api/memory           │`);
  console.error(`  │  Health:    http://localhost:${PORT}/health               │`);
  console.error(`  │  Dashboard: http://localhost:${PORT}/                     │`);
  console.error(`  └─────────────────────────────────────────────┘\n`);
});
