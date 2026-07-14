import { describe, it, expect, vi } from 'vitest';
import * as m from './index.mjs';

describe('CLI Ingest: index', () => {
  it('exports something', () => {
    expect(m).toBeDefined();
  });
});
