/**
 * Quick Capture — ingest Slack/Discord messages as SSSS inbox nodes
 *
 * Classifies incoming message text and writes a draft SSSS memory node
 * to ~/.agent/memory-inbox/ for Dream Cycle synthesis on the next pass.
 * File-native; no external database.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { brainDir, agentDir } from './config.mjs';

function getBrainDir() {
  // Support test overrides: if _TR_TEST_AGENT_DIR is set, derive brainDir from it
  const testDir = process.env._TR_TEST_AGENT_DIR;
  if (testDir && testDir !== agentDir) {
    return path.join(testDir, 'skills', 'total-recall');
  }
  return brainDir;
}

function inboxDir() {
  return path.join(getBrainDir(), 'memory-inbox', 'capture');
}

// ─── Heuristic classifier ────────────────────────────────────────────────────────

const TASK_PATTERNS = [/\bTODO\b/i, /\bremind me\b/i, /\btask:/i, /^(do|fix|add|remove|update|create)\b/i];
const QUESTION_PATTERNS = [/\?$/, /\bhow\b/i, /\bwhat\b/i, /\bwhy\b/i, /\bwhen\b/i];

function classifyMessage(text) {
  if (TASK_PATTERNS.some(p => p.test(text))) return 'task';
  if (QUESTION_PATTERNS.some(p => p.test(text))) return 'observation';
  return 'observation';
}

// ─── Node draft builder ──────────────────────────────────────────────────────────

function buildInboxNode({ text, author, channel, source, ts }) {
  const now = ts || new Date().toISOString();
  const slug = `capture-${source}-${crypto.randomBytes(4).toString('hex')}`;
  const nodeType = classifyMessage(text);

  return {
    slug,
    type: 'memory',
    category: 'capture',
    title: text.slice(0, 80).replace(/\n/g, ' '),
    status: 'draft',
    confidence: 0.5,
    importance: 2,
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: source,
      session_id: slug,
      agent: author || 'unknown',
      evidence_count: 1
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: ['capture', source, channel || 'direct'].filter(Boolean),
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: text.slice(0, 40),
    modality: 'should',
    subject: author || source,
    predicate: nodeType === 'task' ? 'needs_to' : 'observed',
    object: text.slice(0, 120),
    decay: { half_life_days: 30, access_count: 0 },
    schema_version: 2,
    x_memory_layer: 'system1',
    raw_content: text,
    x_temporal_context: now,
    x_citations: [{
      source: source || 'chat',
      title: `Captured message from channel ${channel || 'direct'}`,
      url: `chat://${source}/${channel || 'direct'}`,
      published: now,
      relevance: 1.0,
      accessed: now
    }]
  };
}

// ─── Capture entry point ─────────────────────────────────────────────────────────

/**
 * Write an inbox node from an inbound message.
 *
 * @param {object} opts
 * @param {string} opts.text     Message text content
 * @param {string} [opts.author] Author username / user id
 * @param {string} [opts.channel] Channel name or id
 * @param {string} opts.source   'slack' | 'discord'
 * @param {string} [opts.ts]     ISO timestamp (defaults to now)
 * @returns {{ slug: string, file: string }}
 */
export function captureMessage({ text, author, channel, source, ts }) {
  if (!text || !text.trim()) throw new Error('text is required and must not be empty');
  if (!['slack', 'discord'].includes(source)) throw new Error('source must be "slack" or "discord"');

  const node = buildInboxNode({ text: text.trim(), author, channel, source, ts });

  const dir = inboxDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `${node.slug}.json`);
  fs.writeFileSync(file, JSON.stringify(node, null, 2), 'utf8');

  return { slug: node.slug, file };
}

/**
 * List inbox capture nodes, most recent first.
 * @returns {object[]}
 */
export function listCaptureInbox() {
  const dir = inboxDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.created.localeCompare(a.created));
}
