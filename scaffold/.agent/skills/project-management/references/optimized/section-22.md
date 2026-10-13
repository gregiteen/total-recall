### 5. Pull Request Review Mode

Use when reviewing a PR or deciding whether work is safe to merge.

Review against:

- Does it close or advance a real issue?
- Does it help the repo's current priority (per the overlay skill)?
- Does it introduce obvious runtime risk?
- Does it respect the repo's architecture (see overlay skill's architecture reminders)?
- Does it avoid exposing secrets or credentials?
- Does it have a clear test path?

```md
## Review

### Summary
[What this PR changes]

### Must fix before merge
- [ ] [Blocking concern]

### Should fix soon
- [ ] [Non-blocking concern]

### Test before merge
- [ ] [Manual test]

### Decision
Approve / Request changes / Comment only
```

