import { describe, it, expect } from 'vitest';
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
