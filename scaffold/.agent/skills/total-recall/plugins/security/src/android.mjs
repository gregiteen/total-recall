const properties = ['ro.boot.verifiedbootstate', 'ro.boot.flash.locked', 'ro.crypto.state', 'ro.build.version.security_patch'];
export function auditAndroid({ execute, serial, hostname = 'Android runtime' }) {
  if (serial !== undefined) {
    if (typeof serial !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(serial)) throw new Error('Explicit authorized device serial required');
    const inventory = execute('adb', ['devices']);
    if (!inventory.ok || !inventory.output.split('\n').some(line => line.trim().split(/\s+/)[0] === serial && line.trim().split(/\s+/)[1] === 'device')) throw new Error('Device is not present and authorized; no connection or debugging changes were attempted');
    hostname = serial;
  }
  const checks = properties.map(property => {
    const result = serial ? execute('adb', ['-s', serial, 'shell', 'getprop', property]) : execute('getprop', [property]);
    const value = result.ok ? result.output.trim() : '';
    let state = 'unavailable', observed;
    if (property.endsWith('verifiedbootstate') && ['green', 'yellow', 'orange', 'red'].includes(value)) { state = value === 'green' ? 'pass' : 'fail'; observed = value; }
    if (property.endsWith('flash.locked') && ['0', '1'].includes(value)) { state = value === '1' ? 'pass' : 'fail'; observed = value; }
    if (property === 'ro.crypto.state' && ['encrypted', 'unencrypted'].includes(value)) { state = value === 'encrypted' ? 'pass' : 'fail'; observed = value; }
    if (property.endsWith('security_patch') && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) { state = Date.parse(value) > Date.now() + 86400000 ? 'unavailable' : 'review'; observed = value; }
    return { id: property, state, evidence: state === 'unavailable' ? 'none' : 'device-reported-property', ...(observed ? { observed } : {}), remediation: 'Review the manufacturer security settings and support policy. Properties are not hardware attestation; never flash, root or relock a device through this tool.' };
  });
  checks.push({ id: 'device-settings-review', state: 'unavailable', evidence: 'none', remediation: 'Complete security device --platform android for screen lock, app protection, permissions, accounts, debugging and network access.' });
  return { schema: 'security-machine/v1', platform: 'android', hostname, timestamp: new Date().toISOString(), status: checks.some(v => v.state === 'fail') ? 'at-risk' : 'incomplete', coverage: { complete: false, observed: checks.filter(v => v.state !== 'unavailable').length, total: checks.length, limitations: ['Device-reported properties only; rooted devices may misreport state', 'No hardware attestation or full settings inspection', 'Never enable debugging solely for a scan; revoke unused debugging access after use'] }, checks, listeners: [] };
}
