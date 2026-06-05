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

## Ingestion Pipeline & Chrome Extension

### Extended Ingestion Channels
- [ ] **Voice Notes**: Start recording directly (`npx total-recall voice` with mic access) or transcribe an existing file (`npx total-recall voice --file memo.m4a`). Integrates Whisper STT with the `POST /api/share` pipeline.
- [ ] **Image & File Uploads**: Implement a new `POST /api/files/upload` endpoint (using `multer` middleware) to store files under `files/`, generate visual descriptions via vision models, and link nodes via `x_media_refs`.
- [ ] **Web Share Target**: Configure the dashboard PWA manifest to act as a Web Share Target so mobile browsers can natively "share-to-brain".
- [ ] **Gmail & Calendar Connectors**: Implement OAuth2 integrations for incremental sync to create fact nodes. Requires robust local-only encryption, consent framework, and strict classification.
- [ ] **Location Tracking Ingestion**: Support periodic tracking writes via `POST /api/sessions/ingest { source: 'location' }` to save to memory with `x_location` schema values.

