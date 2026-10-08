/** Semantic version precedence for public npm releases and local previews. */
function parse(version) {
  if (typeof version !== 'string') return null;
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version);
  if (!match) return null;
  const prerelease = match[4]?.split('.') || [];
  if (prerelease.some(value => /^\d+$/.test(value) && value.length > 1 && value[0] === '0')) return null;
  return { core: match.slice(1, 4).map(BigInt), prerelease };
}

/** Returns -1, 0, 1, or null when either version is unknown/invalid. */
export function comparePackageVersions(left, right) {
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return BigInt(x) < BigInt(y) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function packageVersionStatus(installed, latest) {
  if (!parse(latest)) return 'unknown';
  if (!installed) return 'not_installed';
  const comparison = comparePackageVersions(installed, latest);
  if (comparison === null) return 'unknown';
  return comparison > 0 ? 'preview_features' : comparison < 0 ? 'update_available' : 'current';
}
