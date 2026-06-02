import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'crypto';
import { callLocalRuntime, loadRuntimeConfig } from './runtime.mjs';
import { atomicWrite, safeStringify } from './vault.mjs';
import { getNodes } from './vault-cache.mjs';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';

/**
 * Total Recall Session Post-Mortem Engine
 *
 * After each ingested session, the local LLM reads the transcript and extracts:
 *  1. New patterns/preferences observed (→ conscious layer)
 *  2. New facts mentioned (→ research layer, draft status)
 *  3. Skill gaps (→ skill engineering tasks)
 *  4. Rule violations (→ compliance auditor)
 *
 * All outputs are proposals or draft nodes — never direct mutations.
 */

// ─── Constants ──────────────────────────────────────────────────────────────────

const MAX_TRANSCRIPT_CHARS = 12000; // Don't overwhelm the local LLM
const MAX_ENTRIES_PER_SESSION = 100;

// ─── Prompts ────────────────────────────────────────────────────────────────────

const POST_MORTEM_SYSTEM = `You are a Session Post-Mortem Analyst for a sovereign AI memory system called Total Recall.

Your job is to read a conversation transcript between a user and an AI agent, then extract structured insights.

You MUST output valid JSON matching this schema:
{
  "patterns": [
    { "title": "string", "description": "string", "layer": "conscious" }
  ],
  "facts": [
    { "title": "string", "description": "string", "layer": "research" }
  ],
  "skill_gaps": [
    { "topic": "string", "description": "string" }
  ],
  "violations": [
    { "rule": "string", "violation": "string", "suggestion": "string" }
  ]
}

Guidelines:
- "patterns" are user preferences, coding conventions, or workflow habits observed.
- "facts" are specific technical facts mentioned (APIs, tool versions, library behavior).
- "skill_gaps" are topics where the agent struggled or had to improvise.
- "violations" are cases where the agent failed to follow established rules.
- If a category has no items, use an empty array [].
- Output ONLY valid JSON, no markdown fences, no explanation.`;

function buildPostMortemPrompt(transcript, rules) {
  let prompt = `## Conversation Transcript\n${transcript}\n`;
  if (rules.length > 0) {
    prompt += `\n## Active Rules (check for violations)\n`;
    for (const rule of rules) {
      prompt += `- ${rule.title} (modality: ${rule.modality})\n`;
    }
  }
  prompt += '\nExtract patterns, facts, skill gaps, and rule violations as JSON.';
  return prompt;
}

// ─── Session Reading ────────────────────────────────────────────────────────────

/**
 * Read a session JSONL file and produce a readable transcript.
 */
export function readSessionTranscript(sessionPath) {
  if (!fs.existsSync(sessionPath)) return '';

  const raw = fs.readFileSync(sessionPath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];

  for (const line of lines.slice(0, MAX_ENTRIES_PER_SESSION)) {
    try {
      const entry = JSON.parse(line);
      const role = (entry.role || 'assistant').toUpperCase();
      const content = (entry.content || '').slice(0, 2000);
      if (content.trim()) {
        entries.push(`[${role}]: ${content}`);
      }
    } catch {
      // skip malformed
    }
  }

  const transcript = entries.join('\n\n');
  // Truncate to avoid overwhelming the model
  return transcript.slice(0, MAX_TRANSCRIPT_CHARS);
}

// ─── Post-Mortem Execution ──────────────────────────────────────────────────────

/**
 * Run a post-mortem analysis on a single session file.
 *
 * @param {string} sessionPath  Path to the session JSONL file
 * @param {object} opts
 * @param {string} opts.vaultDir      Path to memory vault
 * @param {string} opts.inboxDir      Path to memory inbox
 * @param {string} opts.runtimeConfig Local LLM runtime config
 * @returns {object} { patterns, facts, skill_gaps, violations, error? }
 */
export async function runPostMortem(sessionPath, { vaultDir, inboxDir, runtimeConfig }) {
  const transcript = readSessionTranscript(sessionPath);
  if (!transcript || transcript.length < 50) {
    return { patterns: [], facts: [], skill_gaps: [], violations: [], skipped: 'too-short' };
  }

  // Load active rules for violation checking
  const nodes = getNodes(vaultDir);
  const rules = nodes.filter(n =>
    n.status === 'active' &&
    n.priority === 'absolute' &&
    (n.modality === 'must' || n.modality === 'must_not')
  );

  const prompt = buildPostMortemPrompt(transcript, rules);

  let result;
  try {
    const rawResponse = await callLocalRuntime(prompt, POST_MORTEM_SYSTEM, runtimeConfig);
    // Extract JSON from the response
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }
    result = JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.info({
      subsystem: 'post-mortem',
      message: `LLM analysis failed for ${path.basename(sessionPath)}: ${err.message}`,
    });
    return { patterns: [], facts: [], skill_gaps: [], violations: [], error: err.message };
  }

  // Normalize the result
  const patterns = Array.isArray(result.patterns) ? result.patterns : [];
  const facts = Array.isArray(result.facts) ? result.facts : [];
  const skillGaps = Array.isArray(result.skill_gaps) ? result.skill_gaps : [];
  const violations = Array.isArray(result.violations) ? result.violations : [];

  // Write extractions to appropriate locations
  const sessionSlug = path.basename(sessionPath, '.jsonl');

  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  // Write patterns as conscious-layer draft nodes
  for (const pattern of patterns) {
    writeDraftNode(inboxDir, {
      title: pattern.title || 'Observed Pattern',
      body: pattern.description || '',
      category: 'patterns',
      layer: 'conscious',
      tags: ['post-mortem', 'pattern', 'auto-extracted'],
      sourceSession: sessionSlug,
    });
  }

  // Write facts as research-layer draft nodes
  for (const fact of facts) {
    writeDraftNode(inboxDir, {
      title: fact.title || 'Observed Fact',
      body: fact.description || '',
      category: 'facts',
      layer: 'research',
      tags: ['post-mortem', 'fact', 'auto-extracted'],
      sourceSession: sessionSlug,
    });
  }

  // Write skill gaps as tasks
  const queueDir = path.join(brainDir, 'scheduler', 'queue');
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }

  for (const gap of skillGaps) {
    writeSkillGapTask(queueDir, {
      topic: gap.topic || 'unknown',
      description: gap.description || '',
      sourceSession: sessionSlug,
    });
  }

  logger.info({
    subsystem: 'post-mortem',
    message: `Session ${sessionSlug}: ${patterns.length} patterns, ${facts.length} facts, ${skillGaps.length} gaps, ${violations.length} violations`,
  });

  // Feed session transcript to the research agenda for topic inference
  try {
    const { ingestSessionTopics } = await import('./fact-seeker.mjs');
    const addedTopics = await ingestSessionTopics(transcript, runtimeConfig);
    if (addedTopics.length > 0) {
      logger.info({
        subsystem: 'post-mortem',
        message: `Research agenda: +${addedTopics.length} topics from session "${sessionSlug}"`,
      });
    }
  } catch (err) {
    // Non-fatal — topic inference failure shouldn't block post-mortem results
    logger.info({ subsystem: 'post-mortem', message: `Topic inference skipped: ${err.message}` });
  }

  return { patterns, facts, skill_gaps: skillGaps, violations };
}

// ─── Draft Node Writers ─────────────────────────────────────────────────────────

function writeDraftNode(inboxDir, { title, body, category, layer, tags, sourceSession }) {
  const slug = `pm-${category}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  const frontmatter = {
    type: 'memory',
    slug,
    category,
    title,
    status: 'draft',
    confidence: 0.6,
    importance: 3,
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'dream-cycle',
      session_id: sourceSession,
      agent: 'post-mortem-engine',
      evidence_count: 1,
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags,
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: category,
    modality: 'should',
    subject: 'agent',
    predicate: 'observe',
    object: category,
    decay: { half_life_days: 90, access_count: 1 },
    schema_version: 2,
    x_memory_layer: layer,
    x_temporal_context: now,
    x_citations: [{
      source: 'post-mortem-engine',
      title: `Extracted from session post-mortem: ${sourceSession}`,
      url: `session://${sourceSession}`,
      published: now,
      relevance: 1.0,
      accessed: now
    }]
  };

  const raw = safeStringify(body, frontmatter);
  atomicWrite(path.join(inboxDir, `${slug}.md`), raw);
}

function writeSkillGapTask(queueDir, { topic, description, sourceSession }) {
  const slug = `skill-gap-${topic}-${crypto.randomBytes(3).toString('hex')}`;
  const data = {
    type: 'task',
    slug,
    priority: 40,
    category: 'skill-engineering',
    status: 'pending',
    created_by: 'post-mortem-engine',
    source_session: sourceSession,
    reason: `Agent struggled with topic "${topic}" during a conversation.`,
  };

  const body = `## Objective\nThe agent encountered a skill gap for "${topic}".\n\n${description}\n\n## Steps\n1. Research the topic.\n2. Check if an existing skill covers it.\n3. If not, draft a new SKILL.md.`;

  atomicWrite(path.join(queueDir, `${slug}.md`), safeStringify(body, data));
}

// ─── Rule Compliance Auditor ────────────────────────────────────────────────────

const COMPLIANCE_SYSTEM = `You are a Rule Compliance Auditor for a sovereign AI memory system.

Given a list of rules and a conversation transcript, identify any rules the agent violated.

Output valid JSON matching this schema:
{
  "compliant": boolean,
  "violations": [
    {
      "rule_slug": "string",
      "rule_title": "string",
      "violation_description": "string",
      "severity": "low" | "medium" | "high",
      "suggested_rule_improvement": "string"
    }
  ]
}

If the agent followed all rules, set "compliant": true and "violations": [].
Output ONLY valid JSON.`;

/**
 * Run a compliance audit on a session transcript against active rules.
 *
 * @param {string} sessionPath  Path to session JSONL file
 * @param {object} opts
 * @param {string} opts.vaultDir      Path to memory vault
 * @param {string} opts.runtimeConfig Local LLM runtime config
 * @returns {object} { compliant, violations, error? }
 */
export async function runComplianceAudit(sessionPath, { vaultDir, runtimeConfig }) {
  const transcript = readSessionTranscript(sessionPath);
  if (!transcript || transcript.length < 50) {
    return { compliant: true, violations: [], skipped: 'too-short' };
  }

  const nodes = getNodes(vaultDir);
  const rules = nodes.filter(n =>
    n.status === 'active' &&
    (n.modality === 'must' || n.modality === 'must_not')
  );

  if (rules.length === 0) {
    return { compliant: true, violations: [], skipped: 'no-rules' };
  }

  const rulesText = rules.map(r =>
    `[${r.slug}] ${r.modality.toUpperCase()}: ${r.title}\n  ${(r.body || '').slice(0, 300)}`
  ).join('\n\n');

  const prompt = `## Rules\n${rulesText}\n\n## Session Transcript\n${transcript}\n\nAudit this session for rule violations.`;

  try {
    const rawResponse = await callLocalRuntime(prompt, COMPLIANCE_SYSTEM, runtimeConfig);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');

    const result = JSON.parse(jsonMatch[0]);
    const violations = Array.isArray(result.violations) ? result.violations : [];

    // Bump importance for violated rules
    if (violations.length > 0) {
      await escalateViolatedRules(violations, nodes, vaultDir);
    }

    logger.info({
      subsystem: 'compliance-auditor',
      message: `Session ${path.basename(sessionPath)}: ${violations.length > 0 ? `${violations.length} violations` : 'COMPLIANT'}`,
    });

    return { compliant: violations.length === 0, violations };
  } catch (err) {
    logger.info({
      subsystem: 'compliance-auditor',
      message: `Audit failed for ${path.basename(sessionPath)}: ${err.message}`,
    });
    return { compliant: true, violations: [], error: err.message };
  }
}

/**
 * Escalate rules that get violated frequently.
 * Bumps importance and confidence. After 3+ violations, promotes to priority: absolute.
 */
async function escalateViolatedRules(violations, nodes, vaultDir) {
  for (const v of violations) {
    const node = nodes.find(n => n.slug === v.rule_slug);
    if (!node || !node._filepath) continue;

    try {
      const raw = fs.readFileSync(node._filepath, 'utf8');
      const { data, content } = matter(raw);

      // Track violation count
      const violationCount = (data.x_violation_count || 0) + 1;
      data.x_violation_count = violationCount;

      // Bump importance (max 5)
      if (data.importance < 5) {
        data.importance = Math.min(5, data.importance + 1);
      }

      // Bump confidence (max 1.0)
      if (data.confidence < 1.0) {
        data.confidence = Math.min(1.0, data.confidence + 0.05);
      }

      // Auto-escalate to priority: absolute after 3+ violations
      if (violationCount >= 3 && data.priority !== 'absolute') {
        data.priority = 'absolute';
        logger.info({
          subsystem: 'compliance-auditor',
          message: `ESCALATED rule "${data.slug}" to priority: absolute after ${violationCount} violations.`,
        });
      }

      data.updated = new Date().toISOString();
      atomicWrite(node._filepath, safeStringify(content, data));
    } catch {
      // Skip if we can't update
    }
  }
}
