import { describe, it, expect } from 'vitest';
import { loadApiRoutes, actionFor } from './api-routes.mjs';

describe('api-routes', () => {
  it('names actions from the static path and the method', () => {
    expect(actionFor('GET', '/api/rules', 'rules')).toBe('list');
    expect(actionFor('DELETE', '/api/notifications/rules/:id', 'notifications')).toBe('rules');
    expect(actionFor('POST', '/api/notifications/test', 'notifications')).toBe('test');
  });

  it('reads every route group and gives each route a unique verb', async () => {
    const routes = await loadApiRoutes();
    expect(routes.length).toBeGreaterThan(100);
    const groups = new Set(routes.map((r) => r.group));
    for (const g of ['rules', 'secrets', 'notifications', 'mesh', 'memory']) expect(groups.has(g)).toBe(true);
    const verbs = routes.map((r) => `${r.group} ${r.action}`);
    expect(new Set(verbs).size).toBe(verbs.length);
  });
});
