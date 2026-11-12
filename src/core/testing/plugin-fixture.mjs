/**
 * Fixture manifests for specs that exercise plumbing rather than Home design.
 *
 * Every real plugin has a bespoke native Home declared in `ui.elements[]`, and the
 * validator enforces it. Specs that install, copy, vendor, discover or compile a
 * plugin still need a manifest that satisfies that contract, or they fail on a
 * rule they are not testing. This module supplies a minimal native Home so
 * those specs keep asserting what they mean to assert.
 *
 * The Home here is deliberately generic and exists only in tests. Production
 * plugin UI is always hand-authored per plugin (invariants-b6e8fcac).
 */
import fs from 'node:fs';
import path from 'node:path';

const nodeFs = fs;
const nodePath = path;

/** The smallest valid native Home. Declared once, as every plugin declares one. */
export const FIXTURE_HOME = Object.freeze({
  home: 'home',
  design_tokens: 'ui/DESIGN.md',
  elements: [
    {
      id: 'home',
      kind: 'panel',
      tag: 'tr-fixture-home',
      module: 'ui/home.js',
      description: 'Fixture native Home',
    },
  ],
});

/** Source of the element module referenced by FIXTURE_HOME. */
export const FIXTURE_HOME_SOURCE = 'export const tag = "tr-fixture-home";\n';

/**
 * Merge a native Home into a fixture manifest.
 *
 * Pass `ui: null` to omit the Home deliberately, e.g. when asserting that a
 * plugin without one is rejected.
 */
export function withFixtureHome(manifest = {}) {
  if (manifest.ui === null) {
    const { ui: _omitted, ...rest } = manifest;
    return rest;
  }
  return { ...manifest, ui: manifest.ui ?? { ...FIXTURE_HOME } };
}

/**
 * Write `plugin.json` for a fixture plugin, declaring a Home unless the manifest
 * explicitly opts out with `ui: null`.
 *
 * Returns the manifest that was written.
 */
export function writeFixturePlugin(pluginDir, manifest, { fs = nodeFs, path = nodePath } = {}) {
  const written = withFixtureHome(manifest);
  nodeFs.writeFileSync(
    nodePath.join(pluginDir, 'plugin.json'),
    JSON.stringify(written, null, 2),
  );
  if (written.ui?.elements?.length) {
    const uiDir = nodePath.join(pluginDir, 'ui');
    nodeFs.mkdirSync(uiDir, { recursive: true });
    nodeFs.writeFileSync(nodePath.join(uiDir, 'home.js'), FIXTURE_HOME_SOURCE);
    nodeFs.writeFileSync(nodePath.join(uiDir, 'DESIGN.md'), '# Fixture Home\n');
  }
  return written;
}
