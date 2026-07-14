import { describe, it, expect, vi } from 'vitest';
import * as m from './ingest/index.mjs';

describe('CLI Ingest: index', () => {
  it('exports something', () => {
    expect(m).toBeDefined();
  });
});
