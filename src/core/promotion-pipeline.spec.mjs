import { describe, it, expect } from 'vitest';
import { promoteFeedback } from './promotion-pipeline.mjs';

describe('Promotion Pipeline', () => {
  it('prevents promotion to system_candidate from unsupported scopes', () => {
    const memoryNode = {
      feedback_scope: 'account',
      __body__: 'Test'
    };
    const result = promoteFeedback(memoryNode, 'system_candidate');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Cannot promote to system_candidate from account/);
  });

  it('strips provenance and PII when promoting to system_candidate', () => {
    const memoryNode = {
      feedback_scope: 'workspace',
      workspace_id: 'ws-1234',
      user_id: 'user-9876',
      source: {
        session_id: 'sess-abc',
        agent: 'my-assistant',
        evidence_count: 3
      },
      x_location: { lat: 0, lon: 0 },
      x_browser_context: { url: 'http://localhost' },
      x_citations: [{ url: 'http://private-doc' }],
      __body__: 'Fix the alignment for assistant 123e4567-e89b-12d3-a456-426614174000.'
    };

    const result = promoteFeedback(memoryNode, 'system_candidate');
    
    expect(result.success).toBe(true);
    expect(result.node.feedback_scope).toBe('system_candidate');
    expect(result.node.workspace_id).toBeUndefined();
    expect(result.node.user_id).toBeUndefined();
    expect(result.node.source.session_id).toBeUndefined();
    expect(result.node.source.agent).toBeUndefined();
    expect(result.node.source.evidence_count).toBe(3);
    expect(result.node.x_location).toBeUndefined();
    expect(result.node.x_browser_context).toBeUndefined();
    expect(result.node.x_citations).toBeUndefined();
    
    // UUID scrubbing check
    expect(result.node.__body__).toContain('[REDACTED_UUID]');
    expect(result.node.__body__).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });

  it('allows promotion from system_candidate to system_promoted', () => {
    const memoryNode = {
      feedback_scope: 'system_candidate',
      __body__: 'Test'
    };
    const result = promoteFeedback(memoryNode, 'system_promoted');
    expect(result.success).toBe(true);
    expect(result.node.feedback_scope).toBe('system_promoted');
  });

  it('prevents direct promotion to system_promoted from workspace', () => {
    const memoryNode = {
      feedback_scope: 'workspace',
      __body__: 'Test'
    };
    const result = promoteFeedback(memoryNode, 'system_promoted');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Cannot promote to system_promoted directly from workspace/);
  });
});
