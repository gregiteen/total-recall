import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { callFrontier, callFrontierRaw, loadFrontierConfig } from '../core/frontier.mjs';
import { callLocalRuntimeRaw, loadRuntimeConfig, checkRuntimeHealth } from '../core/runtime.mjs';
import { AVAILABLE_TOOLS, handleToolCall } from './tools.mjs';
import { requireAuth, requireScope, loginHandler, logoutHandler, changePasswordHandler, apiRateLimiter } from './auth.mjs';
import { logger } from '../core/logger.mjs';
import { synthesize as synthesizeTts, isTtsEnabled, TtsNotConfiguredError } from '../core/tts.mjs';
import { KNOWN_SCOPES, loadKeys, issueKey, revokeKey } from './keys.mjs';
import { loadNodes, writeNode, createNodeFromMcpPayload } from '../core/vault.mjs';
import { compileSurface } from '../core/surface.mjs';
import { runInSandbox } from '../core/sandbox.mjs';
import { resolveAgentDir } from '../cli/agent-dir.mjs';
import path from 'path';
import os from 'os';
import fs from 'fs';
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';

const AGENT_DIR = process.env.AGENT_DIR || resolveAgentDir();
const VAULT_DIR = path.join(AGENT_DIR, 'memory-vault');
const SKILLS_DIR = path.join(AGENT_DIR, 'skills');
const DERIVED_DIR = path.join(AGENT_DIR, 'memory-derived');
const INSTRUCTIONS_FILE = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
const SESSIONS_DIR = path.join(AGENT_DIR, 'sessions');
const FILES_DIR = path.join(AGENT_DIR, 'files');
const TASKS_DIR = path.join(AGENT_DIR, 'scheduler', 'queue');
const CONFIG_DIR = path.join(AGENT_DIR, 'config');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL_CATALOG_DIR = path.join(ROOT, 'models', 'catalog', 'total-recall');

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readTextResource(filePath, name) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  return {
    name,
    content,
    sha256: sha256(content),
    bytes: stat.size,
    modified: stat.mtime.toISOString()
  };
}

function sendTextResource(res, filePath, name) {
  const resource = readTextResource(filePath, name);
  if (!resource) {
    return res.status(404).json({ error: `${name} is not available` });
  }
  return res.json(resource);
}

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function absoluteUrl(req, routePath) {
  return new URL(routePath, baseUrl(req)).toString();
}

function endpointManifest(req) {
  return {
    discovery: absoluteUrl(req, '/.well-known/total-recall.json'),
    chat_completions: absoluteUrl(req, '/v1/chat/completions'),
    models: absoluteUrl(req, '/v1/models'),
    mcp: absoluteUrl(req, '/mcp'),
    health: absoluteUrl(req, '/health'),
    api_health: absoluteUrl(req, '/api/health'),
    instructions: absoluteUrl(req, '/api/instructions'),
    ssss: absoluteUrl(req, '/api/ssss'),
    memory: absoluteUrl(req, '/api/memory'),
    api_keys_dashboard: absoluteUrl(req, '/keys')
  };
}

function listFilesRecursive(root, predicate) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(fullPath, predicate));
    else if (entry.isFile() && predicate(fullPath)) out.push(fullPath);
  }
  return out;
}

function loadCatalogModels(runtimeConfig = {}) {
  const modelFiles = listFilesRecursive(MODEL_CATALOG_DIR, file => path.basename(file) === 'MODEL.md');
  return modelFiles.map((filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const data = parsed.data || {};
    const folderId = path.basename(path.dirname(filePath));
    const id = data.name || `total-recall/${folderId}`;
    const aliases = [...new Set([
      id,
      data.model_id,
      data.name,
      `total-recall/${folderId}`,
      folderId
    ].filter(Boolean))];

    return {
      id,
      object: 'model',
      created: 0,
      owned_by: data.provider || 'total-recall',
      root: runtimeConfig.model || data.model_id || id,
      parent: null,
      aliases,
      metadata: {
        provider: data.provider || 'total-recall',
        provider_type: data.provider_type || 'local-runtime',
        display_name: data.display_name || data.name || id,
        model_id: data.model_id || id,
        runtime_model: runtimeConfig.model || null,
        pricing_prompt: data.pricing_prompt ?? 0,
        pricing_completion: data.pricing_completion ?? 0,
        supports_tools: data.supports_tools ?? true,
        supports_vision: data.supports_vision ?? false,
        supports_code: data.supports_code ?? true
      }
    };
  });
}

function resolveRequestedModel(requestedModel, runtimeConfig) {
  if (!requestedModel) return runtimeConfig.model;
  if (requestedModel === runtimeConfig.model) return requestedModel;

  const catalogModels = loadCatalogModels(runtimeConfig);
  const knownTotalRecallAlias = catalogModels.some(model => model.aliases.includes(requestedModel));
  return knownTotalRecallAlias ? runtimeConfig.model : requestedModel;
}

function ssssReferenceDir() {
  return path.join(SKILLS_DIR, 'ssss', 'references');
}

function listSsssReferences(req) {
  const refsDir = ssssReferenceDir();
  if (!fs.existsSync(refsDir)) return [];
  return fs.readdirSync(refsDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.md$/, '');
      const resource = readTextResource(path.join(refsDir, file), name);
      return {
        name,
        url: absoluteUrl(req, `/api/ssss/references/${name}`),
        sha256: resource?.sha256 || null,
        bytes: resource?.bytes || 0,
        modified: resource?.modified || null
      };
    });
}

function safeReferencePath(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(name || ''))) return null;
  return path.join(ssssReferenceDir(), `${name}.md`);
}

function getSessionId(req) {
  const fromHeader = req.headers['x-session-id'];
  if (typeof fromHeader === 'string' && /^[a-zA-Z0-9_-]{4,64}$/.test(fromHeader)) {
    return fromHeader;
  }
  const cookieSession = req.cookies?.session_id;
  if (typeof cookieSession === 'string' && /^[a-zA-Z0-9_-]{4,64}$/.test(cookieSession)) {
    return cookieSession;
  }
  // Fall back to a date-based id so concurrent unauthenticated requests share a file.
  return `daily-${new Date().toISOString().split('T')[0]}`;
}

function writeSessionRecord(sessionId, record) {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    const file = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
  } catch (err) {
    logger.error('api', `Failed to write session record: ${err.message}`);
  }
}

export const apiRouter = express.Router();

apiRouter.get('/.well-known/total-recall.json', (req, res) => {
  res.json({
    name: 'total-recall',
    display_name: 'Total Recall Sovereign Brain',
    version: '3.0.0',
    protocol_version: 1,
    description: 'Self-hosted SSSS memory, local model gateway, dashboard, and MCP bridge.',
    endpoints: endpointManifest(req),
    auth: {
      type: 'bearer_pat',
      header: 'Authorization: Bearer <token>',
      token_prefix: 'tr_',
      issue_via: [
        'Dashboard: API Keys',
        'CLI: npx total-recall generate-pat --name "client name"'
      ]
    },
    capabilities: [
      'openai-chat-completions',
      'openai-model-list',
      'ssss-rest-resources',
      'mcp-tools',
      'mcp-resources',
      'memory-search',
      'memory-read-write',
      'ide-file-projections'
    ],
    resources: {
      ssss_manifest: absoluteUrl(req, '/api/ssss'),
      instructions: absoluteUrl(req, '/api/ssss/instructions'),
      ssss_skill: absoluteUrl(req, '/api/ssss/skill/ssss'),
      ssss_spec: absoluteUrl(req, '/api/ssss/spec'),
      ssss_references: absoluteUrl(req, '/api/ssss/references')
    }
  });
});

apiRouter.post('/auth/login', loginHandler);
apiRouter.post('/auth/logout', logoutHandler);
apiRouter.post('/auth/change-password', requireAuth, changePasswordHandler);
apiRouter.get('/auth/me', requireAuth, (req, res) => res.json({ authenticated: true }));

apiRouter.use('/v1', apiRateLimiter(), requireAuth);
apiRouter.use('/api', requireAuth);

// ─── Chat Completions ──────────────────────────────────────────────────────────

apiRouter.get('/v1/models', requireScope('models:read'), (req, res) => {
  const runtimeConfig = loadRuntimeConfig(path.join(CONFIG_DIR, 'runtime.yml'));
  const catalogModels = loadCatalogModels(runtimeConfig);
  const data = catalogModels.length > 0
    ? catalogModels
    : [{
        id: runtimeConfig.model,
        object: 'model',
        created: 0,
        owned_by: 'total-recall',
        root: runtimeConfig.model,
        parent: null,
        aliases: [runtimeConfig.model],
        metadata: {
          provider: 'total-recall',
          provider_type: runtimeConfig.runtime || 'local-runtime',
          display_name: runtimeConfig.model,
          model_id: runtimeConfig.model,
          runtime_model: runtimeConfig.model,
          pricing_prompt: 0,
          pricing_completion: 0,
          supports_tools: true,
          supports_vision: false,
          supports_code: true
        }
      }];

  res.json({ object: 'list', data });
});

apiRouter.post('/v1/chat/completions', requireScope('chat:write'), async (req, res) => {
  try {
    const frontierConfigPath = path.join(CONFIG_DIR, 'frontier.yml');
    const runtimeConfigPath = path.join(CONFIG_DIR, 'runtime.yml');
    
    const { messages, model, temperature } = req.body;
    
    console.error(`\n[API] === NEW CHAT REQUEST ===`);
    console.error(`[API] Messages count: ${messages?.length || 0}`);
    if (messages && messages.length > 0) {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) console.error(`[API] User Prompt: "${lastUserMsg.content.slice(0, 150)}${lastUserMsg.content.length > 150 ? '...' : ''}"`);
    }
    
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    
    let activeConfig = null;
    let isLocal = false;

    // Determine whether to use local runtime or frontier
    if (fs.existsSync(runtimeConfigPath)) {
      const rtConfig = loadRuntimeConfig(runtimeConfigPath);
      const health = await checkRuntimeHealth(rtConfig);
      if (health.status === 'healthy') {
        activeConfig = {
          ...rtConfig,
          model: resolveRequestedModel(model, rtConfig),
          response_model: model || rtConfig.model,
          temperature: temperature || rtConfig.temperature
        };
        isLocal = true;
      }
    }
    
    if (!isLocal) {
      const fConfig = loadFrontierConfig(frontierConfigPath);
      activeConfig = fConfig.local?.endpoint ? {
        ...fConfig,
        endpoint: fConfig.local.endpoint,
        model: resolveRequestedModel(model, { model: fConfig.local.model || fConfig.model }),
        response_model: model || fConfig.local.model || fConfig.model,
        temperature: temperature || fConfig.temperature,
        api_key: null
      } : {
        ...fConfig,
        model: model || fConfig.model,
        response_model: model || fConfig.model,
        temperature: temperature || fConfig.temperature
      };
    }


    const dateStr = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZoneName: 'short' });
    let baseSystemPrompt = `You are Total Recall, a Sovereign AI OS running a database-free, Markdown-first Structured Semantic Syntax System (SSSS) architecture. The current date and time is ${dateStr}. 
CRITICAL RULE: You are equipped with 'search_web', 'execute_code', and 'update_design' tools. You MUST use 'search_web' to answer questions about current events or facts outside your training. You MUST use 'execute_code' to write scripts or integrate with APIs. You MUST use 'update_design' to write markdown directly to the Sandbox DESIGN.md file when the user asks you to create a UI, page, or document.`;

    try {
      const instructionsPath = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
      if (fs.existsSync(instructionsPath)) {
        const instructions = fs.readFileSync(instructionsPath, 'utf8');
        baseSystemPrompt += `\n\n=== TIER 1 HOT MEMORY INSTRUCTIONS ===\n${instructions}`;
      }

      const ssssPath = path.join(AGENT_DIR, 'skills', 'ssss', 'SKILL.md');
      if (fs.existsSync(ssssPath)) {
        const ssssContent = fs.readFileSync(ssssPath, 'utf8');
        baseSystemPrompt += `\n\n=== STRUCTURED SEMANTIC SYNTAX SYSTEM (SSSS) DOCUMENTATION ===\nYou are the orchestrator of this system. Here is the architectural specification:\n${ssssContent}`;
      }

      // Load user profile — drives all personalisation and idle work
      const profilePath = path.join(AGENT_DIR, 'memory-vault', 'preferences', 'user-profile.md');
      const prioritiesPath = path.join(AGENT_DIR, 'memory-vault', 'preferences', 'user-priorities.md');
      const interviewTaskPath = path.join(AGENT_DIR, 'scheduler', 'queue', 'onboarding-interview.md');

      if (fs.existsSync(profilePath)) {
        const profile = fs.readFileSync(profilePath, 'utf8');
        baseSystemPrompt += `\n\n=== USER PROFILE ===\n${profile}`;
        if (fs.existsSync(prioritiesPath)) {
          const priorities = fs.readFileSync(prioritiesPath, 'utf8');
          baseSystemPrompt += `\n\n=== USER PRIORITIES & GOALS ===\n${priorities}`;
        }
      } else if (fs.existsSync(interviewTaskPath)) {
        // No profile yet — enter interview mode
        const interviewTask = fs.readFileSync(interviewTaskPath, 'utf8');
        baseSystemPrompt += `\n\n=== ONBOARDING INTERVIEW MODE ===
This user has not been onboarded yet. You MUST conduct the onboarding interview before doing anything else.
DO NOT answer any other questions until the interview is complete.
Ask questions one at a time, warmly and conversationally. Listen carefully. Reflect back what you hear.
After the interview, write the user's answers to:
  - ${AGENT_DIR}/memory-vault/preferences/user-profile.md
  - ${AGENT_DIR}/memory-vault/preferences/user-priorities.md
  - ${AGENT_DIR}/memory-vault/preferences/user-interests.md
Then mark ${interviewTaskPath} as status: done.

INTERVIEW TASK:
${interviewTask}`;
      }
    } catch (e) {
      console.error('[API] Failed to load system documentation:', e.message);

    }

    let currentMessages = [...messages];
    if (currentMessages.length > 0 && currentMessages[0].role === 'system') {
      currentMessages[0].content = `${baseSystemPrompt}\n\n${currentMessages[0].content}`;
    } else {
      currentMessages.unshift({ role: 'system', content: baseSystemPrompt });
    }
    let finalMessage = null;
    const startTime = Date.now();

    // Tool loop (up to 5 iterations to prevent infinite loops)
    for (let i = 0; i < 5; i++) {
      console.error(`[API] Invoking ${isLocal ? 'local' : 'frontier'} model (Iteration ${i + 1})...`);
      const message = isLocal 
        ? await callLocalRuntimeRaw(currentMessages, activeConfig, AVAILABLE_TOOLS)
        : await callFrontierRaw(currentMessages, activeConfig, AVAILABLE_TOOLS);
      currentMessages.push(message);

      if (message.tool_calls && message.tool_calls.length > 0) {
        // Execute tools
        for (const toolCall of message.tool_calls) {
          console.error(`[API] Executing tool: ${toolCall.function.name}`);
          const toolResult = await handleToolCall(toolCall);
          currentMessages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id
          });
        }
      } else {
        finalMessage = message;
        break;
      }
    }

    if (!finalMessage) {
      finalMessage = currentMessages[currentMessages.length - 1];
    }
    
    const elapsedMs = Date.now() - startTime;
    const elapsed = (elapsedMs / 1000).toFixed(2);
    console.error(`[API] === CHAT RESPONSE GENERATED (${elapsed}s) ===`);
    if (finalMessage.content) {
      console.error(`[API] Response: "${finalMessage.content.slice(0, 150)}${finalMessage.content.length > 150 ? '...' : ''}"`);
    } else if (finalMessage.tool_calls) {
      console.error(`[API] Response: [Triggered ${finalMessage.tool_calls.length} tool calls]`);
    }

    // Persist this exchange so dream-cycle Light Sleep can scan it for candidates.
    const sessionId = getSessionId(req);
    const promptText = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');
    const promptTokens = Math.ceil((promptText.length || 0) / 4);
    const completionTokens = Math.ceil(((finalMessage.content || '').length || 0) / 4);
    writeSessionRecord(sessionId, {
      id: `exchange-${crypto.randomUUID()}`,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      model: activeConfig.model,
      latency_ms: elapsedMs,
      messages: currentMessages,
      response: finalMessage,
      tokens: promptTokens + completionTokens
    });
    // Emit latency + tokens so the watchdog log monitor can react to anomalies.
    logger.info('api', 'chat exchange completed', {
      session_id: sessionId,
      latency_ms: elapsedMs,
      tokens: promptTokens + completionTokens
    });

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: activeConfig.response_model || activeConfig.model,
      choices: [
        {
          index: 0,
          message: finalMessage,
          finish_reason: finalMessage.tool_calls ? 'tool_calls' : 'stop'
        }
      ]
    });
  } catch (error) {
    console.error('[API Error]', error);
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/v1/chat/history', requireAuth, requireScope('chat:read'), (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const file = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(file)) {
      return res.json({ messages: [] });
    }
    
    // Read the file and parse the last valid JSON line
    const content = fs.readFileSync(file, 'utf8').trim().split('\n');
    if (content.length === 0 || !content[0]) {
      return res.json({ messages: [] });
    }
    
    // The last exchange contains the cumulative messages
    const lastLine = content[content.length - 1];
    const record = JSON.parse(lastLine);
    
    // Filter out system messages so they don't clutter the UI
    const chatHistory = (record.messages || [])
      .filter(m => m.role !== 'system')
      .map((m, idx) => ({
        id: `hist-${idx}`,
        role: m.role,
        content: m.content,
        timestamp: new Date(record.timestamp).getTime(),
        versions: [m.content],
        currentVersionIndex: 0
      }));
      
    res.json({ messages: chatHistory });
  } catch (err) {
    console.error('[API] Error loading chat history:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Session sync (UltraChat Sync Fabric) ────────────────────────────────────────
// VFS markdown sessions ↔ UltraChat: list, fetch, and ingest external sessions.

apiRouter.get('/api/sessions', requireAuth, requireScope('chat:read'), (req, res) => {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return res.json({ sessions: [] });
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
    const sessions = files.map(f => {
      const id = f.replace(/\.jsonl$/, '');
      const stat = fs.statSync(path.join(SESSIONS_DIR, f));
      return { id, size: stat.size, modified: stat.mtime.toISOString() };
    }).sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/api/sessions/:id', requireAuth, requireScope('chat:read'), (req, res) => {
  const id = req.params.id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return res.status(400).json({ error: 'Invalid session id' });
  const file = path.join(SESSIONS_DIR, `${id}.jsonl`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Session not found' });
  try {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    res.json({ id, exchanges: lines });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/sessions/ingest', requireAuth, requireScope('chat:write'), (req, res) => {
  try {
    const { id, messages, source } = req.body || {};
    if (!id || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Required: id (string) and messages (array)' });
    }
    const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const file = path.join(SESSIONS_DIR, `${safeId}.jsonl`);
    const record = JSON.stringify({
      session_id: safeId,
      source: source || 'ultrachat',
      timestamp: new Date().toISOString(),
      messages
    });
    fs.appendFileSync(file, record + '\n', 'utf8');
    res.json({ ok: true, id: safeId, file });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Voice / TTS (Kokoro / System) ───────────────────────────────────────────────

apiRouter.get('/api/tts/status', requireScope('tts:use'), (_req, res) => {
  res.json({ enabled: isTtsEnabled() });
});

apiRouter.post('/api/tts', requireScope('tts:use'), async (req, res) => {
  try {
    const { text, voice, format, speed } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Missing or empty `text` field.' });
    }
    if (text.length > 5000) {
      return res.status(413).json({ error: 'Text exceeds 5000-character limit.' });
    }

    const { buffer, mimeType } = await synthesizeTts(text, { voice, format, speed });
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    if (err instanceof TtsNotConfiguredError) {
      return res.status(503).json({ error: err.message, code: err.code });
    }
    logger.error('api', `TTS error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Instructions (sync consumers) ─────────────────────────────────────────────

apiRouter.get('/api/instructions', requireScope('instructions:read'), (req, res) => {
  return sendTextResource(res, INSTRUCTIONS_FILE, 'instructions');
});

// ─── SSSS Resources (sync and integration consumers) ─────────────────────────

apiRouter.get('/api/ssss', requireScope('ssss:read'), (req, res) => {
  const resources = {
    instructions: {
      name: 'instructions',
      url: absoluteUrl(req, '/api/ssss/instructions'),
      ...(() => {
        const r = readTextResource(INSTRUCTIONS_FILE, 'instructions');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    skill: {
      name: 'ssss-skill',
      url: absoluteUrl(req, '/api/ssss/skill/ssss'),
      ...(() => {
        const r = readTextResource(path.join(SKILLS_DIR, 'ssss', 'SKILL.md'), 'ssss-skill');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    spec: {
      name: 'ssss-spec',
      url: absoluteUrl(req, '/api/ssss/spec'),
      ...(() => {
        const r = readTextResource(path.join(ssssReferenceDir(), 'ssss-spec.md'), 'ssss-spec');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    references: listSsssReferences(req)
  };

  res.json({
    name: 'ssss',
    schema_version: 2,
    resources
  });
});

apiRouter.get('/api/ssss/instructions', requireScope('ssss:read', 'instructions:read'), (_req, res) => {
  return sendTextResource(res, INSTRUCTIONS_FILE, 'instructions');
});

apiRouter.get('/api/ssss/skill/ssss', requireScope('ssss:read'), (_req, res) => {
  return sendTextResource(res, path.join(SKILLS_DIR, 'ssss', 'SKILL.md'), 'ssss-skill');
});

apiRouter.get('/api/ssss/spec', requireScope('ssss:read'), (_req, res) => {
  return sendTextResource(res, path.join(ssssReferenceDir(), 'ssss-spec.md'), 'ssss-spec');
});

apiRouter.get('/api/ssss/references', requireScope('ssss:read'), (req, res) => {
  res.json({ references: listSsssReferences(req) });
});

apiRouter.get('/api/ssss/references/:name', requireScope('ssss:read'), (req, res) => {
  const filePath = safeReferencePath(req.params.name);
  if (!filePath) return res.status(400).json({ error: 'Invalid reference name' });
  return sendTextResource(res, filePath, req.params.name);
});

// ─── Files API ─────────────────────────────────────────────────────────────────

apiRouter.get('/api/files', requireScope('files:read'), (req, res) => {
  try {
    if (!fs.existsSync(FILES_DIR)) {
      fs.mkdirSync(FILES_DIR, { recursive: true });
    }
    const files = fs.readdirSync(FILES_DIR).map(file => {
      const stats = fs.statSync(path.join(FILES_DIR, file));
      return {
        name: file,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Skills API ────────────────────────────────────────────────────────────────



apiRouter.get('/api/skills', requireScope('files:read', 'ssss:read'), (req, res) => {
  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }
    const skills = fs.readdirSync(SKILLS_DIR).map(dir => {
      const dirPath = path.join(SKILLS_DIR, dir);
      const stats = fs.statSync(dirPath);
      return {
        name: dir,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    });
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Tasks API ─────────────────────────────────────────────────────────────────

apiRouter.get('/api/tasks', requireScope('tasks:read'), (req, res) => {
  try {
    if (!fs.existsSync(TASKS_DIR)) {
      return res.json([]);
    }
    const tasks = [];
    const files = fs.readdirSync(TASKS_DIR);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      try {
        const raw = fs.readFileSync(path.join(TASKS_DIR, file), 'utf8');
        const { data, content } = matter(raw);
        tasks.push({ ...data, body: content.trim(), slug: file.replace('.md', '') });
      } catch (e) {
        // skip
      }
    }
    res.json(tasks.sort((a, b) => (a.priority || 5) - (b.priority || 5)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/api/tasks', requireScope('tasks:write'), (req, res) => {
  try {
    const { category, target, body, priority = 5 } = req.body;
    if (!category || !target) {
      return res.status(400).json({ error: 'Missing category or target' });
    }
    if (!fs.existsSync(TASKS_DIR)) {
      fs.mkdirSync(TASKS_DIR, { recursive: true });
    }
    const slug = `task-${Date.now()}`;
    const frontmatter = {
      type: 'task',
      priority,
      category,
      target,
      estimated_calls: 5,
      deadline: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      created_by: 'api',
      reason: 'User requested deep research via Chat UI',
      status: 'pending',
      progress: 0
    };
    const raw = matter.stringify(body || '', frontmatter);
    fs.writeFileSync(path.join(TASKS_DIR, `${slug}.md`), raw, 'utf8');
    res.json({ slug, ...frontmatter });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Config API ────────────────────────────────────────────────────────────────

apiRouter.get('/api/config/:name', requireScope('config:read'), (req, res) => {
  try {
    const filePath = path.join(CONFIG_DIR, req.params.name);
    if (!fs.existsSync(filePath)) {
      if (req.params.name === 'DESIGN.md') {
        return res.json({ content: '# Design System\n\nPreview your markdown here.' });
      }
      return res.json({ content: '' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put('/api/config/:name', requireScope('config:write'), (req, res) => {
  try {
    const filePath = path.join(CONFIG_DIR, req.params.name);
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, req.body.content, 'utf8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── API Key Lifecycle ──────────────────────────────────────────────────────────

// List all keys (tokens are masked after creation)
apiRouter.get('/api/keys', requireAuth, requireScope('keys:read'), (req, res) => {
  try {
    const keys = loadKeys().map(k => ({
      id: k.id,
      name: k.name,
      token_preview: k.token_prefix ? `${k.token_prefix}...` : '—',
      scopes: k.scopes || ['*'],
      expires_at: k.expires_at || null,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
      hit_count: k.hit_count || 0,
      revoked: k.revoked || false,
    }));
    res.json({ keys, available_scopes: KNOWN_SCOPES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Issue a new key — returns the full token ONCE
apiRouter.post('/api/keys', requireAuth, requireScope('keys:write'), (req, res) => {
  try {
    const { name, scopes, expires_at } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return res.status(400).json({ error: 'A key name is required.' });
    }
    const key = issueKey(name.trim(), { scopes, expires_at });
    logger.info('api', `API key issued: ${key.name} (${key.id})`);
    const { token_hash, ...responseKey } = key;
    res.status(201).json(responseKey); // full token returned here only
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke a key by ID
apiRouter.delete('/api/keys/:id', requireAuth, requireScope('keys:write'), (req, res) => {
  try {
    const key = revokeKey(req.params.id);
    if (!key) return res.status(404).json({ error: 'Key not found.' });
    logger.info('api', `API key revoked: ${key.name} (${key.id})`);
    res.json({ success: true, id: key.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Memory REST API (replaces MCP for dashboard) ──────────────────────────────

apiRouter.get('/api/memory', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const { category, status } = req.query;
    const nodes = loadNodes(VAULT_DIR)
      .filter(n => !category || n.category === category)
      .filter(n => !status || n.status === status)
      .map(({ body, ...n }) => n);
    res.json(nodes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/api/memory/search', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const { q, category, limit = 20 } = req.query;
    if (!q) return res.status(400).json({ error: 'q is required' });
    const nodes = loadNodes(VAULT_DIR)
      .filter(n => n.status === 'active')
      .filter(n => !category || n.category === category)
      .filter(n => [n.title, n.slug, (n.tags||[]).join(' '), n.body||''].join(' ').toLowerCase().includes(String(q).toLowerCase()))
      .slice(0, Number(limit))
      .map(n => ({ slug: n.slug, title: n.title, category: n.category, importance: n.importance, excerpt: (n.body||'').slice(0, 200) }));
    res.json(nodes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/api/memory/:slug', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const node = loadNodes(VAULT_DIR).find(n => n.slug === req.params.slug);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    res.json(node);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

apiRouter.post('/api/memory', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const { slug, title, category, content } = req.body;
    if (!slug || !title || !category) return res.status(400).json({ error: 'slug, title, category required' });
    const node = createNodeFromMcpPayload({ slug, title, category, content: content || '' });
    writeNode(node, VAULT_DIR);
    res.status(201).json({ slug, written: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

apiRouter.post('/api/memory/recompile', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const stats = await compileSurface({ vaultDir: VAULT_DIR, skillsDir: SKILLS_DIR, derivedDir: DERIVED_DIR, instructionsFile: INSTRUCTIONS_FILE });
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Quick Capture — Slack / Discord inbound webhooks ────────────────────────────
// Feature: Phase 8 quick-capture (parallel to future Telegram path).
// Writes inbound messages as draft SSSS inbox nodes for Dream Cycle synthesis.

apiRouter.post('/api/capture/:source', requireAuth, requireScope('memory:write'), async (req, res) => {
  const { source } = req.params;
  if (!['slack', 'discord'].includes(source)) {
    return res.status(400).json({ error: 'source must be "slack" or "discord"' });
  }
  try {
    const { captureMessage } = await import('../core/quick-capture.mjs');
    const body = req.body || {};
    // Normalise Slack and Discord payload shapes
    const text = body.text || body.content || body.message || '';
    const author = body.user?.name || body.user_name || body.author?.username || body.username || null;
    const channel = body.channel?.name || body.channel_name || body.channel_id || null;
    if (!text.trim()) return res.status(400).json({ error: 'No message text found in payload' });
    const result = captureMessage({ text, author, channel, source });
    res.json({ ok: true, slug: result.slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Dashboard Intelligence Endpoints (feature-flagged) ──────────────────────────
// Feature flag: presence of ~/.agent/memory-vault/preferences/dashboard-enhanced.md

function isDashboardEnhanced() {
  return fs.existsSync(path.join(VAULT_DIR, '..', 'preferences', 'dashboard-enhanced.md'));
}

apiRouter.get('/api/graph', requireAuth, requireScope('ssss:read'), (req, res) => {
  if (!isDashboardEnhanced()) {
    return res.status(404).json({ error: 'dashboard-enhanced feature flag not enabled' });
  }
  try {
    const graphFile = path.join(DERIVED_DIR, 'graph-index.jsonl');
    const routesFile = path.join(DERIVED_DIR, 'skill-routes.jsonl');
    const nodes = fs.existsSync(graphFile)
      ? fs.readFileSync(graphFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      : [];
    const routes = fs.existsSync(routesFile)
      ? fs.readFileSync(routesFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      : [];
    res.json({ nodes, routes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

apiRouter.get('/api/conflicts', requireAuth, requireScope('ssss:read'), async (req, res) => {
  if (!isDashboardEnhanced()) {
    return res.status(404).json({ error: 'dashboard-enhanced feature flag not enabled' });
  }
  try {
    const { detectSemanticConflicts } = await import('../core/conflict-detector.mjs');
    const { loadNodes } = await import('../core/surface.mjs');
    const nodes = loadNodes(VAULT_DIR);
    const conflicts = [];
    for (let i = 0; i < nodes.length; i++) {
      const found = detectSemanticConflicts(nodes[i], nodes.slice(0, i));
      conflicts.push(...found);
    }
    res.json({ conflicts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Sandbox REST API (replaces MCP for dashboard) ─────────────────────────────

apiRouter.post('/api/sandbox', requireAuth, requireScope('sandbox:run'), async (req, res) => {
  const { code, timeout_ms = 5000 } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });
  const tmpPath = path.join(os.tmpdir(), `sandbox-${Date.now()}.mjs`);
  try {
    fs.writeFileSync(tmpPath, code);
    const result = await runInSandbox(tmpPath, timeout_ms);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, output: e.message });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});
