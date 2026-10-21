---
name: security
description: Audit and harden machines, mesh networks, plugin credentials and websites using the security plugin, with measured coverage and verified remediation.
---

# Security plugin

Discover `total-recall security status --json` and installed mesh/auth capabilities. Security owns audits and remediation; mesh owns machine discovery and remote execution; auth owns every credential. No ambient credential, default key, core secret store or alternate-machine fallback is permitted.

Use `security machine --json` for the current host or `security network --json` for its network posture. Reports include firewall, disk protection, effective SSH settings, TCP/UDP bindings and SSH file metadata. macOS additionally checks Gatekeeper, System Integrity Protection and update scheduling. Linux inspects UFW, root encryption ancestry and update-service configuration. Unsupported tools, privileges and storage layouts remain unavailable. An enabled firewall alone does not certify its rules; configured update services do not prove patch currency.

Use `security fleet --json` or `security fleet --target <discovered-hostname> --json` for mesh machines. `secure-all` is the fleet assessment workflow. The security plugin must already be installed on each peer; this operation never installs agents or substitutes another machine. Review observed/selected counts, offline machines, freshness, identity and unavailable checks before making a fleet claim. Mobile and ChromeOS peers without a connected collector remain unverified and route to device review; mesh presence never proves device security.

For each failed/review check, follow the report's remediation. `security harden --json` prepares the current machine's plan. `security machine --apply-permissions --json` restricts recognized local SSH permissions and verifies inode ownership and resulting modes. It refuses symlink traversal. Firewall, SSH daemon, disk-encryption and recovery changes require a concrete access/rollback plan; validate configuration and a second working administrative connection before applying those changes. Never label a generated recommendation as applied protection.

Use `security plugins --json` for installed plugin declarations and source findings, and `security scan <path> --json` for scoped source inspection. Findings omit matched values. Scanner findings are review evidence, not proof that all credentials or vulnerabilities have been found. Missing paths, coverage limits and unreadable files fail the operation. Manifest auth declarations do not prove runtime enforcement; follow credential reads/writes and route checks through the actual owner. Do not automatically add grants or rewrite manifests as a substitute for implementation.

Use `security probe --url https://authorized-site --json` for a real HTTPS response and header-presence check. Header presence does not prove correct policy. Restrict targets to authorized systems; do not widen scanning to arbitrary network ranges. `site-audit` provides additional website review; challenge, bot-mitigation and site-shield tools need application integration and verification.

Signing/encryption require SECURITY_MASTER_KEY stored through auth; use `security token set --stdin` for at least 32 bytes of random material. Remote challenge verification uses its separately declared provider credential. Never pass keys or plaintext in argv. `security encrypt --stdin --json` accepts plaintext on stdin. Explicit decryption exposes plaintext by design: route output only to the intended secure consumer and never capture it in audit logs or documentation.

Run meaningful clean/unsafe fixtures and the full owner suite on the configured sanctioned test node. Preserve raw exit status, tested source identity and cleanup evidence. Report findings, unavailable coverage, actual fixes and residual risks separately. Update the active project tracker and OpenWiki via its installed plugin; never store secrets in reports, hubs, SSSS audit records or UI output.

## Windows, Android, Chromebook, iPhone and iPad

Run `security platforms --json` for the support matrix. Windows `machine` uses fixed read-only PowerShell queries for active firewall profiles, built-in antivirus, system-volume encryption, Secure Boot and TCP/UDP bindings. Missing cmdlets, editions and privileges stay unavailable. All firewall rules, alternate antivirus and Windows patch currency still require review. This collector never requests recovery-key material or applies administrative changes.

Use `security android --serial <already-authorized-serial> --json` only with an existing authorized ADB device. It reads four allowlisted boot, encryption and security-patch properties. It never connects, authorizes, roots, flashes or enables debugging. Properties are device-reported rather than hardware attestation; full posture stays incomplete. Android-native runtimes may use `machine`; Linux containers and Termux identified as Linux must not be assumed to certify Android.

Use `security device --platform ios|ipados|android|chromeos|chromeos-flex|windows --device <label> --json` for the device-specific guide. Initial checks are unverified. After observing settings on that device, submit `--stdin` with an object keyed by check ID, each containing only `status` (`secure`, `needs-attention`, `unknown`) and ISO `observedAt`. The UI supplies this same workflow through Review device / Evaluate review. Only changed answers receive timestamps. Answers expire after 24 hours. Never record passcodes, recovery codes, keys, profiles, arbitrary notes or other secret material.

Manual outcomes are user-attested: reviewed is never automatic passed; coverage.complete remains false and automatic remains zero. Incomplete/at-risk reviews exit 1; a complete manual review exits 0 within those limited semantics. Do not turn manual answers into native observations, invent device-management enrollment, or substitute a browser scan. iPhone/iPad have distinct guides; Safety Check is not assumed on iPad. Chromebook and ChromeOS Flex have distinct boot protection guidance; Crostini/container checks never certify the host. Network reviews cover saved Wi-Fi, VPN, hotspot and sharing; router firmware/rules need a separate authorized router assessment.

Windows/Android collectors are fixture-tested on the sanctioned Mac mini; live execution on those operating systems is not yet verified. No mobile management or Verified Access integration is connected. Keep these limitations visible until actual device evidence establishes coverage.


Scanner coverage now includes JavaScript/TypeScript, Python and shell/PowerShell source. Dynamic credential reads, synthetic provider/signing defaults and linked uninspected source produce redacted review findings. Coverage limits fail explicitly; source review does not establish runtime enforcement. `security --help` lists actual commands. Latest scanner/device suite: 28 tests passed on sanctioned node, exit 0. All-plugin audit remains failed while CRM credential paths are unresolved.
