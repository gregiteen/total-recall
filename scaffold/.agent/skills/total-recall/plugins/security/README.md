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

Auth owns credentials. Machine audits need no security master key. For signing/encryption, store at least 32 bytes of random SECURITY_MASTER_KEY material through auth or `security token set --stdin`. Encryption accepts plaintext through `encrypt --stdin`; no passphrases or plaintext in argv. There are no embedded default keys or provider environment fallbacks. Explicit decryption emits plaintext and must be routed to the intended secure consumer, never an audit log.

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


Scanner coverage now includes JavaScript/TypeScript, Python and shell/PowerShell source. Dynamic credential reads, synthetic provider/signing defaults and linked uninspected source produce redacted review findings. Coverage limits fail explicitly; source review does not establish runtime enforcement. `security --help` lists actual commands. Latest scanner/device suite: 28 tests passed on sanctioned node, exit 0. All-plugin audit remains failed while CRM credential paths are unresolved.

## Use it two ways

This plugin is a reusable brick, so a new project does not start from zero.

**Add it to a project (for apps you build and ship).** From the project directory:

```sh
total-recall plugin vendor https://github.com/gregiteen/tr-plugin-security.git 
```

This copies the plugin's source, skills, tests and docs into `bricks/security` and records it in `tr-bricks.json`. Your project then owns that code: edit it, test it in your own gates, and ship it with no runtime dependency on this plugin or on Total Recall. Combine as many bricks as the project needs. List them with `total-recall plugin bricks`.

**Use it directly with Total Recall (for your own machines and workflow).** Install it with `total-recall plugin install https://github.com/gregiteen/tr-plugin-security.git` and run `total-recall security`. Manage its credentials with `total-recall auth secret` and its skills with `total-recall skill`.
