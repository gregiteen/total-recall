/**
 * Fixture manifests for specs that exercise plumbing rather than card design.
 *
 * Every real plugin has a bespoke card face declared in `ui.elements[]`, and the
 * validator enforces it. Specs that install, copy, vendor, discover or compile a
 * plugin still need a manifest that satisfies that contract, or they fail on a
 * rule they are not testing. This module supplies the smallest honest face so
 * those specs keep asserting what they mean to assert.
 *
 * The face here is deliberately generic and exists only in tests. Production
 * plugin UI is always hand-authored per plugin (invariants-b6e8fcac).
 */
import fs from 'node:fs';
import path from 'node:path';

const nodeFs = fs;
const nodePath = path;

/** The smallest valid card face. Declared once, as every plugin declares one. */
export const FIXTURE_CARD_FACE = Object.freeze({
  design_tokens: 'ui/DESIGN.md',
  elements: [
    {
      id: 'card',
      kind: 'card',
      tag: 'tr-fixture-card',
      module: 'ui/card.js',
      description: 'Fixture card face',
    },
  ],
});

/** Source of the element module referenced by FIXTURE_CARD_FACE. */
export const FIXTURE_CARD_SOURCE = 'export const tag = "tr-fixture-card";\n';

/**
 * Merge a bespoke face into a fixture manifest.
 *
 * Pass `ui: null` to omit the face deliberately, e.g. when asserting that a
 * plugin without one is rejected.
 */
export function withFixtureFace(manifest = {}) {
  if (manifest.ui === null) {
    const { ui: _omitted, ...rest } = manifest;
    return rest;
  }
  return { ...manifest, ui: manifest.ui ?? { ...FIXTURE_CARD_FACE } };
}

/**
 * Write `plugin.json` for a fixture plugin, declaring a face unless the manifest
 * explicitly opts out with `ui: null`.
 *
 * Returns the manifest that was written.
 */
export function writeFixturePlugin(pluginDir, manifest, { fs = nodeFs, path = nodePath } = {}) {
  const written = withFixtureFace(manifest);
  nodeFs.writeFileSync(
    nodePath.join(pluginDir, 'plugin.json'),
    JSON.stringify(written, null, 2),
  );
  if (written.ui?.elements?.length) {
    const uiDir = nodePath.join(pluginDir, 'ui');
    nodeFs.mkdirSync(uiDir, { recursive: true });
    nodeFs.writeFileSync(nodePath.join(uiDir, 'card.js'), FIXTURE_CARD_SOURCE);
    nodeFs.writeFileSync(nodePath.join(uiDir, 'DESIGN.md'), '# Fixture card\n');
  }
  return written;
}
