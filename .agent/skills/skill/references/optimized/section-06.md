### Key Rules

1. **`repo_scoped: true`**: Skills with this flag MUST NOT be synced to other repos. Use for repo-specific skills like `push`, `security`, `test`.
2. **No blind sync**: Never automatically push ALL skills to all repos. Only explicitly marked global skills should be synced.
3. **Skill audit**: Before syncing, verify the skill content is appropriate for the target repo.

