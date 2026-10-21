// Fixed native queries select posture only, never BitLocker recovery material.
const queries = {
  firewall: "Get-NetFirewallProfile -PolicyStore ActiveStore | Select-Object Name,@{Name='Enabled';Expression={$_.Enabled.ToString()}},DefaultInboundAction",
  antivirus: 'Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,AMRunningMode,AntivirusSignatureAge',
  encryption: 'Get-BitLockerVolume -MountPoint $env:SystemDrive | Select-Object VolumeStatus,ProtectionStatus,EncryptionPercentage',
  'secure-boot': 'Confirm-SecureBootUEFI',
  tcp: 'Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort',
  udp: 'Get-NetUDPEndpoint | Select-Object LocalAddress,LocalPort',
};
export function auditWindows({ execute, hostname }) {
  const checks = [], listeners = [];
  for (const [id, query] of Object.entries(queries)) {
    const result = execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; @(${query}) | ConvertTo-Json -Compress -Depth 3`]);
    let values, state = 'unavailable';
    try { if (result.ok) { values = JSON.parse(result.output); if (!Array.isArray(values)) values = [values]; } } catch { /* malformed output is unavailable */ }
    if (values?.length) {
      if (id === 'firewall' && ['Domain', 'Private', 'Public'].every(name => values.filter(v => v?.Name === name).length === 1) && values.length === 3 && values.every(v => [true, false, 'True', 'False'].includes(v.Enabled))) state = values.every(v => v.Enabled === true || v.Enabled === 'True') ? 'review' : 'fail';
      if (id === 'antivirus' && values.length === 1 && typeof values[0]?.AntivirusEnabled === 'boolean' && typeof values[0]?.RealTimeProtectionEnabled === 'boolean') state = values[0].AntivirusEnabled && values[0].RealTimeProtectionEnabled && values[0].AMRunningMode === 'Normal' && Number.isInteger(values[0].AntivirusSignatureAge) && values[0].AntivirusSignatureAge <= 1 && values[0].AntivirusSignatureAge >= 0 ? 'pass' : 'review';
      if (id === 'encryption' && values.length === 1) {
        const v = values[0];
        if (v && [0, 1, 'On', 'Off'].includes(v.ProtectionStatus) && Number.isFinite(v.EncryptionPercentage) && v.EncryptionPercentage >= 0 && v.EncryptionPercentage <= 100) state = [1, 'On'].includes(v.ProtectionStatus) && v.EncryptionPercentage === 100 ? 'pass' : 'fail';
      }
      if (id === 'secure-boot' && values.length === 1 && typeof values[0] === 'boolean') state = values[0] ? 'pass' : 'fail';
    }
    if ((id === 'tcp' || id === 'udp') && values && values.every(v => v && typeof v.LocalAddress === 'string' && /^[0-9a-fA-F:.%]+$/.test(v.LocalAddress) && Number.isInteger(v.LocalPort) && v.LocalPort > 0 && v.LocalPort <= 65535)) {
      const endpoints = values.map(v => ({ address: v.LocalAddress, port: v.LocalPort, protocol: id, scope: ['0.0.0.0', '::'].includes(v.LocalAddress) ? 'all-interfaces' : v.LocalAddress === '::1' || /^127\./.test(v.LocalAddress) ? 'loopback' : 'interface' }));
      listeners.push(...endpoints); state = endpoints.some(v => v.scope !== 'loopback') ? 'review' : 'pass';
    }
    const guidance = {
      firewall: 'Review all three active firewall profiles and inbound allow rules. Enabled profiles alone do not certify blocked exposure. Preserve a verified management path before changes.',
      antivirus: 'Review Windows Security active providers, real-time protection and signature updates. Passive or unavailable built-in protection requires checking the actual installed provider.',
      encryption: 'Review system-volume Device encryption / BitLocker protection and recovery custody. This query does not inspect other disks or collect recovery keys.',
      'secure-boot': 'Review UEFI Secure Boot and hardware requirements. Unsupported firmware or insufficient privilege is unverified, not disabled. Keep recovery access before firmware changes.',
      tcp: 'Review non-loopback TCP listeners and firewall rules; local binds do not prove remote reachability.',
      udp: 'Review UDP bindings and firewall rules; verify reachability from an authorized external vantage.',
    };
    checks.push({ id, state, evidence: state === 'unavailable' ? 'none' : 'native-command', severity: state === 'fail' ? 'HIGH' : null, remediation: state === 'pass' ? null : guidance[id], ...(state === 'unavailable' ? { reason: 'native-query-unavailable-or-invalid; edition, permission or tooling may restrict access' } : {}) });
  }
  checks.push({ id: 'patch-currency', state: 'unavailable', evidence: 'none', remediation: 'Review Windows Update and support entitlement for the installed release. Service presence cannot certify patch currency.' });
  const complete = checks.every(v => v.state !== 'unavailable');
  return { schema: 'security-machine/v1', hostname, platform: 'win32', timestamp: new Date().toISOString(), status: checks.some(v => v.state === 'fail') ? 'at-risk' : !complete ? 'incomplete' : 'review-required', coverage: { complete, observed: checks.filter(v => v.state !== 'unavailable').length, total: checks.length, limitations: ['Current machine only; no administrative changes', 'Patch currency and alternate antivirus providers require review', 'System volume only; no recovery keys collected', 'Listener visibility does not certify Internet exposure'] }, checks, listeners };
}
