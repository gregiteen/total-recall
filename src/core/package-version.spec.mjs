import { describe, expect, it } from 'vitest';
import { comparePackageVersions, packageVersionStatus } from './package-version.mjs';

describe('public release precedence', () => {
  it.each([
    ['3.38.0', '3.37.0', 'preview_features'],
    ['3.38.0-preview.2', '3.37.0', 'preview_features'],
    ['3.37.0-preview.2', '3.37.0', 'update_available'],
    ['3.37.0', '3.37.0', 'current'],
    ['3.37.0+local.4', '3.37.0', 'current'],
    ['3.9.0', '3.10.0', 'update_available'],
    [null, '3.37.0', 'not_installed'],
    ['garbage', '3.37.0', 'unknown'],
    ['3.38.0', '', 'unknown'],
    ['3.37.0-preview.01', '3.37.0', 'unknown'],
  ])('%s against %s is %s', (installed, latest, status) => {
    expect(packageVersionStatus(installed, latest)).toBe(status);
  });

  it('orders prereleases by numeric and lexical identifiers', () => {
    const versions = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
    for (let i = 1; i < versions.length; i++) {
      expect(comparePackageVersions(versions[i - 1], versions[i])).toBe(-1);
      expect(comparePackageVersions(versions[i], versions[i - 1])).toBe(1);
    }
  });
});
