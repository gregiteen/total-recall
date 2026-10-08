import { describe, it, expect } from 'vitest';
import { loadRegistries } from '@ssss/cli/registry';
import { HOST_TYPE_CATALOG } from './host-type-catalog.mjs';
import { SSSS_SCHEMAS } from './schema.mjs';
import { listHostOnlyTypes, listTypesProvidedByPackage } from './ssss-host-extension.mjs';

describe('canonical type compatibility', () => {
  it('preserves every existing schema name without duplicates', () => {
    expect([...HOST_TYPE_CATALOG].sort()).toEqual(Object.keys(SSSS_SCHEMAS).sort());
    expect(new Set(HOST_TYPE_CATALOG).size).toBe(HOST_TYPE_CATALOG.length);
  });

  it('preserves the package and host registry composition from legacy schemas', () => {
    const packageTypes = loadRegistries().types;
    const names = Object.keys(SSSS_SCHEMAS);
    expect(listHostOnlyTypes()).toEqual(names.filter(type => !packageTypes.has(type)).sort());
    expect(listTypesProvidedByPackage()).toEqual(names.filter(type => packageTypes.has(type)).sort());
  });
});
