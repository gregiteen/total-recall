import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureMessage, listCaptureInbox } from './quick-capture.mjs';

let tmpHome;
let homedirSpy;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-capture-'));
  homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
});

afterEach(() => {
  homedirSpy.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('captureMessage', () => {
  it('writes a JSON file to the capture inbox', () => {
    const result = captureMessage({ text: 'hello from Slack', source: 'slack', author: 'alice', channel: 'general' });
    expect(result.slug).toMatch(/^capture-slack-/);
    expect(fs.existsSync(result.file)).toBe(true);
    const node = JSON.parse(fs.readFileSync(result.file, 'utf8'));
    expect(node.status).toBe('draft');
    expect(node.tags).toContain('slack');
    expect(node.tags).toContain('general');
    expect(node.source.agent).toBe('alice');
    expect(node.raw_content).toBe('hello from Slack');
  });

  it('writes a Discord capture node', () => {
    const result = captureMessage({ text: 'Discord message', source: 'discord' });
    const node = JSON.parse(fs.readFileSync(result.file, 'utf8'));
    expect(node.tags).toContain('discord');
  });

  it('classifies task-like messages', () => {
    const result = captureMessage({ text: 'TODO fix the login bug', source: 'slack' });
    const node = JSON.parse(fs.readFileSync(result.file, 'utf8'));
    expect(node.predicate).toBe('needs_to');
  });

  it('throws on empty text', () => {
    expect(() => captureMessage({ text: '', source: 'slack' })).toThrow('text is required');
  });

  it('throws on invalid source', () => {
    expect(() => captureMessage({ text: 'hi', source: 'telegram' })).toThrow('source must be');
  });
});

describe('listCaptureInbox', () => {
  it('returns empty array when inbox does not exist', () => {
    expect(listCaptureInbox()).toEqual([]);
  });

  it('lists nodes after capture', () => {
    captureMessage({ text: 'first', source: 'slack' });
    captureMessage({ text: 'second', source: 'discord' });
    const nodes = listCaptureInbox();
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    // Most recent first
    expect(nodes[0].created >= nodes[1].created).toBe(true);
  });
});
