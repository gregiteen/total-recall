# DESIGN.md — Auth & Secrets

```yaml
tokens:
  brand-name: "Auth & Secrets"
  wordmark: "AUTH & SECRETS"
  color-primary: "#10b981"
  color-background: "#064e3b"
  color-accent: "#34d399"
  color-ok: "#059669"
  color-warn: "#d97706"
  color-danger: "#dc2626"
  font-body: "Outfit, system-ui, sans-serif"
  font-mono: "'JetBrains Mono', ui-monospace, monospace"
  border-radius: "8px"
  density: "compact"
  motion: "120ms ease-out"
```

## Who this card is for

The operator and autonomous agents managing access control, cryptographic secrets, and identities across the mesh.

The operator opens this card during active administration: verifying biometric passkeys, checking Google OAuth token freshness, auditing 90-day secret rotation schedules, or inspecting active session integrity.

## The four tasks, in the order the card presents them

| Screen | Task Frequency | Operational Rationale |
| :--- | :--- | :--- |
| **Passkeys** | Daily / Routine | Biometric hardware authentication via WebAuthn FIDO2. The operator checks registered authenticators and manages credential devices. |
| **Google OAuth** | Frequent | Identity bridge accounts. The operator monitors token expiration, executes manual refreshes, and reviews account scopes. |
| **Secrets** | Continuous | Cryptographic credential vault. The operator audits key freshness, tracks rotation deadlines, and checks provider bindings. |
| **Audit & Sessions** | Incident / Review | Security baseline verification. The operator inspects live access sessions and reviews policy findings. |

Screen ordering follows task frequency and operational urgency rather than arbitrary command taxonomy.

## The core tasks

1. **Verify security posture instantly** — confirm that the secrets store is sealed, zero rotation schedules are overdue, and the security audit baseline passes.
2. **Manage biometric hardware passkeys** — inspect registered platform authenticators (Face ID, Touch ID, Windows Hello) and security keys (YubiKey), register new authenticators, and safely revoke decommissioned hardware.
3. **Supervise OAuth tokens** — verify Google OAuth connection status, monitor token lifetime, refresh expiring credentials, and safely disconnect accounts.
4. **Audit secret hygiene** — review key expiration dates, inspect multi-repo bindings, verify remote deployment targets, and trigger rotation workflows without exposing secret values to the DOM.

## What must be visible without a single click

- **Security Verdict Line:** A clear verdict ("Secure" or the count of active warnings) and timestamp of the latest verification.
- **Passkey Count:** Total active hardware authenticators registered on the system.
- **OAuth Status:** Connected accounts and token health status.
- **Secrets Store Telemetry:** Total stored keys and count of overdue rotations.
- **Baseline Audit State:** System security verification status (Passed or Flagged).

## Why the layout is this layout

The card face provides a wide, responsive workspace rather than a narrow column.

- **Security Verdict at the Top:** The operator requires an immediate assessment. A prominent verdict line answers whether the authentication system is healthy before secondary details appear.
- **Horizontal Task Navigation:** Four dedicated domain screens (Passkeys, Google OAuth, Secrets, Audit & Sessions) organize operations by user intent rather than raw CLI syntax.
- **Zero Raw Secrets in DOM:** Secret values are never rendered, logged, or accepted via input fields. The interface exposes only key names, providers, fingerprints, creation timestamps, and rotation schedules.
- **Safe Revocation Guards:** Destructive actions such as credential revocation require explicit confirmation and display prominent warning styling. Deleting the final authentication method is blocked to prevent accidental administrative lockout.
- **Real Telemetry Only:** All figures render em dashes (`—`) until returned by the host. Zero mock responses, zero seeded numbers, and zero reassuring default strings appear in error branches.

## Responsive presentation and accessibility

- **Breakpoints:** Verified across mobile (360 CSS px), tablet (768 CSS px), and desktop (1280 CSS px) viewports.
- **Host Theme Adaptation:** Injected dark-dashboard variables (`--text-primary`, `--text-secondary`, `--bg-primary`, `--bg-secondary`, `--border`, `--accent`) govern surfaces and typography.
- **Touch Targets:** All interactive controls declare a minimum height of 44 px.
- **Reduced Motion:** All transitions and indicators respect `prefers-reduced-motion` settings.
