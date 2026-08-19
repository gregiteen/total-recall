import { describe, it, expect } from 'vitest';
import {
  looksLikeLoginUrl,
  resolveProfileDir,
  ensureProfileDir,
  clearProfile,
} from './browser-session.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('core: browser-session', () => {
  it('identifies typical login and signin URLs', () => {
    expect(looksLikeLoginUrl('https://example.com/login')).toBe(true);
    expect(looksLikeLoginUrl('https://example.com/sign-in?next=/dashboard')).toBe(true);
    expect(looksLikeLoginUrl('https://example.com/auth/login')).toBe(true);
    expect(looksLikeLoginUrl('https://example.com/sessions/new')).toBe(true);
    expect(looksLikeLoginUrl('https://example.com/dashboard/apikeys')).toBe(false);
    expect(looksLikeLoginUrl('')).toBe(false);
  });

  it('resolves and manages profile directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-browser-test-'));
    try {
      const profileDir = resolveProfileDir(tmp);
      expect(profileDir).toContain('browser-profile');

      const created = ensureProfileDir(tmp);
      expect(fs.existsSync(created)).toBe(true);
      expect(fs.existsSync(path.join(created, 'README.md'))).toBe(true);

      const cleared = clearProfile(tmp);
      expect(cleared.removed).toBe(true);
      expect(fs.existsSync(created)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
