import { describe, it, expect } from 'vitest';
import commandCmd from './command.mjs';

describe('command.mjs', () => {
  it('exports default', () => {
    expect(commandCmd).toBeDefined();
  });
});
