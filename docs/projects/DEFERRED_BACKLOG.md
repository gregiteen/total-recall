# Total Recall — Deferred Backlog

> **Global Safety Net**: This document contains deferred tasks, future enhancements, and unfinished items extracted from completed project trackers or active scoping sessions. Nothing is ever deleted; it is stored here until it can be scheduled.

## Future Enhancements (Post v1.0)

### Infrastructure & Deployments
- [ ] **Programmatic Domains**: Integrate Vercel API for automated DNS and subdomain routing when the agent spins up public-facing apps.
- [ ] **Mail Server**: Evaluate Mailcow integration for sovereign email hosting.
- [ ] **Transactional Email**: Integrate smtp2go for outbound agent-driven email sending (e.g., automated reports or workflow alerts).

### Authentication & Security
- [ ] **Passkeys**: Implement WebAuthn/Passkey support alongside passwords for frictionless, hardware-backed dashboard authentication (porting implementation patterns from UltraChat).

### Media & Modalities (From P7: Media)
- [ ] Native integration for MOSS-SoundEffect (8B) and ACE-Step (v1.5) once core memory loops are fully optimized.
- [ ] Investigate CPU-friendly Image Generation (e.g. Z-Image-Turbo 6B) as a potential background daemon task.

### Omnichannel Dashboard Features
- [ ] **Full Internationalization (i18n)**: Add a language picker to settings, abstract all hardcoded UI strings, and append an active `LANGUAGE` variable to `system.yml` to force the local kernel to write SSSS memory nodes and chat responses in the selected language.
