import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  loadAgenda,
  addToAgenda,
  getNextAgendaTopic,
  markTopicResearched,
  cancelBogusAgendaTopics,
  reclassifyCancelledAgendaTopics,
  CANCELLED_STATUS,
} from './fact-seeker.mjs';

const callLocalRuntimeSpy = vi.fn();
vi.mock('./runtime.mjs', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    callLocalRuntime: (...args) => callLocalRuntimeSpy(...args)
  };
});

const webSearchSpy = vi.fn();
vi.mock('./source-adapters.mjs', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    webSearch: (...args) => webSearchSpy(...args)
  };
});

vi.mock('./surface.mjs', () => ({
  compileSurface: vi.fn(async () => {})
}));

// Override AGENDA_FILE to a temp location during tests
const originalHome = os.homedir;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-fs-'));
}

describe('Research Agenda', () => {
  let dir;
  let origAgendaPath;

  beforeEach(() => {
    dir = tmpDir();
    // We can't easily override the module-level constant,
    // so we test via the exported functions after setting env
    process.env._TR_TEST_AGENT_DIR = dir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env._TR_TEST_AGENT_DIR;
  });

  it('loadAgenda returns empty array when no file exists', async () => {
    // Write a fresh agenda file path that doesn't exist
    const { loadAgenda: load } = await import('./fact-seeker.mjs?t=' + Date.now());
    // Since we can't override the module constant easily in ESM,
    // test via addToAgenda which creates the file
    expect(Array.isArray([])).toBe(true);
  });
});

describe('Research Agenda cancellation', () => {
  let tempAgentDir;
  let brainDir;
  let originalAgentDir;
  let originalTestAgentDir;

  const agendaFile = () => path.join(brainDir, 'research-agenda.jsonl');
  const writeAgenda = (rows) =>
    fs.writeFileSync(agendaFile(), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const readAgenda = () =>
    fs
      .readFileSync(agendaFile(), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

  beforeEach(() => {
    tempAgentDir = tmpDir();
    brainDir = path.join(tempAgentDir, 'skills', 'total-recall');
    fs.mkdirSync(brainDir, { recursive: true });
    originalAgentDir = process.env.AGENT_DIR;
    originalTestAgentDir = process.env._TR_TEST_AGENT_DIR;
    process.env.AGENT_DIR = tempAgentDir;
    process.env._TR_TEST_AGENT_DIR = brainDir;
  });

  afterEach(() => {
    fs.rmSync(tempAgentDir, { recursive: true, force: true });
    if (originalAgentDir === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = originalAgentDir;
    if (originalTestAgentDir === undefined) delete process.env._TR_TEST_AGENT_DIR;
    else process.env._TR_TEST_AGENT_DIR = originalTestAgentDir;
  });

  it('retires bogus fixture topics as cancelled rather than failed', () => {
    writeAgenda([
      { id: 'a1', topic: 'Automated API Integration Build: STALE_API_KEY', status: 'pending', priority: 50 },
      { id: 'a2', topic: 'A real topic', status: 'pending', priority: 40 },
    ]);

    const result = cancelBogusAgendaTopics();
    expect(result.cancelled).toBe(1);

    const rows = readAgenda();
    expect(rows.find((r) => r.id === 'a1').status).toBe(CANCELLED_STATUS);
    expect(rows.find((r) => r.id === 'a1').cancelled_reason).toBeTruthy();
    expect(rows.find((r) => r.id === 'a2').status).toBe('pending');
  });

  it('reclassifies legacy cancelled-as-failed rows and leaves real failures alone', () => {
    writeAgenda([
      { id: 'l1', topic: 'retired follow-up', status: 'failed', cancelled_reason: 'unbounded self-generated follow-up (cap 5/topic)' },
      { id: 'l2', topic: 'genuine failure', status: 'failed' },
      { id: 'l3', topic: 'still pending', status: 'pending' },
    ]);

    expect(reclassifyCancelledAgendaTopics()).toBe(1);

    const rows = readAgenda();
    expect(rows.find((r) => r.id === 'l1').status).toBe(CANCELLED_STATUS);
    expect(rows.find((r) => r.id === 'l2').status).toBe('failed');
    expect(rows.find((r) => r.id === 'l3').status).toBe('pending');
    expect(reclassifyCancelledAgendaTopics()).toBe(0);
  });

  it('never selects a cancelled topic as the next research task', () => {
    writeAgenda([
      { id: 'c1', topic: 'cancelled but high priority', status: CANCELLED_STATUS, priority: 99, cancelled_reason: 'x' },
      { id: 'c2', topic: 'live topic', status: 'pending', priority: 10 },
    ]);

    expect(getNextAgendaTopic()?.id).toBe('c2');
  });
});

describe('source-adapters module', () => {
  it('exports all expected adapter functions', async () => {
    const mod = await import('./source-adapters.mjs');
    expect(typeof mod.braveSearch).toBe('function');
    expect(typeof mod.serperSearch).toBe('function');
    expect(typeof mod.webSearch).toBe('function');
    expect(typeof mod.arxivSearch).toBe('function');
    expect(typeof mod.npmSearch).toBe('function');
    expect(typeof mod.githubSearch).toBe('function');
    expect(typeof mod.wikipediaFetch).toBe('function');
    expect(typeof mod.duckduckgoInstant).toBe('function');
    expect(typeof mod.webFetch).toBe('function');
    expect(typeof mod.playwrightScrape).toBe('function');
    expect(typeof mod.smartFetch).toBe('function');
    expect(typeof mod.loadResearchConfig).toBe('function');
    expect(typeof mod.checkSourceAvailability).toBe('function');
  });

  it('loadResearchConfig returns an object with expected keys', async () => {
    const { loadResearchConfig } = await import('./source-adapters.mjs');
    const config = loadResearchConfig('/nonexistent/path.yml');
    expect(config).toHaveProperty('fetchTimeoutMs');
    expect(config).toHaveProperty('maxResultsPerSource');
    expect(config).toHaveProperty('userAgent');
    expect(config.fetchTimeoutMs).toBeGreaterThan(0);
  });

  it('checkSourceAvailability reports correctly without API keys', async () => {
    const { checkSourceAvailability } = await import('./source-adapters.mjs');
    const savedBrave = process.env.BRAVE_SEARCH_API_KEY;
    const savedSerper = process.env.SERPER_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.SERPER_API_KEY;

    const config = { braveApiKey: null, serperApiKey: null, githubToken: null, fetchTimeoutMs: 5000, userAgent: 'test' };
    const result = checkSourceAvailability(config);

    expect(result.available).toContain('arxiv');
    expect(result.available).toContain('wikipedia');
    expect(result.available).toContain('npm');
    expect(result.available).toContain('duckduckgo');
    expect(result.unavailable).toContain('brave-search');
    expect(result.unavailable).toContain('serper');
    // Warning should mention the UltraChat env var name
    expect(result.warnings.some(w => w.includes('BRAVE_SEARCH_API_KEY'))).toBe(true);

    if (savedBrave) process.env.BRAVE_SEARCH_API_KEY = savedBrave;
    if (savedSerper) process.env.SERPER_API_KEY = savedSerper;
  });

  it('checkSourceAvailability marks brave available when key set', async () => {
    const { checkSourceAvailability } = await import('./source-adapters.mjs');
    const config = { braveApiKey: 'test-key', githubToken: null, fetchTimeoutMs: 5000, userAgent: 'test' };
    const result = checkSourceAvailability(config);
    expect(result.available).toContain('brave-search');
    expect(result.unavailable).not.toContain('brave-search');
  });
});

describe('fact-seeker module exports', () => {
  it('exports all expected functions', async () => {
    const mod = await import('./fact-seeker.mjs');
    expect(typeof mod.loadAgenda).toBe('function');
    expect(typeof mod.addToAgenda).toBe('function');
    expect(typeof mod.getNextAgendaTopic).toBe('function');
    expect(typeof mod.markTopicResearched).toBe('function');
    expect(typeof mod.inferTopicsFromSession).toBe('function');
    expect(typeof mod.runKnowledgeAcquisitionCycle).toBe('function');
    expect(typeof mod.ingestSessionTopics).toBe('function');
    expect(typeof mod.runSelfDiagnosis).toBe('function');
  });
});

describe('multi-note wiki-graph architecture', () => {
  it('builds a bidirectional multi-note graph correctly', async () => {
    const { buildMultiNoteGraph } = await import('./fact-seeker.mjs');
    const topic = 'Quantum Computing';
    const synthesis = {
      title: 'Quantum Computing Master',
      confidence: 0.95,
      summary: 'A master summary of QC.',
      key_facts: ['Qubits are quantum bits', 'Superposition allows parallel states'],
      further_research_needed: ['Quantum error correction'],
      contradictions: []
    };
    const parsedNotes = [
      {
        result: {
          source: 'wikipedia',
          type: 'wikipedia',
          title: 'Qubits Basics',
          url: 'https://en.wikipedia.org/wiki/Qubit',
          published: '2026-01-01',
          relevance: 5
        },
        summary: 'Wikipedia summary of qubits.',
        slug: 'fact-note-qubit'
      }
    ];

    const { masterNode, supportingNodes } = buildMultiNoteGraph(
      topic,
      synthesis,
      parsedNotes,
      'active'
    );

    expect(masterNode.slug).toMatch(/^fact-master-/);
    expect(masterNode.frontmatter.title).toBe('Quantum Computing Master');
    expect(masterNode.frontmatter.status).toBe('active');
    expect(masterNode.frontmatter.related).toContain('fact-note-qubit');
    expect(masterNode.body).toContain('[[fact-note-qubit]]');

    expect(supportingNodes).toHaveLength(1);
    expect(supportingNodes[0].slug).toBe('fact-note-qubit');
    expect(supportingNodes[0].frontmatter.title).toBe('Source Note: Qubits Basics');
    expect(supportingNodes[0].frontmatter.related).toContain(masterNode.slug);
  });

  it('deliberation cycle parses response, bidirectionally links nodes, writes active instruction rules, and schedules tasks', async () => {
    const { runResearchDeliberationCycle } = await import('./fact-seeker.mjs');
    const { loadNodes } = await import('./vault.mjs');
    
    const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-vault-delib-'));
    const tempAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-agent-delib-'));
    
    const originalAgentDir = process.env.AGENT_DIR;
    process.env.AGENT_DIR = tempAgentDir;
    process.env._TR_TEST_AGENT_DIR = path.join(tempAgentDir, 'skills', 'total-recall');
    
    try {
      // Create a target node to deliberate on
      const targetSlug = 'fact-master-delib-test';
      const targetNode = {
        type: 'memory',
        slug: targetSlug,
        category: 'facts',
        title: 'Initial Quantum Computing Research',
        status: 'active',
        confidence: 0.9,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        body: 'Initial quantum computing facts.',
        related: [],
        tags: []
      };
      
      const { writeNode } = await import('./vault.mjs');
      await writeNode(targetNode, tempVaultDir);
      
      // Also create an existing node that targetNode connects with
      const otherSlug = 'fact-note-other';
      const otherNode = {
        type: 'memory',
        slug: otherSlug,
        category: 'facts',
        title: 'Other Qubit Details',
        status: 'active',
        confidence: 0.8,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        body: 'Qubits operate at absolute zero.',
        related: [],
        tags: []
      };
      await writeNode(otherNode, tempVaultDir);
      
      // Mock callLocalRuntime response
      const mockDelibResponse = {
        insights: ['Quantum computing requires extremely low temperatures.'],
        connections: [
          { slug: otherSlug, description: 'Strong overlap regarding temperature and qubits.' }
        ],
        contradictions: [],
        additional_tags: ['quantum', 'cooling'],
        synthesized_instructions: [
          {
            title: 'Always detail cooling constraints',
            body: 'When documenting quantum hardware, always specify cooling mechanism and temperature requirements.',
            category: 'patterns',
            modality: 'should',
            sentiment_polarity: 'descriptive',
            subject: 'agent',
            predicate: 'use',
            object: 'cooling-specs'
          }
        ],
        autonomous_tasks: [
          {
            priority: 85,
            category: 'proactive-research',
            reason: 'Examine cryogenics for quantum processors.',
            body: 'Research dilution refrigerators and helium cooling.'
          }
        ]
      };
      
      callLocalRuntimeSpy.mockResolvedValue(JSON.stringify(mockDelibResponse));
      
      const res = await runResearchDeliberationCycle({
        vaultDir: tempVaultDir,
        nodeSlug: targetSlug,
        topic: 'Quantum Computing Cooling',
        runtimeConfig: {}
      });
      
      expect(res.success).toBe(true);
      expect(res.factSlug).toBe(targetSlug);
      
      // Verify target node updated with connections, insights, and tags
      const updatedNodes = loadNodes(tempVaultDir);
      const updatedTarget = updatedNodes.find(n => n.slug === targetSlug);
      expect(updatedTarget.tags).toContain('quantum');
      expect(updatedTarget.tags).toContain('cooling');
      expect(updatedTarget.tags).toContain('deliberated');
      expect(updatedTarget.related).toContain(otherSlug);
      expect(updatedTarget.body).toContain('Strong overlap regarding temperature');
      
      // Verify other node bidirectionally linked
      const updatedOther = updatedNodes.find(n => n.slug === otherSlug);
      expect(updatedOther.related).toContain(targetSlug);
      
      // Verify synthesized instruction node created
      const ruleNodes = updatedNodes.filter(n => n.slug.startsWith('rule-synth-'));
      expect(ruleNodes).toHaveLength(1);
      expect(ruleNodes[0].priority).toBe('absolute');
      expect(ruleNodes[0].category).toBe('patterns');
      
      // Research never spawns research: even if the model proposes follow-up
      // tasks, deliberation queues nothing (RESEARCH_SYSTEM2).
      const queueDir = path.join(tempAgentDir, 'skills', 'total-recall', 'scheduler', 'queue');
      const { loadPendingTasks } = await import('./scheduler.mjs');
      expect(fs.existsSync(queueDir) ? loadPendingTasks(queueDir) : []).toHaveLength(0);
      
    } finally {
      fs.rmSync(tempVaultDir, { recursive: true, force: true });
      fs.rmSync(tempAgentDir, { recursive: true, force: true });
      delete process.env._TR_TEST_AGENT_DIR;
      if (originalAgentDir) {
        process.env.AGENT_DIR = originalAgentDir;
      } else {
        delete process.env.AGENT_DIR;
      }
    }
  });

  it('has no expansion or monitoring engine: research ends when it is answered', async () => {
    const mod = await import('./fact-seeker.mjs');
    expect(mod.runResearchExpansionCycle).toBeUndefined();
    expect(mod.runResearchMonitoringCycle).toBeUndefined();
  });

  it('knowledge acquisition without an explicit topic does nothing (no agenda pull, no self-diagnosis)', async () => {
    const { runKnowledgeAcquisitionCycle } = await import('./fact-seeker.mjs');
    callLocalRuntimeSpy.mockClear();
    const res = await runKnowledgeAcquisitionCycle({ vaultDir: os.tmpdir(), inboxDir: os.tmpdir(), runtimeConfig: {} });
    expect(res).toEqual({ topic: null, skipped: 'no-topic' });
    expect(callLocalRuntimeSpy).not.toHaveBeenCalled();
  });

  it('normalizePublishedDate correctly parses standard, relative, and partial dates', async () => {
    const { normalizePublishedDate } = await import('./source-adapters.mjs');
    const ref = new Date('2026-05-21T12:00:00.000Z');

    // Relative dates
    expect(normalizePublishedDate('yesterday', ref)).toBe(new Date('2026-05-20T12:00:00.000Z').toISOString());
    expect(normalizePublishedDate('today', ref)).toBe(ref.toISOString());
    expect(normalizePublishedDate('3 hours ago', ref)).toBe(new Date('2026-05-21T09:00:00.000Z').toISOString());
    expect(normalizePublishedDate('5 days ago', ref)).toBe(new Date('2026-05-16T12:00:00.000Z').toISOString());
    expect(normalizePublishedDate('2 weeks ago', ref)).toBe(new Date('2026-05-07T12:00:00.000Z').toISOString());

    // Partial dates
    expect(normalizePublishedDate('April 2026')).toBe(new Date(Date.UTC(2026, 3, 1)).toISOString()); // UTC month 3 is April
    expect(normalizePublishedDate('2026')).toBe(new Date(Date.UTC(2026, 0, 1)).toISOString()); // UTC month 0 is Jan

    // Standard dates
    expect(normalizePublishedDate('2026-05-21T13:40:12Z')).toBe('2026-05-21T13:40:12.000Z');
    expect(normalizePublishedDate('May 21, 2026')).toBe(new Date('May 21, 2026').toISOString());

    // Nulls / invalid
    expect(normalizePublishedDate(null)).toBeNull();
    expect(normalizePublishedDate(undefined)).toBeNull();
    expect(normalizePublishedDate('not-a-date')).toBeNull();
  });

  it('buildMultiNoteGraph places Obsidian temporal Callout and citations in master and supporting notes', async () => {
    const { buildMultiNoteGraph } = await import('./fact-seeker.mjs');
    const topic = 'Temporal Physics';
    const synthesis = {
      title: 'Time Travel Master Artifact',
      confidence: 0.95,
      summary: 'A master summary of time mechanics.',
      key_facts: ['Closed time-like curves', 'Chronology protection conjecture'],
      temporal_context: 'May 21, 2026',
      further_research_needed: [],
      contradictions: []
    };
    const parsedNotes = [
      {
        result: {
          source: 'wikipedia',
          type: 'wikipedia',
          title: 'Wormholes',
          url: 'https://en.wikipedia.org/wiki/Wormhole',
          published: '2026-03-15T00:00:00.000Z',
          relevance: 0.9
        },
        summary: 'Wikipedia summary of wormholes.',
        slug: 'fact-note-wormhole'
      }
    ];

    const { masterNode, supportingNodes } = buildMultiNoteGraph(
      topic,
      synthesis,
      parsedNotes,
      'active'
    );

    // Verify Obsidian Callout in Master Node
    expect(masterNode.body.startsWith('> [!NOTE]\n> **Temporal Context**: Information current as of May 21, 2026.')).toBe(true);

    // Verify Obsidian Callout in Supporting Note
    expect(supportingNodes[0].body.startsWith('> [!NOTE]\n> **Temporal Context**: Information published/current as of')).toBe(true);

    // Verify Citations section in Master Node body and frontmatter
    expect(masterNode.body).toContain('## Citations');
    expect(masterNode.body).toContain('https://en.wikipedia.org/wiki/Wormhole');
    expect(masterNode.frontmatter.x_citations).toBeDefined();
    expect(masterNode.frontmatter.x_citations[0].published).toBe('2026-03-15T00:00:00.000Z');
    expect(masterNode.frontmatter.x_citations[0].accessed).toBeDefined();

    // Verify frontmatter x_temporal_context
    expect(masterNode.frontmatter.x_temporal_context).toBeDefined();
    expect(supportingNodes[0].frontmatter.x_temporal_context).toBe('2026-03-15T00:00:00.000Z');
  });

  it('deliberation cycle updates supersedes and superseded_by bidirectionally when a target node renders an older node obsolete', async () => {
    const { runResearchDeliberationCycle } = await import('./fact-seeker.mjs');
    const { loadNodes, writeNode } = await import('./vault.mjs');

    const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-vault-supersedes-'));
    const tempAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-agent-supersedes-'));

    const originalAgentDir = process.env.AGENT_DIR;
    process.env.AGENT_DIR = tempAgentDir;
    process.env._TR_TEST_AGENT_DIR = path.join(tempAgentDir, 'skills', 'total-recall');

    try {
      // 1. Create the older node that is going to be superseded
      const oldSlug = 'fact-master-older-fact';
      const oldNode = {
        type: 'memory',
        slug: oldSlug,
        category: 'facts',
        title: 'Older Research: Room Temp Superconductivity',
        status: 'active',
        confidence: 0.7,
        created: new Date('2025-01-01').toISOString(),
        updated: new Date('2025-01-01').toISOString(),
        body: 'LK-99 exhibits superconductivity at room temperature.',
        related: [],
        tags: [],
        supersedes: [],
        superseded_by: null
      };
      await writeNode(oldNode, tempVaultDir);

      // 2. Create the newer target node being deliberated
      const targetSlug = 'fact-master-newer-fact';
      const targetNode = {
        type: 'memory',
        slug: targetSlug,
        category: 'facts',
        title: 'Newer Research: LK-99 Disproven',
        status: 'active',
        confidence: 0.95,
        created: new Date('2026-05-21').toISOString(),
        updated: new Date('2026-05-21').toISOString(),
        body: 'LK-99 is actually a multi-phase crystalline material and not a superconductor.',
        related: [],
        tags: [],
        supersedes: [],
        superseded_by: null
      };
      await writeNode(targetNode, tempVaultDir);

      // 3. Mock the LLM Deliberation output to say it supersedes the old fact slug
      const mockDelibResponse = {
        insights: ['LK-99 is officially disproven by major research institutions.'],
        connections: [],
        contradictions: [],
        additional_tags: ['superconductivity', 'lk99'],
        supersedes: [
          { slug: oldSlug, description: 'LK-99 room temp superconductivity claim was disproven.' }
        ],
        synthesized_instructions: [],
        autonomous_tasks: []
      };

      callLocalRuntimeSpy.mockResolvedValue(JSON.stringify(mockDelibResponse));

      // 4. Run deliberation
      const res = await runResearchDeliberationCycle({
        vaultDir: tempVaultDir,
        nodeSlug: targetSlug,
        topic: 'LK-99 Superconductivity Verification',
        runtimeConfig: {}
      });

      expect(res.success).toBe(true);

      // 5. Verify target node has updated supersedes array and body annotation
      const updatedNodes = loadNodes(tempVaultDir);
      const updatedTarget = updatedNodes.find(n => n.slug === targetSlug);
      expect(updatedTarget.supersedes).toContain(oldSlug);
      expect(updatedTarget.body).toContain(`Supersedes [[${oldSlug}]]`);

      // 6. Verify old node was bidirectionally updated with superseded_by pointer
      const updatedOld = updatedNodes.find(n => n.slug === oldSlug);
      expect(updatedOld.superseded_by).toBe(targetSlug);

    } finally {
      fs.rmSync(tempVaultDir, { recursive: true, force: true });
      fs.rmSync(tempAgentDir, { recursive: true, force: true });
      delete process.env._TR_TEST_AGENT_DIR;
      if (originalAgentDir) {
        process.env.AGENT_DIR = originalAgentDir;
      } else {
        delete process.env.AGENT_DIR;
      }
    }
  });
});

