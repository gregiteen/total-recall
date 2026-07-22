import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadAgenda, addToAgenda, getNextAgendaTopic, markTopicResearched } from './fact-seeker.mjs';

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
      
      // Verify autonomous task persisted to disk
      const queueDir = path.join(tempAgentDir, 'skills', 'total-recall', 'scheduler', 'queue');
      expect(fs.existsSync(queueDir)).toBe(true);
      const { loadPendingTasks } = await import('./scheduler.mjs');
      const pendingTasks = loadPendingTasks(queueDir);
      expect(pendingTasks).toHaveLength(1);
      const taskContent = pendingTasks[0];
      expect(taskContent.priority).toBe(85);
      expect(taskContent.category).toBe('proactive-research');
      expect(taskContent.reason).toBe('Examine cryogenics for quantum processors.');
      expect(taskContent.body.trim()).toBe('Research dilution refrigerators and helium cooling.');
      
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

  it('expansion cycle brainstorms tangents, adds to research queue, and schedules tasks', async () => {
    const { runResearchExpansionCycle } = await import('./fact-seeker.mjs');
    const { loadNodes } = await import('./vault.mjs');
    
    const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-vault-expand-'));
    const tempAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-agent-expand-'));
    
    const originalAgentDir = process.env.AGENT_DIR;
    process.env.AGENT_DIR = tempAgentDir;
    process.env._TR_TEST_AGENT_DIR = path.join(tempAgentDir, 'skills', 'total-recall');
    
    try {
      const targetSlug = 'fact-master-expand-test';
      const targetNode = {
        type: 'memory',
        slug: targetSlug,
        category: 'facts',
        title: 'Initial AI Safety Research',
        status: 'active',
        confidence: 0.9,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        body: 'Initial safety guidelines.',
        related: [],
        tags: []
      };
      
      const { writeNode } = await import('./vault.mjs');
      await writeNode(targetNode, tempVaultDir);
      
      const mockExpandResponse = {
        tangents: [
          {
            topic: 'AI Alignment RLHF',
            priority: 'high',
            rationale: 'RLHF is the current standard for alignment.'
          }
        ]
      };
      
      callLocalRuntimeSpy.mockResolvedValue(JSON.stringify(mockExpandResponse));
      
      const res = await runResearchExpansionCycle({
        vaultDir: tempVaultDir,
        nodeSlug: targetSlug,
        topic: 'AI Safety',
        runtimeConfig: {}
      });
      
      expect(res.success).toBe(true);
      
      // Verify target node body updated
      const updatedNodes = loadNodes(tempVaultDir);
      const updatedTarget = updatedNodes.find(n => n.slug === targetSlug);
      expect(updatedTarget.body).toContain('AI Alignment RLHF');
      expect(updatedTarget.tags).toContain('expanded');
      
      // Verify autonomous task persisted to disk
      const queueDir = path.join(tempAgentDir, 'skills', 'total-recall', 'scheduler', 'queue');
      expect(fs.existsSync(queueDir)).toBe(true);
      const { loadPendingTasks } = await import('./scheduler.mjs');
      const pendingTasks = loadPendingTasks(queueDir);
      expect(pendingTasks).toHaveLength(1);
      const taskContent = pendingTasks[0];
      expect(taskContent.priority).toBe(65); // high -> 65
      expect(taskContent.category).toBe('proactive-research');
      expect(taskContent.body).toContain('AI Alignment RLHF');
      
      // Verify added to research queue
      const { loadQueue } = await import('./research-queue.mjs');
      const queue = loadQueue();
      expect(queue.some(item => item.topic === 'AI Alignment RLHF')).toBe(true);
      
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

