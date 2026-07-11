import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  okfConceptToSsssNode,
  ssssNodeToOkfConcept,
  importBundle,
  exportBundle,
  DEFAULT_OKF_TYPE_MAP
} from './okf-adapter.mjs';
import { validateMemoryNode } from './total-recall-memory-validator.mjs';

describe('OKF Adapter Core Logic', () => {
  describe('okfConceptToSsssNode', () => {
    it('produces a valid SSSS V2 node from full OKF fields', () => {
      const frontmatter = {
        type: 'API Endpoint',
        title: 'User Profile API',
        description: 'Retrieves user details from the DB',
        resource: 'https://api.example.com/users',
        tags: ['api', 'user'],
        timestamp: '2026-06-17T12:00:00Z'
      };
      const body = 'This endpoint is used by the frontend to fetch user profiles.';
      
      const node = okfConceptToSsssNode(frontmatter, body, 'endpoints/user-profile.md');
      
      expect(node).not.toBeNull();
      expect(node.slug).toBe('endpoints-user-profile');
      expect(node.category).toBe('facts'); // mapped from API Endpoint
      expect(node.title).toBe('User Profile API');
      expect(node.description).toBe('Retrieves user details from the DB');
      expect(node.resource).toBe('https://api.example.com/users');
      expect(node.tags).toEqual(['api', 'user']);
      expect(node.created).toBe('2026-06-17T12:00:00Z');
      expect(node.updated).toBe('2026-06-17T12:00:00Z');
      expect(node.body).toBe(body);
      expect(node.subject).toBe('user'); // derived from title
      expect(node.predicate).toBe('describes');
      expect(node.object).toBe('API Endpoint');
      expect(node.confidence).toBe(0.8);
      expect(node.importance).toBe(3);
      expect(node.schema_version).toBe(2);

      // Verify validation passes
      const valResult = validateMemoryNode(node);
      expect(valResult.success).toBe(true);
    });

    it('produces a valid node from minimal OKF (only type)', () => {
      const frontmatter = {
        type: 'Metric'
      };
      const node = okfConceptToSsssNode(frontmatter, '', 'metrics/retention');
      
      expect(node).not.toBeNull();
      expect(node.slug).toBe('metrics-retention');
      expect(node.category).toBe('concepts'); // mapped from Metric
      expect(node.title).toBe('metrics/retention');
      expect(node.subject).toBe('okf.concept');
      expect(node.object).toBe('Metric');
      
      const valResult = validateMemoryNode(node);
      expect(valResult.success).toBe(true);
    });

    it('falls back to facts category for unknown OKF type', () => {
      const frontmatter = {
        type: 'SuperUnknownType'
      };
      const node = okfConceptToSsssNode(frontmatter, '', 'some-slug');
      expect(node.category).toBe('facts');
      
      const valResult = validateMemoryNode(node);
      expect(valResult.success).toBe(true);
    });

    it('derives slug correctly from nested paths', () => {
      const node1 = okfConceptToSsssNode({ type: 'Metric' }, '', 'a/b/c.md');
      expect(node1.slug).toBe('a-b-c');
      
      const node2 = okfConceptToSsssNode({ type: 'Metric' }, '', './foo/bar/baz.md');
      expect(node2.slug).toBe('foo-bar-baz');
    });

    it('returns null for null frontmatter', () => {
      const node = okfConceptToSsssNode(null, 'body', 'slug');
      expect(node).toBeNull();
    });
  });

  describe('ssssNodeToOkfConcept', () => {
    it('maps all SSSS fields to OKF fields', () => {
      const ssssNode = {
        type: 'memory',
        slug: 'test-slug',
        category: 'patterns',
        title: 'My Pattern',
        description: 'Pattern description',
        resource: 's3://my-bucket/patterns',
        status: 'active',
        created: '2026-06-17T12:00:00Z',
        updated: '2026-06-17T13:00:00Z',
        tags: ['p1', 'p2'],
        body: 'Pattern body content goes here.',
        schema_version: 2
      };

      const concept = ssssNodeToOkfConcept(ssssNode);
      expect(concept).not.toBeNull();
      expect(concept.frontmatter.type).toBe('Pattern'); // capitalized/mapped from patterns
      expect(concept.frontmatter.title).toBe('My Pattern');
      expect(concept.frontmatter.description).toBe('Pattern description');
      expect(concept.frontmatter.resource).toBe('s3://my-bucket/patterns');
      expect(concept.frontmatter.tags).toEqual(['p1', 'p2']);
      expect(concept.frontmatter.timestamp).toBe('2026-06-17T13:00:00Z');
      expect(concept.frontmatter.slug).toBe('test-slug');
      expect(concept.body).toBe('Pattern body content goes here.');
    });

    it('derives description from body when absent', () => {
      const ssssNode = {
        type: 'memory',
        slug: 'test-slug',
        category: 'facts',
        title: 'Some Fact',
        created: '2026-06-17T12:00:00Z',
        body: 'This is the first sentence. And this is the second.',
        schema_version: 2
      };

      const concept = ssssNodeToOkfConcept(ssssNode);
      expect(concept.frontmatter.description).toBe('This is the first sentence.');
    });

    it('derives description correctly for single line without period', () => {
      const ssssNode = {
        type: 'memory',
        slug: 'test-slug',
        category: 'facts',
        title: 'Some Fact',
        created: '2026-06-17T12:00:00Z',
        body: 'Just a single line without any punctuation',
        schema_version: 2
      };

      const concept = ssssNodeToOkfConcept(ssssNode);
      expect(concept.frontmatter.description).toBe('Just a single line without any punctuation');
    });
  });

  describe('Round-trip', () => {
    it('preserves content from concept -> node -> concept', () => {
      const conceptOrig = {
        frontmatter: {
          type: 'Playbook',
          title: 'Deployment Playbook',
          description: 'Steps to deploy application',
          resource: 'https://docs.example.com',
          tags: ['deploy', 'prod'],
          timestamp: '2026-06-17T12:00:00Z'
        },
        body: 'Step 1: Build\nStep 2: Deploy'
      };

      const node = okfConceptToSsssNode(conceptOrig.frontmatter, conceptOrig.body, 'playbook.md');
      expect(node).not.toBeNull();
      
      const conceptResult = ssssNodeToOkfConcept(node);
      expect(conceptResult).not.toBeNull();
      expect(conceptResult.frontmatter.type).toBe('Pattern'); // 'Playbook' maps to 'patterns', which maps to 'Pattern'
      expect(conceptResult.frontmatter.title).toBe(conceptOrig.frontmatter.title);
      expect(conceptResult.frontmatter.description).toBe(conceptOrig.frontmatter.description);
      expect(conceptResult.frontmatter.resource).toBe(conceptOrig.frontmatter.resource);
      expect(conceptResult.frontmatter.tags).toEqual(conceptOrig.frontmatter.tags);
      expect(conceptResult.frontmatter.timestamp).toBe(conceptOrig.frontmatter.timestamp);
      expect(conceptResult.body).toBe(conceptOrig.body);
    });
  });

  describe('importBundle Integration', () => {
    let tempVaultDir;

    beforeEach(() => {
      tempVaultDir = path.join(os.tmpdir(), `total-recall-test-vault-${crypto.randomUUID()}`);
      fs.mkdirSync(tempVaultDir, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(tempVaultDir)) {
        fs.rmSync(tempVaultDir, { recursive: true, force: true });
      }
    });

    it('imports minimal bundle successfully', async () => {
      const report = await importBundle('fixtures/okf-bundles/minimal', tempVaultDir);
      expect(report.imported.length).toBe(1);
      expect(report.skipped.length).toBe(0);
      expect(report.errors.length).toBe(0);

      // Verify node was written
      const nodePath = path.join(tempVaultDir, 'concepts', 'concept.md');
      expect(fs.existsSync(nodePath)).toBe(true);

      const content = fs.readFileSync(nodePath, 'utf8');
      expect(content).toContain('slug: concept');
      expect(content).toContain('category: concepts');
    });

    it('imports full bundle successfully', async () => {
      const report = await importBundle('fixtures/okf-bundles/full', tempVaultDir);
      expect(report.imported.length).toBe(2);
      expect(report.skipped.length).toBe(0);
      expect(report.errors.length).toBe(0);

      // Verify table node
      const tablePath = path.join(tempVaultDir, 'facts', 'table.md');
      expect(fs.existsSync(tablePath)).toBe(true);
      const tableContent = fs.readFileSync(tablePath, 'utf8');
      expect(tableContent).toContain('bigquery://my-project.analytics.users');

      // Verify playbook node
      const playbookPath = path.join(tempVaultDir, 'patterns', 'playbook.md');
      expect(fs.existsSync(playbookPath)).toBe(true);
      const playbookContent = fs.readFileSync(playbookPath, 'utf8');
      expect(playbookContent).toContain('gs://backup-bucket/playbooks/restore.pdf');
    });

    it('respects dryRun option without writing files', async () => {
      const report = await importBundle('fixtures/okf-bundles/full', tempVaultDir, { dryRun: true });
      expect(report.imported.length).toBe(2);
      expect(report.skipped.length).toBe(0);
      expect(report.errors.length).toBe(0);

      // Verify no files were written (ignoring .events which is auto-created by engine)
      const files = fs.readdirSync(tempVaultDir).filter(f => f !== '.events');
      if (files.length > 0) fs.writeFileSync('debug-files.txt', files.join(',')); expect(files.length).toBe(0);
    });

    it('handles slug conflicts per strategy option', async () => {
      // First import
      await importBundle('fixtures/okf-bundles/minimal', tempVaultDir);

      // Second import with skip strategy
      const report1 = await importBundle('fixtures/okf-bundles/minimal', tempVaultDir, { onConflict: 'skip' });
      expect(report1.imported.length).toBe(0);
      expect(report1.skipped.length).toBe(1);
      expect(report1.skipped[0].reason).toContain('conflict');

      // Third import with overwrite strategy
      const report2 = await importBundle('fixtures/okf-bundles/minimal', tempVaultDir, { onConflict: 'overwrite' });
      expect(report2.imported.length).toBe(1);
      expect(report2.skipped.length).toBe(0);
    });

    it('applies category override to all nodes', async () => {
      const report = await importBundle('fixtures/okf-bundles/full', tempVaultDir, { category: 'invariants' });
      expect(report.imported.length).toBe(2);

      const tablePath = path.join(tempVaultDir, 'invariants', 'table.md');
      expect(fs.existsSync(tablePath)).toBe(true);
    });

    it('skips reserved index.md and log.md files', async () => {
      const report = await importBundle('fixtures/okf-bundles/with-reserved', tempVaultDir);
      expect(report.imported.length).toBe(1);
      expect(report.imported[0].file).toBe('concept.md');
      expect(report.skipped.length).toBe(0);
    });

    it('skips plain markdown files without frontmatter or type', async () => {
      const report = await importBundle('fixtures/okf-bundles/no-frontmatter', tempVaultDir);
      expect(report.imported.length).toBe(0);
      expect(report.skipped.length).toBe(1);
      expect(report.skipped[0].file).toBe('plain.md');
    });

    it('verifies audit trail entries and V2 validation', async () => {
      const report = await importBundle('fixtures/okf-bundles/full', tempVaultDir);
      expect(report.imported.length).toBe(2);

      // Verify audit trail file
      const auditLogPath = path.join(tempVaultDir, '.events', 'audit.jsonl');
      expect(fs.existsSync(auditLogPath)).toBe(true);

      const auditLines = fs.readFileSync(auditLogPath, 'utf8').trim().split('\n');
      expect(auditLines.length).toBeGreaterThanOrEqual(2);
      const parsedAudit = JSON.parse(auditLines[0]);
      expect(parsedAudit.event_type).toBe('audit');
      expect(parsedAudit.payload.resolved_type).toBe('memory');
    });
  });

  describe('exportBundle Integration', () => {
    let tempVaultDir;
    let tempExportDir;

    beforeEach(() => {
      tempVaultDir = path.join(os.tmpdir(), `total-recall-test-vault-${crypto.randomUUID()}`);
      fs.mkdirSync(tempVaultDir, { recursive: true });
      tempExportDir = path.join(os.tmpdir(), `total-recall-test-export-${crypto.randomUUID()}`);
    });

    afterEach(() => {
      if (fs.existsSync(tempVaultDir)) {
        fs.rmSync(tempVaultDir, { recursive: true, force: true });
      }
      if (fs.existsSync(tempExportDir)) {
        fs.rmSync(tempExportDir, { recursive: true, force: true });
      }
    });

    it('exports a vault successfully to a directory', async () => {
      await importBundle('fixtures/okf-bundles/full', tempVaultDir);

      const report = await exportBundle(tempVaultDir, tempExportDir);
      expect(report.exported.length).toBe(2);
      expect(report.indexGenerated).toBe(true);
      expect(report.logGenerated).toBe(true);

      expect(fs.existsSync(path.join(tempExportDir, 'facts', 'table.md'))).toBe(true);
      expect(fs.existsSync(path.join(tempExportDir, 'patterns', 'playbook.md'))).toBe(true);
      expect(fs.existsSync(path.join(tempExportDir, 'index.md'))).toBe(true);
      expect(fs.existsSync(path.join(tempExportDir, 'log.md'))).toBe(true);

      const indexContent = fs.readFileSync(path.join(tempExportDir, 'index.md'), 'utf8');
      expect(indexContent).toContain('[Users Database Table](./facts/table.md)');
      expect(indexContent).toContain('[Database Restore Playbook](./patterns/playbook.md)');

      const logContent = fs.readFileSync(path.join(tempExportDir, 'log.md'), 'utf8');
      expect(logContent).toContain('Operation');
    });

    it('strips SSSS fields when stripSsss option is true', async () => {
      await importBundle('fixtures/okf-bundles/full', tempVaultDir);

      const report = await exportBundle(tempVaultDir, tempExportDir, { stripSsss: true });
      expect(report.exported.length).toBe(2);

      const tableContent = fs.readFileSync(path.join(tempExportDir, 'facts', 'table.md'), 'utf8');
      expect(tableContent).toContain('type: Fact');
      expect(tableContent).toContain('title: Users Database Table');
      expect(tableContent).not.toContain('confidence:');
      expect(tableContent).not.toContain('schema_version:');
      expect(tableContent).not.toContain('decay:');
    });

    it('exports to a tar.gz archive successfully', async () => {
      await importBundle('fixtures/okf-bundles/full', tempVaultDir);

      const tarPath = `${tempExportDir}.tar.gz`;
      const report = await exportBundle(tempVaultDir, tarPath, { format: 'tar.gz' });
      expect(report.exported.length).toBe(2);
      expect(fs.existsSync(tarPath)).toBe(true);

      if (fs.existsSync(tarPath)) {
        fs.rmSync(tarPath, { force: true });
      }
    });

    it('preserves content in export -> import roundtrip', async () => {
      await importBundle('fixtures/okf-bundles/full', tempVaultDir);
      await exportBundle(tempVaultDir, tempExportDir);

      const freshVaultDir = path.join(os.tmpdir(), `total-recall-fresh-vault-${crypto.randomUUID()}`);
      fs.mkdirSync(freshVaultDir, { recursive: true });

      try {
        const report = await importBundle(tempExportDir, freshVaultDir);
        expect(report.imported.length).toBe(2);

        const tablePath = path.join(freshVaultDir, 'facts', 'facts-table.md');
        expect(fs.existsSync(tablePath)).toBe(true);
        const content = fs.readFileSync(tablePath, 'utf8');
        expect(content).toContain('Users Database Table');
      } finally {
        if (fs.existsSync(freshVaultDir)) {
          fs.rmSync(freshVaultDir, { recursive: true, force: true });
        }
      }
    });
  });

  describe('lintOkfCompliance Integration', () => {
    let tempVaultDir;

    beforeEach(() => {
      tempVaultDir = path.join(os.tmpdir(), `total-recall-test-vault-${crypto.randomUUID()}`);
      fs.mkdirSync(tempVaultDir, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(tempVaultDir)) {
        fs.rmSync(tempVaultDir, { recursive: true, force: true });
      }
    });

    it('reports zero warnings/errors for a fully-populated node', async () => {
      await importBundle('fixtures/okf-bundles/full', tempVaultDir);
      
      const { lintOkfCompliance } = await import('./okf-adapter.mjs');
      const report = lintOkfCompliance(tempVaultDir);
      expect(report.total).toBe(2);
      expect(report.pass).toBe(true);
      expect(report.warnings.length).toBe(0);
      expect(report.errors.length).toBe(0);
    });

    it('reports warnings for missing description or tags', async () => {
      await importBundle('fixtures/okf-bundles/minimal', tempVaultDir);
      
      const { lintOkfCompliance } = await import('./okf-adapter.mjs');
      const report = lintOkfCompliance(tempVaultDir);
      expect(report.total).toBe(1);
      expect(report.pass).toBe(true);
      expect(report.warnings.length).toBe(1);
      expect(report.warnings[0].message).toContain('Missing or empty tags');
    });

    it('reports errors instead of warnings in strict mode', async () => {
      await importBundle('fixtures/okf-bundles/minimal', tempVaultDir);
      
      const { lintOkfCompliance } = await import('./okf-adapter.mjs');
      const report = lintOkfCompliance(tempVaultDir, { strict: true });
      expect(report.total).toBe(1);
      expect(report.pass).toBe(false);
      expect(report.warnings.length).toBe(0);
      expect(report.errors.length).toBe(1);
      expect(report.errors[0].message).toContain('Missing or empty tags');
    });
  });
});
