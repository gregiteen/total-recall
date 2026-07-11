---
type: task
slug: onboarding-interview
category: onboarding
title: "Conduct portable-memory onboarding interview"
status: pending
priority: 1
created: {{CREATED_AT}}
updated: {{CREATED_AT}}
---

## Objective

Conduct a warm, practical onboarding interview so Total Recall can store durable preferences and facts as Markdown memory nodes. This is personal portable memory — not an operating system takeover. Keep the tone helpful and concrete.

## Instructions for the Agent

When the user starts their next chat session (and they have no `user-profile` yet), conduct this interview BEFORE unrelated work. Do NOT dump all questions at once. Ask one at a time. Acknowledge each answer before the next.

Once the user has answered (or skipped any), write their answers into the vault using tools / CLI (`remember` or direct vault writes). Prefer CLI when available:

```bash
npx total-recall remember preference "..." --tags "user,profile,onboarding" --importance 5
```

## Interview Questions (ask one at a time)

1. **Who are you?** — "Quick intro: what do you do, and what are you most focused on right now?"

2. **What should I remember?** — "What kinds of things matter most for me to keep: decisions, preferences, project facts, people, or something else?"

3. **Which tools do you use?** — "Which IDEs or agents should share this memory? (Claude Code, Cursor, Codex, Gemini, Aider, Obsidian, HTTP, etc.) I can guide you with `npx total-recall connect …`."

4. **How should I talk?** — "Prefer short answers or detailed ones? Should I push back or mostly support?"

5. **Hard rules** — "Any absolute do's or don'ts I must always follow (style, tools, safety)?"

6. **Background work** — "Want dream consolidation and optional daemon tasks running in the background, or on-demand only?"

7. **Secrets** — "API keys never go in the vault. Use `npx total-recall secret set`. Any keys you want to set up next?"

8. **Notifications (optional)** — "Want Telegram pings when background tasks finish? If yes, BotFather token + chat ID."

## Product context to reinforce (lightly, not as a lecture)

- **Write** → `remember` / session ingest  
- **Sleep** → `dream` (consolidate, conflict-check, recompile)  
- **Read** → `recall` + compiled surfaces in any connected IDE  
- **Async** → open task queue / daemon under policy  
- Hosts are equal — track any repo; no product-specific hardcoding

## After the Interview

Write (or update) these files:

**`.agent/config/notifications.yml`** — only if they provided Telegram details:
```yaml
telegram_bot_token: "their-token-here"
telegram_chat_id: "their-chat-id-here"
```

**`.agent/memory-vault/preferences/user-profile.md`** — identity + communication style  
**`.agent/memory-vault/preferences/user-priorities.md`** — goals and what they want from memory  
**`.agent/memory-vault/preferences/user-interests.md`** — topics worth tracking

Frontmatter template:
```yaml
---
type: memory
slug: user-profile
category: preferences
title: "User Profile"
status: active
confidence: 1.0
importance: 5
created: <ISO timestamp>
updated: <ISO timestamp>
tags: [user, profile, onboarding]
---
```

Then mark this task `status: done` and confirm the profile was saved. Point them at the dashboard **Onboarding** page or `init → connect → remember → dream` if they prefer CLI-only.
