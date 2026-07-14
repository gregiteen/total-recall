import { describe, it, expect } from 'vitest';
import { sendSystemNotification } from './notifications.mjs';

describe('notifications.mjs', () => {
  it('exports sendSystemNotification', () => {
    expect(sendSystemNotification).toBeDefined();
  });
});
