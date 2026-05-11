# Subagent: Code Review Worker

Use this prompt template when dispatching a CLI agent to review code changes.

## Prompt Template

```
CONTEXT: You are reviewing code in the Total Recall repository at /Users/greg/Github/total-recall.
This is a Node.js Daemon backend with React frontend.

TASK: Review the following files for quality, correctness, and adherence to project conventions.

FILES TO REVIEW:
{FILE_LIST}

REVIEW CRITERIA:
1. TypeScript correctness (no `any` types, proper error handling)
2. Security (no exposed secrets, proper auth checks, SQL injection prevention)
3. Performance (no N+1 queries, proper async/await, no blocking operations)
4. Convention adherence (singleton services, thin route handlers, proper logging)
5. Missing edge cases (null checks, error boundaries, rate limiting)

OUTPUT FORMAT:
For each file, produce:
- PASS/WARN/FAIL verdict
- List of specific issues with line numbers
- Suggested fixes (code snippets)

CONSTRAINTS:
- Do NOT modify any files — this is read-only review
- Do NOT run any commands
- Be specific and actionable, not vague
```

## Recommended Agent

Use `codex review` for automated review, or `claude -p --permission-mode plan` for deep reasoning review.
