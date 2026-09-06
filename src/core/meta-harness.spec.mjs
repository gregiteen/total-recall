import { describe, it, expect } from 'vitest';
import { HARNESS_SPECS, detectHarnesses, dispatchTask } from './meta-harness.mjs';

describe('Meta Harness & Multi-Agent Manager', () => {
  it('defines all canonical harness specs with verified flags', () => {
    expect(HARNESS_SPECS).toHaveProperty('agy');
    expect(HARNESS_SPECS).toHaveProperty('claude');
    expect(HARNESS_SPECS).toHaveProperty('codex');
    expect(HARNESS_SPECS).toHaveProperty('gemini');
    expect(HARNESS_SPECS).toHaveProperty('ollama');

    expect(HARNESS_SPECS.agy.defaultFlags).toContain('-p');
    expect(HARNESS_SPECS.claude.defaultFlags).toContain('--permission-mode');
    expect(HARNESS_SPECS.codex.defaultFlags).toContain('exec');
    expect(HARNESS_SPECS.gemini.defaultFlags).toContain('--sandbox=false');
    expect(HARNESS_SPECS.ollama.defaultFlags).toContain('run');
  });

  it('detects available harnesses without crashing', () => {
    const detected = detectHarnesses();
    expect(Array.isArray(detected)).toBe(true);
    expect(detected.length).toBe(5);
    for (const h of detected) {
      expect(h).toHaveProperty('id');
      expect(h).toHaveProperty('name');
      expect(h).toHaveProperty('available');
    }
  });

  it('throws error when dispatching to an unknown harness', async () => {
    await expect(dispatchTask('non-existent-harness', 'test prompt')).rejects.toThrow(
      'Unknown harness ID: "non-existent-harness"',
    );
  });
});
