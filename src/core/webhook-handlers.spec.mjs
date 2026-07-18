import { describe, expect, it, vi } from 'vitest';
import { handleWebhook } from './webhook-handlers.mjs';

vi.mock('./logger.mjs', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

describe('webhook-handlers', () => {
  it('records known events without queuing shell commands', async () => {
    await expect(handleWebhook('github', 'push', {})).resolves.toEqual({ handled: true, action: 'recorded' });
    await expect(handleWebhook('stripe', 'payment_intent.succeeded', {})).resolves.toEqual({ handled: true, action: 'recorded' });
  });

  it('ignores unknown events safely', async () => {
    await expect(handleWebhook('github', 'mystery', {})).resolves.toEqual({ handled: false, action: 'ignored' });
  });
});
