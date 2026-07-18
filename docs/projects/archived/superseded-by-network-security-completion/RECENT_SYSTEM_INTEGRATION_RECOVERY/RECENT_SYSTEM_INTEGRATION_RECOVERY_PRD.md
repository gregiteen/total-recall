---
type: project_document
title: "RECENT_SYSTEM_INTEGRATION_RECOVERY - Product Requirements"
description: "Requirements for restoring safe, functional integrations without trusting false completion state"
timestamp: 2026-07-16T22:52:20Z
tags: [project-management, recovery, headscale, network, webhooks, secrets, skills]
---

# RECENT_SYSTEM_INTEGRATION_RECOVERY - Product Requirements

## Problem

Recent integration projects were marked complete without working canonical routes, SSSS-backed mutations, secure webhook ingress, authenticated secret sync, a functioning Headscale control plane, or complete test evidence.

## Outcomes

1. Every frontend integration endpoint resolves at its documented `/api/*` path and matches the route manifest.
2. Network and webhook state mutations use the SSSS package-kernel Operation Contract, never route-handler shims.
3. Webhook management is authenticated, stored secrets are never returned, and ingress fails closed without a configured secret.
4. Secret synchronization requires a shared cryptographic credential plus mesh-source validation, uses the configured server port, validates received ciphertext, and replaces the file atomically.
5. Headscale is reachable only through HTTPS at its dedicated hostname; direct public container ports are closed.
6. The Headscale proxy is credentialed through the encrypted secrets catalog, reports upstream errors safely, and supports the deployed API version.
7. Skill synchronization never deletes unowned project skills and all previously deleted skills remain restored.
8. Canonical docs, tracker, route manifest, handoff, tests, and live evidence agree before any project is archived.

## Non-goals

- Do not claim a three-node mesh until the laptop, Mac Mini, and server are actually enrolled and verified.
- Do not implement speculative dashboard features that are unrelated to restoring the broken integration contract.
- Do not publish, push, or deploy Total Recall without the separate push protocol.

## Success criteria

- Focused integration suites pass.
- Route inventory passes with canonical `/api/*` paths.
- Unauthenticated management and secret-sync calls fail.
- Unsigned or unconfigured webhooks fail closed.
- Headscale direct ports are not publicly reachable; HTTPS health and authenticated API calls succeed.
- Full backend and frontend suites pass on the Mac Mini.
- Sanctioned TypeScript and lint reports show zero errors.
- Trackers contain no unsupported completion claims.
