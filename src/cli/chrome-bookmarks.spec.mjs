import { describe, it, expect, vi } from 'vitest';
import * as m from './ingest/parsers/chrome-bookmarks.mjs';

describe('CLI Ingest: chrome-bookmarks', () => {
  it('exports something', () => {
    expect(m).toBeDefined();
  });
});
