---
name: notifications
description: "Use this skill when you need to trigger macOS desktop notifications to ping the user with important background task results. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# Notifications Skill

This skill sends macOS desktop notifications via `terminal-notifier` (persistent Alerts with click-to-open-log). All notifications are permanently logged to a markdown file.

## Dependency
`terminal-notifier` must be installed: `brew install terminal-notifier`

## Usage
```bash
node .agent/skills/notifications/scripts/notify.mjs "My Title" "My Message goes here."
```

Multi-channel (os, email, sms, github):
```bash
node .agent/skills/notifications/scripts/notify.mjs "Title" "Message" "os,email"
```

## Where to Find Notifications
- **macOS Notification Center** — click the clock/date in the top-right menu bar. All notifications stack here even after banners disappear.
- **Log file** — `~/.total-recall/notifications/notification-log.md` — full permanent history, newest first, with clickable file links. *(Note: The Total Recall Memory Pipeline also automatically writes its status directly to this log).*

## Notification Log
All developer notifications are permanently logged (newest first) to:
```
~/.total-recall/notifications/notification-log.md
```
- File paths in messages are **auto-linked** as `file://` markdown links
- Clicking a notification's **Show** button opens this log directly
- Log is never purged — full permanent audit trail

## Persistent Alerts (One-time Setup)
Go to **System Settings → Notifications → terminal-notifier** and set alert style to **Alerts** so notifications stay on screen until you act on them.

## When to Use
- When long-running tasks complete (deployments, test suites).
- When daemons detect a status change (TS errors, lint stability).
- When background workers (e.g., cron jobs, memory distillation) finish their run.
- Include relevant file paths in the message — they become clickable links in the log.


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T22:41:36.409Z -->

<!-- END INJECTED MEMORY -->
