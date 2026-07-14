import { describe, it, expect } from 'vitest';
import { waitForInstallOptions, syncInstallOptionsFromDisk, startDeployUI, vastAPI, provisionVastAI, emitProgress, finishDeployUI, openBrowser } from './deploy-ui.mjs';

describe('deploy-ui.mjs', () => {
  it('exports waitForInstallOptions', () => {
    expect(waitForInstallOptions).toBeDefined();
  });
  it('exports syncInstallOptionsFromDisk', () => {
    expect(syncInstallOptionsFromDisk).toBeDefined();
  });
  it('exports startDeployUI', () => {
    expect(startDeployUI).toBeDefined();
  });
  it('exports vastAPI', () => {
    expect(vastAPI).toBeDefined();
  });
  it('exports provisionVastAI', () => {
    expect(provisionVastAI).toBeDefined();
  });
  it('exports emitProgress', () => {
    expect(emitProgress).toBeDefined();
  });
  it('exports finishDeployUI', () => {
    expect(finishDeployUI).toBeDefined();
  });
  it('exports openBrowser', () => {
    expect(openBrowser).toBeDefined();
  });
});
