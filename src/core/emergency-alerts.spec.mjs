import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { writeEmergencyAlert, clearEmergencyAlerts, readEmergencyAlerts, runStartupHealthCheck } from './emergency-alerts.mjs';

describe('emergency-alerts.mjs', () => {
  it('exports writeEmergencyAlert', () => {
    expect(writeEmergencyAlert).toBeDefined();
  });
  it('exports clearEmergencyAlerts', () => {
    expect(clearEmergencyAlerts).toBeDefined();
  });
  it('exports readEmergencyAlerts', () => {
    expect(readEmergencyAlerts).toBeDefined();
  });
  it('exports runStartupHealthCheck', () => {
    expect(runStartupHealthCheck).toBeDefined();
  });
});
