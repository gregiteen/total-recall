---
type: task
slug: onboarding-interview
category: onboarding
title: "Conduct user onboarding interview"
status: pending
priority: 1
created: {{CREATED_AT}}
updated: {{CREATED_AT}}
---

## Objective

Conduct a warm, conversational onboarding interview with the user to deeply understand who they are, what they care about, and how you can best serve them. This is the most important task in the queue.

## Instructions for the Agent

When the user starts their next chat session, you MUST conduct this interview BEFORE doing any other work. Do NOT dump all the questions at once. Ask them one at a time, naturally, like a thoughtful conversation. Acknowledge and reflect on each answer before asking the next question.

Once the user has answered all questions (or says they want to skip any), write their answers into the vault immediately using your file tools.

## Interview Questions (ask one at a time, conversationally)

1. **Who are you?** — "To get started, can you tell me a bit about yourself? What do you do for work or what are you most focused on in life right now?"

2. **What are you working on?** — "What are the main projects or goals you're working toward? These could be professional, personal, creative — anything you want me to help you with."

3. **What do you want to remember?** — "What kinds of things are most important for me to keep track of for you? (Ideas, research, decisions, people, tasks, reading, etc.)"

4. **What topics excite you?** — "What subjects, fields, or areas of knowledge do you find yourself coming back to? What should I research and follow for you automatically?"

5. **How do you like to communicate?** — "Do you prefer direct, brief answers or detailed explanations? Do you want me to push back on ideas or mostly support your thinking?"

6. **What frustrates you?** — "Is there anything that drives you crazy — things you keep forgetting, information that's hard to find, tasks that slip through the cracks?"

7. **What would success look like?** — "Six months from now, if I've done my job perfectly, what would be different for you?"

8. **Telegram Notifications** — "Would you like me to message you on Telegram when I finish background tasks or find something interesting during my idle time? If yes, you'll need to create a bot on Telegram via BotFather and give me the Bot Token and your Chat ID."

## After the Interview

Write the following files using your terminal tools:

**`.agent/config/notifications.yml`** — If they provided Telegram details, write them exactly like this:
```yaml
telegram_bot_token: "their-token-here"
telegram_chat_id: "their-chat-id-here"
```

**`.agent/memory-vault/preferences/user-profile.md`** — Full SSSS memory node with the user's identity, role, and communication style.

**`.agent/memory-vault/preferences/user-priorities.md`** — SSSS memory node listing the user's top goals, active projects, and what they want from Total Recall.

**`.agent/memory-vault/preferences/user-interests.md`** — SSSS memory node listing topics to research autonomously.

Use this frontmatter template for each file:
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

After writing the files, mark this task `status: done` and confirm to the user that their profile has been saved.
