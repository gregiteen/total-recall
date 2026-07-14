import { describe, it, expect } from 'vitest';
import { listHostOnlyTypes, listTypesProvidedByPackage, listCoreTypes, listMissingCoreSchemas, buildTotalRecallHostExtension, getTotalRecallHostExtension, TOTAL_RECALL_HOST_EXTENSION } from './ssss-host-extension.mjs';

describe('ssss-host-extension.mjs', () => {
  it('exports listHostOnlyTypes', () => {
    expect(listHostOnlyTypes).toBeDefined();
  });
  it('exports listTypesProvidedByPackage', () => {
    expect(listTypesProvidedByPackage).toBeDefined();
  });
  it('exports listCoreTypes', () => {
    expect(listCoreTypes).toBeDefined();
  });
  it('exports listMissingCoreSchemas', () => {
    expect(listMissingCoreSchemas).toBeDefined();
  });
  it('exports buildTotalRecallHostExtension', () => {
    expect(buildTotalRecallHostExtension).toBeDefined();
  });
  it('exports getTotalRecallHostExtension', () => {
    expect(getTotalRecallHostExtension).toBeDefined();
  });
  it('exports TOTAL_RECALL_HOST_EXTENSION', () => {
    expect(TOTAL_RECALL_HOST_EXTENSION).toBeDefined();
  });
});
