# Machine and network security

Use the installed security plugin and its `skills/security/SKILL.md`. `security machine --json` and `network --json` inspect the current host. `fleet --json` uses mesh-owned discovery and transport; `fleet --target <discovered-hostname> --json` narrows assessment. Offline/unsupported peers and unavailable checks remain explicit missing coverage.

`harden --json` prepares a plan; `machine --apply-permissions --json` verifies bounded local SSH permission repair. Review firewall, SSH and disk changes with preserved access and rollback. Neither manifests nor generated recommendations prove enforcement. `secure-all` is fleet assessment, not a blanket secured claim.

Auth owns signing/encryption keys. No default keys, provider environment bypass or plaintext in argv. Use `token set --stdin`, `encrypt --stdin`, and explicit secure output handling for decryption. `plugins --json` and `scan <path> --json` emit redacted source findings. `probe --url https://authorized-site --json` performs a real HTTPS response/header-presence check. A listener is not Internet-reachability proof; configured updates do not prove patch currency.

Track actual source, test results, coverage and remaining risks in the active project and [OpenWiki security hub](../../../../openwiki/security.md). Do not claim machines are secured merely because plugin tests pass.

`security platforms --json` lists coverage. Windows uses native read-only PowerShell checks; Android property reads require `android --serial <existing-authorized-serial>` or a native runtime. Missing privileges/tools remain unverified. Neither adapter has live hardware verification yet. `device --platform ios|ipados|android|chromeos|chromeos-flex|windows --device <label> --json` supplies platform-specific review; submit only status/time observations via stdin. Manual answers expire after 24 hours, remain user-attested and never establish automatic coverage. The UI exposes this same review workflow. A Chromebook Linux container is a separate runtime; ChromeOS Flex and iPad use distinct guides. No device-management integration or hardware attestation is implied.


Scanner coverage now includes JavaScript/TypeScript, Python and shell/PowerShell source. Dynamic credential reads, synthetic provider/signing defaults and linked uninspected source produce redacted review findings. Coverage limits fail explicitly; source review does not establish runtime enforcement. `security --help` lists actual commands. Latest scanner/device suite: 28 tests passed on sanctioned node, exit 0. All-plugin audit remains failed while CRM credential paths are unresolved.
