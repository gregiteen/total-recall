# Security Assessments

Security plugin for Total Recall. Audit machines and mesh fleets, review network exposure, repair local SSH permissions, audit installed plugins and inspect websites.

```sh
total-recall security machine --json
total-recall security network --json
total-recall security fleet --json
total-recall security fleet --target <discovered-machine> --json
total-recall security harden --json
total-recall security machine --apply-permissions --json
total-recall security plugins --json
total-recall security scan <source-directory> --json
total-recall security probe --url https://authorized-site --json
```

Machine checks support macOS, Linux and native Windows; Android has limited device-property collection. Windows/Android adapters are fixture-tested, with live hardware verification still outstanding. Reports distinguish passed, at-risk, review-required and incomplete, with timestamps, coverage and remediation. Missing tools/privileges, offline peers and unsupported platforms remain explicit. Listening addresses do not establish Internet reachability; firewall activation does not certify rules, and update-service configuration does not establish patch currency.

Fleet assessment requires the installed mesh plugin and an installed security plugin on each selected peer. Mesh supplies discovery and authenticated transport. It never installs software remotely or substitutes a local check for an unavailable peer. `secure-all` runs this assessment; it cannot declare an entire fleet secured after metadata edits.

Permission repair changes only recognized, locally owned SSH metadata and verifies results. Firewall rules, SSH daemon configuration and encryption changes are presented as remediation requiring preserved administrative access and rollback planning.

Auth owns credentials. Machine audits need no security master key. For signing/encryption, store at least 32 bytes of random SECURITY_MASTER_KEY material through auth or `security token set --stdin`. Encryption accepts plaintext through `encrypt --stdin`. Decryption displays plaintext only in an interactive terminal.

Source scans report locations and rule IDs without matched secrets. Heuristic findings require source review; they are not proof of complete vulnerability coverage. Auth declarations alone do not establish runtime enforcement. Plugin audits never rewrite manifests to fabricate hardening.

Exit 0 means the requested operation completed within its stated semantics; machine/fleet checks exit 1 for risks, review or incomplete coverage. `harden` without an apply flag returns a plan with zero applied changes. UI renders actual reports and failures.

See [the operational skill](skills/security/SKILL.md). Official platform contracts: [OpenSSH](https://man.openbsd.org/sshd_config), [Ubuntu firewall administration](https://ubuntu.com/server/docs/how-to/security/firewalls/), [Apple platform protection](https://support.apple.com/guide/security/protecting-against-malware-sec469d47bd8/web).

## Device coverage

| Device | Available assessment | Limits |
| --- | --- | --- |
| Windows | Native read-only firewall, antivirus, system encryption, Secure Boot and listeners; guided settings review | Privilege/edition gaps and patch currency remain unverified |
| Android | Existing authorized ADB property reads plus guided settings review | No new authorization/debugging, root operations or hardware attestation |
| Chromebook | Guided updates/support, verified boot, lock, extensions, containers, management and network review | A Linux container scan cannot certify ChromeOS |
| ChromeOS Flex | Separate guided review including UEFI boot protection | Does not claim Chromebook hardware guarantees |
| iPhone | Guided updates, lock, accounts/recovery, lost-device, profiles, permissions, network, sharing and targeted-threat review | No connected device-management collector |
| iPad | Separate guided device review | No assumption of iPhone-only Safety Check |

```sh
total-recall security platforms --json
total-recall security device --platform iphone --device "My phone" --json
total-recall security android --serial <existing-authorized-serial> --json
```

The device command returns a guide with unverified checks. Submit observations using `--stdin` (or bounded `--answers-json` for UI calls): `{"updates":{"status":"secure","observedAt":"<ISO timestamp>"}}`. Only status and time are accepted; no arbitrary notes or secret fields. Answers older than 24 hours become unverified. Even a full review is `user-attested-not-automatically-verified`, with automatic coverage zero. A completed manual review exits 0 as `reviewed`, never `passed`; risk or missing answers exit 1. The UI exposes platform/device selection, per-check review controls and an explicit authorized Android serial.

Official contracts: [Windows active firewall policy](https://learn.microsoft.com/en-us/powershell/module/netsecurity/get-netfirewallprofile), [BitLocker posture](https://learn.microsoft.com/en-us/powershell/module/bitlocker/get-bitlockervolume), [ADB authorization](https://developer.android.com/tools/adb), [Android boot state](https://source.android.com/docs/core/architecture/bootloader/locking_unlocking), [ChromeOS support expiration](https://support.google.com/chromebook/answer/9367166), [ChromeOS Flex differences](https://support.google.com/chrome/a/answer/11542901), [Apple personal safety](https://support.apple.com/guide/personal-safety/welcome/web).


Scanner coverage includes JavaScript, TypeScript, Python, shell and PowerShell source. Dynamic credential reads, synthetic signing defaults and uninspected links produce redacted review findings. Coverage limits produce an explicit review result. Run `security --help` for the available operations and see the owner tracker for dated suite and fleet evidence.

## Website and installation scope

Install the integration with `total-recall plugin install <git URL of this repository>`. `security site-audit https://your-site.example --json` grades the observed HTTPS response headers and exits nonzero when review is required. `security site-shield` emits a header-only Helmet snippet. The installed website module also exports `createSiteShield` for real server enforcement.

Mount the middleware after trusted session/proxy resolution and before application routes. Configure the public `origin` and `getSessionId(req)` from the application's authenticated session. Use `getClientId(req)` only with a trusted proxy boundary and optional `getBotSignals(req)` for server-validated timing or a honeypot field. Send the token returned from authenticated `GET /_security/csrf` as `X-CSRF-Token` on writes. Public writes that receive a challenge can solve it and retry the same URL with `X-TR-Proof: salt:difficulty:expires:signature:nonce`. Challenge replay state and rate limits are process-local. Use a single process for this contract and verify session, TLS and proxy behavior in the consumer.

`security plugins` reads the installed host registry and assesses source coverage and security declarations. [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Node HTTP](https://nodejs.org/api/http.html).

The [Security project tracker](docs/projects/in-progress/SECURITY_CARD/SECURITY_CARD_PROJECT_TRACKER.md) records scanner coverage, runtime enforcement and card acceptance separately. The manifest does not declare a standalone application brick.

## Using this from an agent

Send security audits here: a machine, its network exposure, the mesh fleet, installed plugins, or a source folder. Only probe a website you are authorized to test. Firewall, SSH daemon and encryption changes stay manual unless the operator asks.

```bash
total-recall security machine --json
total-recall security network --json
total-recall security fleet --json
total-recall security plugins --json
total-recall security scan <source-directory> --json
total-recall security harden --json
```

Raw commands this plugin owns: `nmap` and `lynis`.
