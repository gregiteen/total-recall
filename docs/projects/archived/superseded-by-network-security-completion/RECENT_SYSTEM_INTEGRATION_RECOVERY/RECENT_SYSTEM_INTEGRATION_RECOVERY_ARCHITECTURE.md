---
type: project_document
title: "RECENT_SYSTEM_INTEGRATION_RECOVERY - Architecture"
description: "Recovery architecture for secure routes, SSSS state, mesh authentication, and Headscale isolation"
timestamp: 2026-07-16T22:52:20Z
tags: [project-management, architecture, ssss, security, mesh, headscale]
---

# RECENT_SYSTEM_INTEGRATION_RECOVERY - Architecture

## Route contract

`src/server/index.mjs` mounts `restRouter` at `/`. Integration route modules therefore own complete paths:

- `/api/network/*`
- `/api/mesh/*`
- `/api/webhooks/*`
- `/api/headscale/*`
- `/api/secrets/*`

This keeps route inventory deterministic and avoids hidden mount prefixes.

## SSSS mutation boundary

Route modules call a small service adapter that constructs canonical `operation`, `patch`, `event`, or `delete` envelopes and invokes `processOperationAsync()` against the selected VFS root. The adapter supplies safe relative paths, unique idempotency keys, actor metadata, and cache invalidation. No Express request/response objects cross into the core mutation layer.

Network policy is a VFS document. Webhook configuration documents contain metadata and a reference to an encrypted secret key; raw webhook secrets live only in the encrypted secrets store. Webhook deliveries are append-only SSSS events.

## Security boundaries

- Dashboard CRUD: PAT/session authentication plus appropriate scopes.
- Public webhook ingress: provider allowlist, configured secret required, HMAC verification, replay/timestamp checks where defined, bounded body, and rate limiting.
- Mesh secret sync: exact CGNAT mesh-source validation plus a constant-time shared bearer token check. Missing credentials disable sync.
- Headscale proxy: authenticated dashboard route, HTTPS upstream allowlist, encrypted token lookup, request timeout, response normalization, and no token logging.

## Secret replacement

Followers download to a sibling temporary file, validate the encrypted envelope by attempting metadata-safe decryption through the secrets-store reader, fsync/rename atomically, and restore the previous file on failure. The leader URL and port come from configuration, not literals.

## Headscale edge

Nginx terminates TLS for `headscale.ultrachat.app` and proxies to a loopback-only Headscale container port. Metrics remain loopback-only. The old database is backed up before any version change. Because it currently contains no nodes or API keys, a clean latest-compatible initialization is acceptable only after the backup is verified.

## Verification topology

- Local: source inspection, focused unit tests, native server boot, authenticated endpoint smoke tests.
- Mac Mini: full Vitest suite and integration smoke tests.
- Cloud: HTTPS health, direct-port closure, Headscale authenticated API, container health/logs.
