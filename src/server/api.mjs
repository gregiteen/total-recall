import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { callFrontier, callFrontierRaw, loadFrontierConfig } from '../core/frontier.mjs';
import { AVAILABLE_TOOLS, handleToolCall } from './tools.mjs';
import { requireAuth, loginHandler, logoutHandler, apiRateLimiter } from './auth.mjs';
import { logger } from '../core/logger.mjs';
import { synthesize as synthesizeTts, isTtsEnabled, TtsNotConfiguredError } from '../core/tts.mjs';
import path from 'path';
import os from 'os';
import fs from 'fs';
import matter from 'gray-matter';

const SESSIONS_DIR = path.join(os.homedir(), '.agent', 'sessions');

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

apiRouter.post('/auth/login', loginHandler);
apiRouter.post('/auth/logout', logoutHandler);
apiRouter.get('/auth/me', requireAuth, (req, res) => res.json({ authenticated: true }));

apiRouter.use('/v1', apiRateLimiter(), requireAuth);
apiRouter.use('/api', requireAuth);

// ─── Chat Completions ──────────────────────────────────────────────────────────

apiRouter.post('/v1/chat/completions', async (req, res) => {
  try {
    const configPath = path.join(os.homedir(), '.agent', 'config', 'frontier.yml');
    const config = loadFrontierConfig(configPath);
    
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

    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userPrompt = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');

    const activeConfig = config.local?.endpoint ? {
      ...config,
      endpoint: config.local.endpoint,
      model: model || config.local.model || config.model,
      temperature: temperature || config.temperature,
      api_key: null
    } : {
      ...config,
      model: model || config.model,
      temperature: temperature || config.temperature
    };

    const dateStr = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZoneName: 'short' });
    let baseSystemPrompt = `You are Total Recall, a Sovereign AI OS running a database-free, Markdown-first Structured Semantic Syntax System (SSSS) architecture. The current date and time is ${dateStr}. 
CRITICAL RULE: You are equipped with 'search_web', 'execute_code', and 'update_design' tools. You MUST use 'search_web' to answer questions about current events or facts outside your training. You MUST use 'execute_code' to write scripts or integrate with APIs. You MUST use 'update_design' to write markdown directly to the Sandbox DESIGN.md file when the user asks you to create a UI, page, or document.`;

    try {
      const instructionsPath = path.join(os.homedir(), '.agent', 'INSTRUCTIONS.md');
      if (fs.existsSync(instructionsPath)) {
        const instructions = fs.readFileSync(instructionsPath, 'utf8');
        baseSystemPrompt += `\n\n=== TIER 1 HOT MEMORY INSTRUCTIONS ===\n${instructions}`;
      }
      
      const ssssPath = path.join(os.homedir(), '.agent', 'skills', 'ssss', 'SKILL.md');
      if (fs.existsSync(ssssPath)) {
        const ssssContent = fs.readFileSync(ssssPath, 'utf8');
        baseSystemPrompt += `\n\n=== STRUCTURED SEMANTIC SYNTAX SYSTEM (SSSS) DOCUMENTATION ===\nYou are the orchestrator of this system. Here is the architectural specification:\n${ssssContent}`;
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
      console.error(`[API] Invoking frontier model (Iteration ${i + 1})...`);
      const message = await callFrontierRaw(currentMessages, activeConfig, AVAILABLE_TOOLS);
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
      model: activeConfig.model,
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

apiRouter.get('/v1/chat/history', requireAuth, (req, res) => {
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

// ─── Voice / TTS (Kokoro / System) ───────────────────────────────────────────────

apiRouter.get('/api/tts/status', (_req, res) => {
  res.json({ enabled: isTtsEnabled() });
});

apiRouter.post('/api/tts', async (req, res) => {
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

apiRouter.get('/api/instructions', (req, res) => {
  try {
    const instructionsPath = path.join(os.homedir(), '.agent', 'INSTRUCTIONS.md');
    if (!fs.existsSync(instructionsPath)) {
      return res.status(404).json({ error: 'INSTRUCTIONS.md not yet compiled' });
    }
    const content = fs.readFileSync(instructionsPath, 'utf8');
    const stat = fs.statSync(instructionsPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    res.json({
      content,
      sha256: hash,
      bytes: stat.size,
      modified: stat.mtime.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Files API ─────────────────────────────────────────────────────────────────

const FILES_DIR = path.join(os.homedir(), '.agent', 'files');

apiRouter.get('/api/files', (req, res) => {
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

const SKILLS_DIR = path.join(os.homedir(), '.agent', 'skills');

apiRouter.get('/api/skills', (req, res) => {
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

const TASKS_DIR = path.join(os.homedir(), '.agent', 'scheduler', 'queue');

apiRouter.get('/api/tasks', (req, res) => {
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

apiRouter.post('/api/tasks', (req, res) => {
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

const CONFIG_DIR = path.join(os.homedir(), '.agent', 'config');

apiRouter.get('/api/config/:name', (req, res) => {
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

apiRouter.put('/api/config/:name', (req, res) => {
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

