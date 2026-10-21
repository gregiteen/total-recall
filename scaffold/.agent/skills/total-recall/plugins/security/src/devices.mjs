const apple = 'https://support.apple.com/guide/personal-safety/welcome/web';
const android = 'https://support.google.com/android/answer/7680439';
const chrome = 'https://support.google.com/chromebook/answer/9367166';
const windows = 'https://learn.microsoft.com/en-us/windows/security/';
const check = (id, title, remediation, source) => ({ id, title, remediation, source });
const appleChecks = [
  check('updates', 'OS and security updates reviewed', 'Open Settings → General → Software Update. Install available supported updates and review Automatic Updates. A version number alone does not prove current protection.', apple),
  check('screen-lock', 'Strong passcode and automatic lock', 'Review Face ID / Touch ID & Passcode and Display & Brightness → Auto-Lock. Use a strong unique passcode; never enter that passcode in this assessment.', apple),
  check('account-recovery', 'Account protection and recovery reviewed', 'In Settings → your account → Sign-In & Security, review two-factor authentication, trusted devices and recovery options. Keep recovery material outside this report.', apple),
  check('lost-device', 'Lost-device protection enabled', 'Review Find My and Activation Lock for this device. Confirm recovery access before changing account settings.', apple),
  check('management', 'Management profiles and VPNs recognized', 'Review Settings → General → VPN & Device Management. Investigate unknown profiles or VPNs; coordinate legitimate managed policies with your administrator.', apple),
  check('app-permissions', 'App access and sharing reviewed', 'Review Privacy & Security permissions, location access and installed apps. Restrict unnecessary camera, microphone, contacts and tracking access.', 'https://support.apple.com/en-us/102515'),
  check('network', 'Wi-Fi and network exposure reviewed', 'Review known Wi-Fi networks, Auto-Join, hotspot access and sharing settings. Use trusted encrypted networks; inspect the router separately. An active VPN is not proof that the device is secure.', apple),
];
const profiles = {
  ios: { name: 'iPhone', limitations: ['No native device-posture collector or management enrollment is established', 'A browser cannot inspect passcodes, installed profiles or OS protection settings'], checks: [...appleChecks,
    check('sharing-safety', 'Safety Check and theft protection reviewed', 'Use Settings → Privacy & Security → Safety Check → Manage Sharing & Access when available. Review Stolen Device Protection under Face ID / Touch ID & Passcode. Consider the personal impact before revoking sharing.', 'https://support.apple.com/en-euro/guide/personal-safety/-ips2aad835e1/web'),
    check('targeted-threats', 'Targeted-threat protection considered', 'Review whether Lockdown Mode is appropriate for your threat model. It is optional and restricts functionality; leaving it off is not itself a failed baseline. Mark reviewed after making an informed choice.', 'https://support.apple.com/en-us/105120'),
  ] },
  ipados: { name: 'iPad', limitations: ['No native device-posture collector or management enrollment is established', 'iPhone Safety Check and Stolen Device Protection are not assumed available on iPad'], checks: [...appleChecks,
    check('targeted-threats', 'Targeted-threat protection considered', 'Review Lockdown Mode in Privacy & Security for targeted threats. It is optional and restricts functionality; decide whether it fits your risk.', 'https://support.apple.com/en-us/105120'),
  ] },
  android: { name: 'Android', limitations: ['Native property checks require an existing authorized ADB session or an Android runtime', 'Property reads are not hardware attestation and cannot prove a rooted device is trustworthy'], checks: [
    check('updates', 'OS, security patch and system updates reviewed', 'Review Settings → About phone/tablet → Android version and System → Software updates. Check OS, security-patch and system-update status plus your manufacturer support period.', android),
    check('screen-lock', 'Strong screen lock and automatic locking', 'Review Security & Privacy → Device unlock / Screen lock. Use a strong unique PIN or password with automatic locking; never enter it in this assessment.', android),
    check('app-protection', 'App protection and certification reviewed', 'On devices with Google Play, review Play Store → profile → Play Protect and Settings → About → certification. On another distribution, review its documented equivalent; do not assume Play services exist.', 'https://support.google.com/googleplay/answer/2812853'),
    check('boot-integrity', 'Boot integrity and modifications reviewed', 'Review boot warnings and manufacturer bootloader/root status. Do not relock or flash a bootloader from this tool: those changes can erase data or prevent booting.', 'https://source.android.com/docs/core/architecture/bootloader/locking_unlocking'),
    check('debugging', 'Debugging and unknown-app installation restricted', 'Review Developer options → USB/Wireless debugging and per-app Install unknown apps permissions. Revoke unneeded debugging authorizations; do not enable debugging solely for a security scan.', android),
    check('permissions', 'Accessibility, device-admin and app access reviewed', 'Review Privacy & Security, Accessibility services, Device admin apps and special app access. Investigate unrecognized administrators or services before making changes.', android),
    check('account-recovery', 'Account recovery and lost-device access reviewed', 'Review your account security, two-factor authentication and supported lost-device location/lock features. Confirm recovery access without recording keys or codes.', android),
    check('network', 'Wi-Fi, hotspot and VPN access reviewed', 'Remove untrusted saved Wi-Fi networks, restrict hotspot access and inspect VPN permissions. Inspect router firmware, management and wireless encryption separately.', android),
  ] },
  chromeos: { name: 'Chromebook / ChromeOS', limitations: ['Linux development-container checks do not measure the ChromeOS host', 'Verified Access and enterprise device-management APIs are not connected'], checks: [
    check('updates', 'OS update and support expiration reviewed', 'Open Settings → About ChromeOS → Check for updates and Additional details → Update schedule. Confirm the model still receives security updates and restart to complete pending updates.', chrome),
    check('verified-boot', 'Verified boot and developer mode reviewed', 'Review boot warnings and developer-mode state. Preserve normal verified boot for everyday use. Leaving developer mode can erase local data; back up and follow the model-specific recovery procedure.', 'https://www.chromium.org/chromium-os/chromiumos-design-docs/verified-boot/'),
    check('screen-lock', 'Screen lock and account authentication reviewed', 'Review Security and Privacy → Lock screen and sign-in. Require authentication after sleep; protect the account with a passkey or two-factor authentication.', chrome),
    check('extensions', 'Browser extensions and site permissions reviewed', 'Review Chrome extensions and Safety Check. Remove unrecognized extensions and restrict site camera, microphone, notification and location permissions.', 'https://support.google.com/chrome/answer/3014197'),
    check('containers', 'Linux/Android environments and sharing reviewed', 'Review Linux development-environment shared folders, forwarded ports and Android app permissions. Audit each container separately; its results cannot certify the host.', 'https://support.google.com/chromebook/answer/9145439'),
    check('management', 'Device management and account access recognized', 'Review device management, signed-in accounts and administrator policies. Investigate unfamiliar control without removing legitimate managed configuration.', 'https://support.google.com/chrome/a/answer/1375678'),
    check('network', 'Wi-Fi and private-service exposure reviewed', 'Review saved networks, VPN access, device sharing and container port forwarding. Inspect router access and encryption separately; mesh connectivity alone proves no security posture.', chrome),
  ] },
  windows: { name: 'Windows', limitations: ['Guided review is separate from the native machine collector', 'No administrative changes are applied by this assessment'], checks: [
    check('updates', 'Supported Windows release and updates reviewed', 'Open Settings → Windows Update. Install available updates and confirm support or extended-security entitlement for this exact release. Update-service presence alone is insufficient.', windows),
    check('antivirus', 'Active antivirus provider and real-time protection reviewed', 'Review Windows Security → Virus & threat protection, active security providers, real-time protection and definition updates. A disabled built-in provider may require reviewing another installed provider.', windows),
    check('firewall', 'Firewall profiles and inbound rules reviewed', 'Review Windows Security → Firewall & network protection for Domain, Private and Public profiles and their rules. Preserve verified administrative access before changing rules.', windows),
    check('encryption', 'Disk encryption and recovery custody reviewed', 'Review Device encryption or BitLocker, protection state and recovery-key custody. Never paste a recovery key in this assessment; enabling encryption needs a verified backup and recovery plan.', windows),
    check('boot-integrity', 'Secure Boot and hardware protection reviewed', 'Review System Information and Windows Security → Device security. Firmware/boot changes require hardware-specific instructions and recovery access.', windows),
    check('screen-lock', 'Sign-in, lock and account privilege reviewed', 'Review Accounts → Sign-in options, automatic locking and local administrator membership. Use strong authentication and least privilege.', windows),
    check('network', 'Remote access and listening services reviewed', 'Review Remote Desktop, OpenSSH, file sharing and native machine listener findings. Remove unneeded exposure while retaining a tested management path.', windows),
  ] },
};
profiles['chromeos-flex'] = { ...profiles.chromeos, name: 'ChromeOS Flex', limitations: [...profiles.chromeos.limitations, 'Flex has different boot-security and hardware guarantees from Chromebook hardware'], checks: profiles.chromeos.checks.filter(item => item.id !== 'verified-boot' && item.id !== 'containers').concat([
  check('boot-integrity', 'UEFI Secure Boot and hardware support reviewed', 'Follow the certified-device guidance for UEFI Secure Boot. ChromeOS Flex does not provide Chromebook hardware verified-boot guarantees; do not equate those protections.', 'https://support.google.com/chrome/a/answer/11542901'),
]) };

export function normalizePlatform(value) {
  const aliases = { iphone: 'ios', ipad: 'ipados', chromebook: 'chromeos', win32: 'windows' };
  const platform = aliases[value] || value;
  if (!Object.hasOwn(profiles, platform)) throw new Error('Unknown device platform');
  return platform;
}
export function deviceProfile(value) {
  const platform = normalizePlatform(value);
  return structuredClone({ schema: 'security-device-profile/v1', platform, ...profiles[platform], evidence: 'user-attested', instructions: 'Check each item on the named device. Unknown is an honest result. Never enter passwords, recovery keys or provider tokens.', outcomes: ['secure', 'needs-attention', 'unknown'] });
}
export function platformInventory() {
  return { schema: 'security-platforms/v1', timestamp: new Date().toISOString(), platforms: [
    { platform: 'darwin', name: 'macOS', automatic: 'native machine collector' },
    { platform: 'linux', name: 'Linux', automatic: 'native runtime collector; containers do not certify hosts' },
    { platform: 'windows', name: 'Windows', automatic: 'native PowerShell collector', guided: true },
    { platform: 'android', name: 'Android', automatic: 'limited properties through authorized ADB or Android runtime', guided: true },
    { platform: 'chromeos', name: 'Chromebook / ChromeOS', automatic: null, guided: true },
    { platform: 'chromeos-flex', name: 'ChromeOS Flex', automatic: null, guided: true },
    { platform: 'ios', name: 'iPhone', automatic: null, guided: true },
    { platform: 'ipados', name: 'iPad', automatic: null, guided: true },
  ], limitations: ['Guide availability is not automatic device inspection', 'Native Windows and Android collectors require live device verification; fixtures alone do not certify hardware'] };
}
export function assessDevice(input, { now = Date.now() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['platform', 'deviceId', 'observations'].includes(key))) throw new Error('Unexpected device assessment fields');
  const profile = deviceProfile(input.platform);
  if (typeof input.deviceId !== 'string' || !/^[\p{L}\p{N} ._()-]{1,80}$/u.test(input.deviceId)) throw new Error('A bounded device label is required; do not include secret material');
  const observations = input.observations === undefined ? {} : input.observations;
  if (!observations || typeof observations !== 'object' || Array.isArray(observations) || Object.keys(observations).some(id => !profile.checks.some(item => item.id === id))) throw new Error('Unknown check identifiers');
  const checks = profile.checks.map(item => {
    const observation = observations[item.id];
    if (Object.hasOwn(observations, item.id) && (!observation || typeof observation !== 'object' || Array.isArray(observation) || Object.keys(observation).some(key => !['status', 'observedAt'].includes(key)) || !profile.outcomes.includes(observation.status))) throw new Error('Invalid observation; only status and observation time are accepted');
    if (observation && (typeof observation.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(observation.observedAt))) throw new Error('An ISO UTC observation timestamp is required');
    const age = observation ? now - Date.parse(observation.observedAt) : NaN;
    const fresh = Number.isFinite(age) && age >= -5000 && age <= 86400000;
    return { ...item, state: !fresh || observation.status === 'unknown' ? 'unverified' : observation.status === 'secure' ? 'user-confirmed' : 'fail', evidence: observation && fresh ? 'user-attested' : 'none', observed_at: observation && fresh ? observation.observedAt : null, ...(observation && !fresh ? { reason: 'missing-stale-or-invalid-observation-time' } : {}) };
  });
  const reviewed = checks.filter(item => item.state !== 'unverified').length;
  return { schema: 'security-device/v1', platform: profile.platform, name: profile.name, device_id: input.deviceId, timestamp: new Date(now).toISOString(), status: checks.some(item => item.state === 'fail') ? 'at-risk' : reviewed !== checks.length ? 'incomplete' : 'reviewed', verification: 'user-attested-not-automatically-verified', coverage: { complete: false, automatic: 0, reviewed, total: checks.length, manual_complete: reviewed === checks.length }, limitations: profile.limitations, checks };
}
