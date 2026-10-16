---
name: security
description: Audit Total Recall secrets, API auth, rotation and outbound trust boundaries.
repo_scoped: true
repository_id: total-recall-brain
---

<!-- total-recall:skill-router:v1 -->

# Total Recall security

Read the relevant secrets, API, rotation, browser or egress procedure before changing that boundary. Never print secrets, redact after exposure, pass secrets in argv or copy browser sessions into published artifacts. Resolve credentials through the supported encrypted store and validated env/Keychain contract.

Rotation order: capture, shape-check, API-verify, store/export, then revoke old material. Only verified recipes may auto-click; manual classes stay human, high-risk providers retain their safety window. Preserve provider attribution and explicit authorization.

Require authenticated scoped REST access, safe paths/input, scoped subrouter auth, outbound policy and truthful failure states. Use isolated tests; synthetic success does not prove provider/browser behavior.

Before an operation, read its [task references](references/optimized/index.md), including prerequisites and constraints. If the applicable procedure is unclear, read the preserved original instead of guessing. Commands assume the skill root.
