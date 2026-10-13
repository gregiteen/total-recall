## 3. Repo start (when present)

If the brief's **Next** line names a repo start skill
(`.agent/skills/start/SKILL.md` in that repo), read it fully and follow it only when it is repo-owned (`repo_scoped: true` or verified distinct repository instructions). A `repo_scoped: false` shared copy is this same workflow: do not recursively invoke it. Product-specific
servers, logins, browser panes, and other product-specific steps live there,
never here. If there is none, read the openwiki entry page and the repo's
`repo-expert` skill it names before changing code.

