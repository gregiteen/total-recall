import { describe, it, expect } from 'vitest';
import { proposalsRouter } from './proposals.mjs';

describe('routes/proposals.mjs', () => {
  it('exports a router', () => {
    expect(proposalsRouter).toBeDefined();
  });

  it('registers every route with an explicit path (never a bare use)', () => {
    // A pathless middleware in a root-mounted sub-router runs on EVERY request,
    // which would 401-gate the static frontend and the login page itself.
    for (const layer of proposalsRouter.stack) {
      expect(layer.route, 'proposalsRouter must contain only path-bound routes').toBeTruthy();
      expect(layer.route.path.startsWith('/api/proposals')).toBe(true);
    }
  });
});
