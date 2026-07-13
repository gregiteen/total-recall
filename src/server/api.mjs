import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { callLocalRuntimeRaw, loadRuntimeConfig, checkRuntimeHealth, cleanAndParseJSON } from '../core/runtime.mjs';
import { AVAILABLE_TOOLS, handleToolCall } from './tools.mjs';
import { requireAuth, requireScope, loginHandler, logoutHandler, changePasswordHandler, apiRateLimiter } from './auth.mjs';
import { logger } from '../core/logger.mjs';
import { synthesize as synthesizeTts, isTtsEnabled, TtsNotConfiguredError } from '../core/tts.mjs';
import { KNOWN_SCOPES, loadKeys, issueKey, revokeKey } from './keys.mjs';
import { writeNode } from '../core/vault.mjs';
import { getNodes } from '../core/vault-cache.mjs';
import { compileSurface } from '../core/surface.mjs';
import { runInSandbox } from '../core/sandbox.mjs';
import { resolveAgentDir } from '../cli/agent-dir.mjs';
import { removeSessionEmbeddingFromIndex } from '../core/embeddings.mjs';
import path from 'path';
import os from 'os';
import fs from 'fs';
import matter from 'gray-matter';
import { agentDir, brainDir } from '../core/config.mjs';

const AGENT_DIR = process.env.AGENT_DIR || agentDir;
const BRAIN_DIR = process.env.TR_BRAIN || path.join(AGENT_DIR, 'skills', 'total-recall');
const VAULT_DIR = path.join(BRAIN_DIR, 'memory-vault');
const SKILLS_DIR = path.join(AGENT_DIR, 'skills');
const DERIVED_DIR = path.join(BRAIN_DIR, 'memory-derived');
const INSTRUCTIONS_FILE = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
const SESSIONS_DIR = path.join(BRAIN_DIR, 'sessions');
const FILES_DIR = path.join(BRAIN_DIR, 'files');
const TASKS_DIR = path.join(BRAIN_DIR, 'scheduler', 'queue');
const CONFIG_DIR = path.join(BRAIN_DIR, 'config');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL_CATALOG_DIR = path.join(ROOT, 'models', 'catalog', 'total-recall');

/**
 * Resolve a brain-specific vault directory from a brain ID string.
 *
 * @param {string|undefined} brainId - 'global', 'project:<name>', or undefined
 * @returns {string} Absolute path to the memory-vault directory
 */
function resolveVaultDir(brainId) {
  if (!brainId || brainId === 'global') {
    return VAULT_DIR;
  }

  if (brainId.startsWith('project:')) {
    const projectName = brainId.slice('project:'.length);
    const globalBrainDir = path.join(os.homedir(), '.agent', 'skills', 'total-recall');
    const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');

    if (fs.existsSync(registryPath)) {
      try {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        const project = registry.find(p => p.name === projectName);
        if (project) {
          const projectVaultDir = path.join(project.brainDir, 'memory-vault');
          if (fs.existsSync(projectVaultDir)) {
            return projectVaultDir;
          }
        }
      } catch {
        // Registry parse error — fall through to default
      }
    }
  }

  return VAULT_DIR;
}

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
  const candidates = [
    path.join(SKILLS_DIR, 'total-recall', 'references'),
    path.join(SKILLS_DIR, 'total-recall', 'modules', 'ssss', 'references'),
    path.join(SKILLS_DIR, 'okf', 'references'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
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
  const fromQuery = req.query?.sessionId;
  if (typeof fromQuery === 'string' && /^[a-zA-Z0-9_-]{4,64}$/.test(fromQuery)) {
    return fromQuery;
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

apiRouter.use('/v1', apiRateLimiter(), requireAuth);

function extractToolCallsFromContent(content) {
  if (!content || typeof content !== 'string') return [];
  const toolCalls = [];

  // 1. Look for <tool_call>...</tool_call> tags
  const matches = [...content.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g)];
  for (const match of matches) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed.name) {
        toolCalls.push({
          id: `call_${crypto.randomUUID()}`,
          type: 'function',
          function: {
            name: parsed.name,
            arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments || {})
          }
        });
      }
    } catch {
      try {
        const parsed = cleanAndParseJSON(raw);
        if (parsed && parsed.name) {
          toolCalls.push({
            id: `call_${crypto.randomUUID()}`,
            type: 'function',
            function: {
              name: parsed.name,
              arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments || {})
            }
          });
        }
      } catch {}
    }
  }

  // 2. If no tag-based tool calls found, check for json markdown blocks
  if (toolCalls.length === 0) {
    const jsonBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonBlockMatch) {
      const raw = jsonBlockMatch[1].trim();
      try {
        const parsed = JSON.parse(raw);
        if (parsed.name && parsed.arguments) {
          toolCalls.push({
            id: `call_${crypto.randomUUID()}`,
            type: 'function',
            function: {
              name: parsed.name,
              arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments || {})
            }
          });
        }
      } catch {
        try {
          const parsed = cleanAndParseJSON(raw);
          if (parsed && parsed.name && parsed.arguments) {
            toolCalls.push({
              id: `call_${crypto.randomUUID()}`,
              type: 'function',
              function: {
                name: parsed.name,
                arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments || {})
              }
            });
          }
        } catch {}
      }
    }
  }

  // 3. If still none, check if the entire content is a raw JSON block representing a tool call
  if (toolCalls.length === 0) {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.name && parsed.arguments) {
          toolCalls.push({
            id: `call_${crypto.randomUUID()}`,
            type: 'function',
            function: {
              name: parsed.name,
              arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments || {})
            }
          });
        }
      } catch {
        try {
          const parsed = cleanAndParseJSON(trimmed);
          if (parsed && parsed.name && parsed.arguments) {
            toolCalls.push({
              id: `call_${crypto.randomUUID()}`,
              type: 'function',
              function: {
                name: parsed.name,
                arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments || {})
              }
            });
          }
        } catch {}
      }
    }
  }

  return toolCalls;
}

// ─── Chat Completions ──────────────────────────────────────────────────────────

apiRouter.post('/v1/chat/completions', requireScope('chat:write'), async (req, res) => {
  try {
    const runtimeConfigPath = path.join(CONFIG_DIR, 'runtime.yml');
    
    const { messages, model, temperature, groundingNodes, brainId } = req.body;
    
    logger.info('api', '=== NEW CHAT REQUEST ===');
    logger.info('api', `Messages count: ${messages?.length || 0}`);
    if (messages && messages.length > 0) {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) logger.info('api', `User Prompt: "${lastUserMsg.content.slice(0, 150)}${lastUserMsg.content.length > 150 ? '...' : ''}"`);
    }
    
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    
    const rtConfig = loadRuntimeConfig();
    const activeConfig = {
      ...rtConfig,
      model: resolveRequestedModel(model, rtConfig),
      response_model: model || rtConfig.model,
      temperature: temperature || rtConfig.temperature
    };

    // If the requested model matches one of our CLI agents, elevate that agent to highest priority
    if (model && activeConfig.agents) {
      let targetAgentName = model.toLowerCase();
      let subModel = null;
      if (targetAgentName.includes(':')) {
        const parts = targetAgentName.split(':');
        targetAgentName = parts[0];
        subModel = parts[1];
      } else if (targetAgentName.includes('/')) {
        const parts = targetAgentName.split('/');
        targetAgentName = parts[0];
        subModel = parts[1];
      }

      const idx = activeConfig.agents.findIndex(a => a.name === targetAgentName);
      if (idx >= 0) {
        // Deep copy the agents list so we don't mutate the cached config
        activeConfig.agents = activeConfig.agents.map(a => ({ ...a }));
        activeConfig.agents[idx].priority = 0;
        if (subModel) {
          activeConfig.agents[idx].model = subModel;
        }
        activeConfig.agents.sort((a, b) => a.priority - b.priority);
        logger.info('api', `Elevated priority of agent "${targetAgentName}" to 0 based on model request.${subModel ? ` Submodel set to "${subModel}"` : ''}`);
      }
    }


    const dateStr = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZoneName: 'short' });
    let baseSystemPrompt = `You are Total Recall — portable personal memory for any IDE. Your brain is a database-free, Markdown-first Structured Semantic Syntax System (SSSS) vault on disk. Core loop: write (remember/session) → dream (consolidate) → read (recall + compiled surfaces) → optional daemon tasks. The current date and time is ${dateStr}.
CRITICAL RULES — you have these tools and MUST use them:

BROWSER TOOLS (headless Chromium — use for web tasks):
- 'search_web': ALWAYS use for current events, news, prices, facts outside training data. Never guess.
- 'browser_navigate': Open any URL and read its full content as markdown.
- 'browser_click': Click buttons, links, or elements on the current page by CSS selector or text.
- 'browser_type': Fill in forms or search boxes on the current page.
- 'browser_get_content': Get the full text of whatever page is currently open.
- 'browser_screenshot': Take a screenshot of the current browser page.
- 'browser_eval': Run JavaScript in the current browser page to extract data or interact with APIs.

COMPUTER USE TOOLS (desktop/X11 — use to control apps or the full desktop):
- 'computer_screenshot': Take a screenshot of the entire desktop. Do this FIRST to see what's on screen.
- 'computer_left_click': Click at absolute screen coordinates (x, y).
- 'computer_double_click': Double-click at screen coordinates.
- 'computer_right_click': Right-click at screen coordinates (opens context menus).
- 'computer_mouse_move': Move the mouse without clicking.
- 'computer_type': Type text at the current cursor position.
- 'computer_key': Press a key combo (e.g. "Return", "ctrl+c", "alt+Tab").
- 'computer_scroll': Scroll up or down at screen coordinates.

CODE / MEMORY:
- 'execute_code': Run Node.js to call APIs, process data, or perform calculations.
- 'update_design': Write markdown to DESIGN.md when asked to create a UI or document.

MANDATORY TOOL USE AND CITATION RULES:
1. FORCE SEARCH: If the user asks you to "search", "lookup", "find", or asks about current/recent events or anything you do not explicitly have in your memory vault, you MUST output a tool call to 'search_web' immediately. Do not write a conversational introduction first.
2. CITATION MANDATE: When answering using results from 'search_web' or 'browser_navigate', you MUST explicitly cite your sources by embedding clickable markdown links (e.g., [Source Title](URL)) directly in your response. Never summarize web facts without providing their corresponding URLs.
3. BE DETERMINISTIC: Do not explain what you would do or write placeholders. Always execute the actual tool call.
4. FALLBACK FORMAT: If your runtime does not support native OpenAI-compatible tool calls, or if your tool calls fail to trigger, you MUST write the tool call in your text response wrapped in <tool_call> tags.
Example:
<tool_call>
{
  "name": "search_web",
  "arguments": {
    "query": "precise search keywords here"
  }
}
</tool_call>
Do not add any other conversational text when outputting the fallback tool call. Output it immediately as your entire response.

You have a REAL browser AND full desktop control. Use them. Navigate, click, type, scrape — do not just describe what you would do. For web tasks prefer browser tools. For native apps or desktop workflows use computer_screenshot first to orient yourself.`;

    const compressInstructions = (text) => {
      if (!text) return '';
      if (text.length < 1000) return text;
      const sections = text.split(/\r?\n(?=#+ )/);
      const result = [];
      for (const sec of sections) {
        const trimmed = sec.trim();
        if (!trimmed) continue;
        const lines = trimmed.split('\n');
        const header = lines[0];
        if (header.includes('Before You Respond') || header.includes('Topic → Skill Routing')) {
          result.push(trimmed);
          continue;
        }
        if (header.includes('Total Recall System')) {
          let compressed = trimmed;
          compressed = compressed.replace(/```bash\s*curl[\s\S]*?```/g, '(endpoint usage curl example omitted for brevity)');
          result.push(compressed);
          continue;
        }
        if (header.includes('Always reply directly') || header.includes('Do not mention') || header.includes('Operating Protocol') || header.includes('CHECK INTERRUPTS')) {
          const bodyLines = lines.slice(1).filter(l => l.trim()).slice(0, 5);
          result.push(`${header}\n${bodyLines.join('\n')}`);
          continue;
        }
      }
      return result.join('\n\n');
    };

    const compressSsssSkill = (text) => {
      if (!text) return '';
      if (text.length < 1000) return text;
      const sections = text.split(/\r?\n(?=#+ )/);
      const result = [];
      for (const sec of sections) {
        const trimmed = sec.trim();
        if (!trimmed) continue;
        const lines = trimmed.split('\n');
        const header = lines[0];
        if (!header.startsWith('#')) {
          result.push(trimmed);
          continue;
        }
        if (header.includes('Core Mandate') || header.includes('Three-Tier Memory Hierarchy') || header.includes('Cognitive Memory Layers') || header.includes('Vault Directory Layout')) {
          result.push(trimmed);
          continue;
        }
        if (header.includes('File Types') || header.includes('Derived Artifacts') || header.includes('Staging Area') || header.includes('Interoperability') || header.includes('Naming Conventions')) {
          result.push(`${header}\n\n[SSSS architectural specifications compressed. Refer to ssss/SKILL.md or references/ssss-spec.md for schema details]`);
          continue;
        }
        if (trimmed.length < 800) {
          result.push(trimmed);
        }
      }
      return result.join('\n\n');
    };

    try {
      const instructionsPath = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
      if (fs.existsSync(instructionsPath)) {
        const instructions = fs.readFileSync(instructionsPath, 'utf8');
        baseSystemPrompt += `\n\n=== TIER 1 HOT MEMORY INSTRUCTIONS ===\n${compressInstructions(instructions)}`;
      }

      const ssssCandidates = [
        path.join(AGENT_DIR, 'skills', 'total-recall', 'references', 'ssss-reference.md'),
        path.join(AGENT_DIR, 'skills', 'total-recall', 'SKILL.md'),
      ];
      const ssssPath = ssssCandidates.find((p) => fs.existsSync(p));
      if (ssssPath) {
        const ssssContent = fs.readFileSync(ssssPath, 'utf8');
        baseSystemPrompt += `\n\n=== STRUCTURED SEMANTIC SYNTAX SYSTEM (SSSS) DOCUMENTATION ===\nPrefer @ssss/cli for mutations. Compact reference:\n${compressSsssSkill(ssssContent)}`;
      }

      // Load user profile — drives all personalisation and idle work
      const profilePath = path.join(BRAIN_DIR, 'memory-vault', 'preferences', 'user-profile.md');
      const prioritiesPath = path.join(BRAIN_DIR, 'memory-vault', 'preferences', 'user-priorities.md');
      const interviewTaskPath = path.join(BRAIN_DIR, 'scheduler', 'queue', 'onboarding-interview.md');

      // Self-aware API reference — inject brain URL so the AI can call its own endpoints
      const selfBase = baseUrl(req);
      baseSystemPrompt += `\n\n=== YOUR OWN REST API (call these directly via execute_code or HTTP tools) ===
Base URL: ${selfBase}

MEMORY:
  GET    ${selfBase}/api/memory                    — list all nodes (optional ?type=&tag=)
  GET    ${selfBase}/api/memory/:id                — get one node
  POST   ${selfBase}/api/memory                    — create node  body: {type,title,body,tags,metadata}
  PUT    ${selfBase}/api/memory/:id                — update node
  DELETE ${selfBase}/api/memory/:id                — delete node
  POST   ${selfBase}/api/memory/search             — keyword search  body: {query,type,limit}
  POST   ${selfBase}/api/memory/search/semantic    — semantic (meaning-based) search  body: {query,top_k,include_sessions}
                                                     Returns vault nodes AND session chunks ranked by similarity

RESEARCH QUEUE:
  GET    ${selfBase}/api/research                  — list all research projects (past + pending)  ?status=pending|done|...
  POST   ${selfBase}/api/research                  — queue a new research topic  body: {topic,priority,notes}
  PATCH  ${selfBase}/api/research/:id              — update status/notes/node_slug
  DELETE ${selfBase}/api/research/:id              — remove from queue

VAULT:
  POST   ${selfBase}/api/vault/compile             — recompile INSTRUCTIONS.md + rebuild all embeddings
  GET    ${selfBase}/api/vault/nodes               — list all SSSS nodes with frontmatter
  GET    ${selfBase}/api/vault/surface             — get compiled surface text
  GET    ${selfBase}/api/vault/status              — node count, last compile time

SESSIONS:
  GET    ${selfBase}/api/sessions                  — list ingested sessions
  GET    ${selfBase}/api/sessions/:id              — get session messages
  POST   ${selfBase}/api/sessions/ingest           — ingest a session  body: {source,messages:[{role,content}]}
  DELETE ${selfBase}/api/sessions/:id              — delete session

BRAIN:
  GET    ${selfBase}/api/brain/export              — download full brain as .tar.gz  ?include=vault,derived,sessions,config,skills

CHAT (OpenAI-compatible):
  POST   ${selfBase}/v1/chat/completions           — send a chat message to yourself
  GET    ${selfBase}/v1/models                     — list available models

OTHER:
  GET    ${selfBase}/health                        — health check (vault stats, embedding index sizes, ollama status)
  GET    ${selfBase}/.well-known/total-recall.json — discovery manifest
  GET    ${selfBase}/api/keys                      — list API keys (admin)

Authentication: include  Authorization: Bearer <token>  on all requests (already set for your current session).
Use execute_code to call these endpoints with node's built-in fetch() — you are your own memory system.`;

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
This user has no user-profile yet. Conduct the portable-memory onboarding interview before unrelated work.
Total Recall is personal memory for any IDE (write → dream → read → optional tasks) — not a vendor OS takeover.
Ask questions one at a time, warmly and conversationally. Reflect each answer before the next.
After the interview, write answers to:
   - ${BRAIN_DIR}/memory-vault/preferences/user-profile.md
   - ${BRAIN_DIR}/memory-vault/preferences/user-priorities.md
   - ${BRAIN_DIR}/memory-vault/preferences/user-interests.md
Prefer CLI when available: npx total-recall remember preference "..." --tags user,profile,onboarding
Then mark ${interviewTaskPath} as status: done.

INTERVIEW TASK:
${interviewTask}`;
      }
    } catch (e) {
      logger.error('api', `Failed to load system documentation: ${e.message}`);
    }

    // Support topical grounding context
    if (Array.isArray(groundingNodes) && groundingNodes.length > 0) {
      try {
        const groundingVaultDir = resolveVaultDir(brainId);
        const allNodes = getNodes(groundingVaultDir);
        let groundingPrompt = '\n\n=== ACTIVE GROUNDING BRAIN NODES ===\nThe user has explicitly selected the following brain memory nodes as context for this conversation. Integrate their contents into your knowledge base and refer to them to inform your answers:';
        let groundedAny = false;
        for (const slug of groundingNodes) {
          const node = allNodes.find(n => n.slug === slug);
          if (node) {
            const bodyTruncated = node.body ? (node.body.slice(0, 5000) + (node.body.length > 5000 ? '\n[Truncated for context size]' : '')) : '';
            groundingPrompt += `\n\nNode Slug: ${node.slug}\nTitle: "${node.title || 'Untitled'}"\nCategory: ${node.category || 'unknown'}\n---\n${bodyTruncated}\n---`;
            groundedAny = true;
          }
        }
        if (groundedAny) {
          baseSystemPrompt += groundingPrompt;
        }
      } catch (err) {
        logger.error('api', `Failed to load grounding nodes: ${err.message}`);
      }
    }

    let currentMessages = [...messages];
    if (currentMessages.length > 0 && currentMessages[0].role === 'system') {
      currentMessages[0].content = `${baseSystemPrompt}\n\n${currentMessages[0].content}`;
    } else {
      currentMessages.unshift({ role: 'system', content: baseSystemPrompt });
    }
    let finalMessage = null;
    const startTime = Date.now();

    let useTools = AVAILABLE_TOOLS;
    // Tool loop (up to 5 iterations to prevent infinite loops)
    for (let i = 0; i < 5; i++) {
      logger.info('api', `Invoking local model (Iteration ${i + 1})...`);
      let message;
      try {
        message = await callLocalRuntimeRaw(currentMessages, activeConfig, useTools);
      } catch (err) {
        if (useTools && (err.message.includes('does not support tools') || err.message.includes('invalid_request_error') || err.message.includes('400'))) {
          logger.warn('api', `Local model ${activeConfig.model} does not support native tools. Retrying without tools and with simplified system prompt.`);
          useTools = undefined;
          
          // Overwrite system prompt to protect the CPU/memory footprint of the fallback model
          const systemMsgIdx = currentMessages.findIndex(m => m.role === 'system');
          if (systemMsgIdx !== -1) {
            currentMessages[systemMsgIdx].content = `You are Total Recall — portable personal memory (Markdown vault on disk). The current date and time is ${dateStr}.
You are operating in a lightweight text-only mode. Answer the user's questions directly, concisely, and helpfully without using tools. Keep your responses short and complete.`;
          }
          
          message = await callLocalRuntimeRaw(currentMessages, activeConfig, undefined);
        } else {
          throw err;
        }
      }
      currentMessages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        const parsedCalls = extractToolCallsFromContent(message.content);
        if (parsedCalls && parsedCalls.length > 0) {
          logger.info('api', `Extracted ${parsedCalls.length} fallback tool calls from text content`);
          message.tool_calls = parsedCalls;
          // Optionally clean content of XML tags to keep user-facing text clean
          message.content = message.content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
          
          // Also handle ```json blocks if they were parsed
          const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/;
          if (jsonBlockRegex.test(message.content)) {
            if (message.content.replace(jsonBlockRegex, '').trim() === '') {
              message.content = '';
            }
          }
        }
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        // Execute tools
        for (const toolCall of message.tool_calls) {
          logger.info('api', `Executing tool: ${toolCall.function.name}`);
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
    logger.info('api', `=== CHAT RESPONSE GENERATED (${elapsed}s) ===`);
    if (finalMessage.content) {
      logger.info('api', `Response: "${finalMessage.content.slice(0, 150)}${finalMessage.content.length > 150 ? '...' : ''}"`);
    } else if (finalMessage.tool_calls) {
      logger.info('api', `Response: [Triggered ${finalMessage.tool_calls.length} tool calls]`);
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
      tokens: promptTokens + completionTokens,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      brain_id: brainId || 'global'
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
    logger.error('api', 'API Error', { error: error.message });
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
    logger.error('api', 'Error loading chat history', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/v1/chat/threads', requireAuth, requireScope('chat:read'), (req, res) => {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(SESSIONS_DIR);
    const threads = [];
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      if (!file.startsWith('thread-')) continue;
      
      const filePath = path.join(SESSIONS_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.size === 0) continue;
      
      try {
        const content = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
        if (content.length === 0) continue;
        
        const firstLine = content[0];
        const firstRecord = JSON.parse(firstLine);
        const messages = firstRecord.messages || [];
        const userMsg = messages.find(m => m.role === 'user');
        
        let title = file.replace(/\.jsonl$/, '');
        if (userMsg && typeof userMsg.content === 'string' && userMsg.content.trim()) {
          const contentStr = userMsg.content.trim();
          title = contentStr.slice(0, 45) + (contentStr.length > 45 ? '...' : '');
        }
        
        const lastLine = content[content.length - 1];
        const lastRecord = JSON.parse(lastLine);
        const lastUpdated = lastRecord.timestamp ? new Date(lastRecord.timestamp).getTime() : stat.mtimeMs;
        const turns = content.length;
        
        threads.push({
          id: file.replace(/\.jsonl$/, ''),
          title,
          turns,
          lastUpdated,
          brainId: firstRecord.brain_id || 'global'
        });
      } catch (err) {
        logger.error('api', `Error reading session file ${file}`, { error: err.message });
      }
    }
    
    threads.sort((a, b) => b.lastUpdated - a.lastUpdated);
    res.json(threads);
  } catch (err) {
    logger.error('api', 'Error listing threads', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/v1/chat/threads/:id', requireAuth, requireScope('chat:write'), (req, res) => {
  try {
    const threadId = req.params.id;
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(threadId)) {
      return res.status(400).json({ error: 'Invalid thread ID format' });
    }
    const file = path.join(SESSIONS_DIR, `${threadId}.jsonl`);
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    
    fs.unlinkSync(file);
    
    try {
      removeSessionEmbeddingFromIndex(DERIVED_DIR, threadId);
    } catch (err) {
      logger.error('api', `Failed to remove session embeddings for ${threadId}`, { error: err.message });
    }
    
    res.json({ deleted: true, id: threadId });
  } catch (err) {
    logger.error('api', 'Error deleting thread', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/v1/chat/suggestions', requireAuth, requireScope('chat:read'), (req, res) => {
  try {
    const suggestionsVaultDir = resolveVaultDir(req.query?.brain);
    const allNodes = getNodes(suggestionsVaultDir);
    // Find active or draft memory nodes that represent facts, concepts, or research
    const candidates = allNodes.filter(n => n.status !== 'archived' && n.category !== 'preferences');

    const suggestions = [];

    // Fact Suggestion
    const factNode = candidates.find(n => n.category === 'facts') || candidates[0];
    if (factNode) {
      suggestions.push({
        type: 'fact',
        title: `🧠 Brain Fact: ${factNode.title}`,
        text: `Let's discuss the facts and findings documented in '**${factNode.title}**'. What else should we analyze?`,
        nodes: [factNode.slug]
      });
    }

    // Concept Suggestion
    const conceptNode = candidates.find(n => n.category === 'concepts' && n.slug !== (factNode?.slug)) || candidates.find(n => n.slug !== (factNode?.slug));
    if (conceptNode) {
      suggestions.push({
        type: 'concept',
        title: `💡 Concept Idea: ${conceptNode.title}`,
        text: `Regarding the concept '**${conceptNode.title}**', would you like to brainstorm how we can expand this into a production-ready system?`,
        nodes: [conceptNode.slug]
      });
    }

    // Question Suggestion
    const draftNode = candidates.find(n => n.status === 'draft' && n.slug !== (factNode?.slug) && n.slug !== (conceptNode?.slug))
      || candidates.find(n => n.category === 'patterns' && n.slug !== (factNode?.slug) && n.slug !== (conceptNode?.slug))
      || candidates.find(n => n.slug !== (factNode?.slug) && n.slug !== (conceptNode?.slug));
    if (draftNode) {
      suggestions.push({
        type: 'question',
        title: `❓ Topic Question: ${draftNode.title}`,
        text: `I noticed the '**${draftNode.title}**' node in your vault. Moving forward, how should we prioritize its development or resolve any open design details?`,
        nodes: [draftNode.slug]
      });
    }

    // Default suggestions fallback if vault is mostly empty
    if (suggestions.length < 3) {
      const standardSuggestions = [
        {
          type: 'fact',
          title: '🧠 Memory loop',
          text: 'Walk the portable memory loop: remember → dream → recall, and connect an IDE so surfaces stay in sync.',
          nodes: []
        },
        {
          type: 'concept',
          title: '💡 Skills across any repo',
          text: 'What skills should we track or deploy next? Hosts are equal — skill track any path via the registry.',
          nodes: []
        },
        {
          type: 'question',
          title: '❓ Vault health',
          text: 'Want a vault compile / dream pass so search indexes and instruction surfaces stay synchronized?',
          nodes: []
        }
      ];
      while (suggestions.length < 3 && standardSuggestions.length > 0) {
        const standard = standardSuggestions.shift();
        if (!suggestions.some(s => s.title === standard.title)) {
          suggestions.push(standard);
        }
      }
    }

    res.json(suggestions.slice(0, 3));
  } catch (err) {
    logger.error('api', 'Error loading chat suggestions', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

