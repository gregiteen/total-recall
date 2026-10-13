## 2. Brief (always)

From the repository root run the Total Recall brief, via the repo launcher when
one exists:

```bash
./total-recall brief      # or: npx total-recall brief
```

It is read-only and prints, for the repo you are in: local time, timezone and
UTC; branch, dirty files, last commit; the project id (random UUID) and the
project groups it belongs to; the compiled rules count and when they were
compiled; installed skills; composable commands (with risk class); secrets
health as **counts only** (rotation due, reused values, untracked); pending
daemon tasks; mesh status; in-progress and planned trackers; openwiki pages; and
what to do next. Add `--mesh` to ping every mesh node, `--json` to parse it.

If `brief` is missing (`Unknown command: brief`), the global commands are not
installed on this machine: say so and fall back to `npx total-recall --help`,
`git status`, and the repo's openwiki.

