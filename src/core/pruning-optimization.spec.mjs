import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { autoPruneStorage } from './dream.mjs';
import { loadQueue, saveQueue } from './research-queue.mjs';

describe('Pruning Optimization & Safety', () => {
  let testDir;
  let testAgentDir;
  let testHomeDir;
  let testBrainDir;
  let testVaultDir;
  let testConflictsDir;

  beforeEach(() => {
    // Set up unique isolated test directories under /tmp
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    testDir = path.join(os.tmpdir(), `tr-prune-test-${suffix}`);
    testAgentDir = path.join(testDir, 'agent');
    testHomeDir = path.join(testDir, 'home');
    testBrainDir = path.join(testAgentDir, 'skills', 'total-recall');
    testVaultDir = path.join(testBrainDir, 'memory-vault');
    testConflictsDir = path.join(testBrainDir, 'memory-inbox', 'conflicts');

    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(testAgentDir, { recursive: true });
    fs.mkdirSync(testHomeDir, { recursive: true });
    fs.mkdirSync(testBrainDir, { recursive: true });
    fs.mkdirSync(testVaultDir, { recursive: true });
    fs.mkdirSync(testConflictsDir, { recursive: true });

    // Set test env variables
    process.env._TR_TEST_AGENT_DIR = testBrainDir;
    process.env._TR_TEST_HOME_DIR = testHomeDir;
  });

  afterEach(() => {
    // Clean up environment and temp files
    delete process.env._TR_TEST_AGENT_DIR;
    delete process.env._TR_TEST_HOME_DIR;
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('preserves active research drafts while pruning stale speculative drafts', async () => {
    // 1. Write a mock research queue
    const activeItem = {
      id: 'active-research-123',
      topic: 'Gemma 3 Architecture',
      status: 'in_progress',
      node_slug: 'gemma-3-architecture-report',
      research_phase: 'deliberation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const completedItem = {
      id: 'completed-research-456',
      topic: 'Vitest Options',
      status: 'done',
      node_slug: 'vitest-options-report',
      research_phase: 'completed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    saveQueue([activeItem, completedItem], testBrainDir);

    // 2. Set up the memory-inbox directory with draft files
    const inboxDir = path.join(testBrainDir, 'memory-inbox');
    const inboxPendingDir = path.join(inboxDir, 'pending');
    fs.mkdirSync(inboxPendingDir, { recursive: true });

    const activeDraftPath = path.join(inboxPendingDir, 'gemma-3-architecture-report.md');
    const completedDraftPath = path.join(inboxPendingDir, 'vitest-options-report.md');
    const orphanedDraftPath = path.join(inboxPendingDir, 'random-speculative-draft.md');

    // Create files with mock content and make them old (e.g. 2 days old) to trigger pruning
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    
    fs.writeFileSync(activeDraftPath, 'Active Draft Content');
    fs.utimesSync(activeDraftPath, oldTime, oldTime);

    fs.writeFileSync(completedDraftPath, 'Completed Draft Content');
    fs.utimesSync(completedDraftPath, oldTime, oldTime);

    fs.writeFileSync(orphanedDraftPath, 'Orphaned Draft Content');
    fs.utimesSync(orphanedDraftPath, oldTime, oldTime);

    // Also write mock logs directory to make autoPruneStorage happy
    fs.mkdirSync(path.join(testBrainDir, 'logs'), { recursive: true });

    // 3. Trigger autoPruneStorage directly
    autoPruneStorage(testBrainDir, testVaultDir, testConflictsDir);

    // 4. Assertions
    // - Active draft must be PRESERVED
    expect(fs.existsSync(activeDraftPath)).toBe(true);

    // - Stale completed or orphaned drafts must be PRUNED
    expect(fs.existsSync(completedDraftPath)).toBe(false);
    expect(fs.existsSync(orphanedDraftPath)).toBe(false);
  });

  it('prunes transient planning files in Antigravity app data but permanently preserves conversations/threads', async () => {
    // 1. Scaffold Antigravity app data folders in our test home dir
    const agBrainDir = path.join(testHomeDir, '.gemini', 'antigravity', 'brain');
    const convDir = path.join(agBrainDir, 'uuid-conversation-123');
    const sysGeneratedDir = path.join(convDir, '.system_generated');
    const logsDir = path.join(sysGeneratedDir, 'logs');

    fs.mkdirSync(logsDir, { recursive: true });

    // 2. Write transient root files inside the conversation folder
    const planPath = path.join(convDir, 'implementation_plan.md');
    const taskPath = path.join(convDir, 'task.md');
    const planMetaPath = path.join(convDir, 'implementation_plan.md.metadata.json');
    
    // Write a permanent transcript file inside .system_generated/logs/
    const transcriptPath = path.join(logsDir, 'transcript.jsonl');

    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);

    fs.writeFileSync(planPath, '# Test Implementation Plan');
    fs.utimesSync(planPath, oldTime, oldTime);

    fs.writeFileSync(taskPath, '- [ ] todo task');
    fs.utimesSync(taskPath, oldTime, oldTime);

    fs.writeFileSync(planMetaPath, '{"meta": true}');
    fs.utimesSync(planMetaPath, oldTime, oldTime);

    fs.writeFileSync(transcriptPath, '{"user": "hello"}');
    fs.utimesSync(transcriptPath, oldTime, oldTime);

    // Also write mock logs directory to make autoPruneStorage happy
    fs.mkdirSync(path.join(testBrainDir, 'logs'), { recursive: true });

    // 3. Trigger dream cycle pruning
    autoPruneStorage(testBrainDir, testVaultDir, testConflictsDir);

    // 4. Assertions
    // - Transient root planning files must be PRUNED
    expect(fs.existsSync(planPath)).toBe(false);
    expect(fs.existsSync(taskPath)).toBe(false);
    expect(fs.existsSync(planMetaPath)).toBe(false);

    // - Conversation transcripts and threads must be PERMANENTLY PRESERVED
    expect(fs.existsSync(transcriptPath)).toBe(true);
    expect(fs.existsSync(sysGeneratedDir)).toBe(true);
  });

  it('consolidates multiple research query results and synthesized summaries into a single main document report', async () => {
    const { writeOrUpdateConsolidatedDraft, saveSynthesizedReportToDraft } = await import('./research.mjs');

    const inboxPendingDir = path.join(testBrainDir, 'memory-inbox', 'pending');
    fs.mkdirSync(inboxPendingDir, { recursive: true });

    const parentTopic = 'Advanced Quantum Computing';

    // 1. First search query results
    const results1 = [
      { source: 'brave-search', title: 'Quantum Supremacy 2026', url: 'https://quantum.com/2026', snippet: 'Major milestone reached.' }
    ];
    const reportPath1 = writeOrUpdateConsolidatedDraft(parentTopic, 'quantum supremacy milestones 2026', results1, inboxPendingDir);
    expect(fs.existsSync(reportPath1)).toBe(true);
    expect(path.basename(reportPath1)).toBe('research-report-advanced-quantum-computing.md');

    // 2. Second search query results (should append/integrate into the same file)
    const results2 = [
      { source: 'wikipedia', title: 'Quantum Computing', url: 'https://en.wikipedia.org/wiki/Quantum_computing', snippet: 'Overview of qubit models.' }
    ];
    const reportPath2 = writeOrUpdateConsolidatedDraft(parentTopic, 'quantum computing basics', results2, inboxPendingDir);
    expect(reportPath2).toBe(reportPath1); // Same file!

    // Verify it contains both search queries
    const contentBeforeSynth = fs.readFileSync(reportPath2, 'utf8');
    expect(contentBeforeSynth).toContain('quantum supremacy milestones 2026');
    expect(contentBeforeSynth).toContain('quantum computing basics');

    // 3. Save synthesized report (should place executive summary at top and preserve appendix)
    const finalReportText = 'This is the comprehensive executive summary of Quantum Computing research.';
    const finalPath = saveSynthesizedReportToDraft(parentTopic, finalReportText, inboxPendingDir);
    expect(finalPath).toBe(reportPath2); // Same file!

    const finalContent = fs.readFileSync(finalPath, 'utf8');
    expect(finalContent).toContain('# Consolidated Research Report: Advanced Quantum Computing');
    expect(finalContent).toContain(finalReportText);
    expect(finalContent).toContain('## Appendix: Gathered Search Batches & Sources');
    expect(finalContent).toContain('quantum supremacy milestones 2026');
    expect(finalContent).toContain('quantum computing basics');
  });
});
