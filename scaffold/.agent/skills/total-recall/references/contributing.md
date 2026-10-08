# Contributing requested changes to Total Recall

Use this procedure when the user requests an upstream contribution to
`gregiteen/total-recall`. A local fix or plugin account upload is not an
upstream push or pull request. Do not publish unrelated changes or private
project memory.

1. Load the owning repository instructions and complete ready Total Recall
   context for the requested actions. Use an existing checkout; create a
   worktree only when requested. Inspect Git status, remotes, current branch,
   upstream changes, and existing PRs before proceeding. Preserve unrelated
   work and reuse the branch/PR already associated with this change.
2. Review the diff and stage only the requested source, documentation, and
   meaningful regression tests. Keep credentials, vaults, personal account
   data, generated packages, dependency directories, and scratch files out of
   the public commit. Use a topic branch rather than pushing to the default
   branch; avoid force pushes and merging without authorization.
3. Read applicable test, quality, and push skills. Run required verification
   on the configured sanctioned test node; use the owning skill's runner when
   supplied. Record actual results and any unavailable prerequisites. Missing
   gates are not passes; do not bypass an installed hook. If policy permits a
   draft contribution with incomplete checks, identify the gaps in the PR and
   keep it draft until required checks complete.
4. Check the authenticated GitHub identity without printing tokens. The normal
   contributor workflow is to use the authenticated user's fork, push a topic
   branch there, and open a PR targeting `gregiteen/total-recall`'s default
   branch. Only the upstream owner is expected to have direct write access;
   contributors do not need it. Preserve the upstream remote. Use an existing
   fork or create one when the requested contribution authorizes that action
   and the integration supports it. Do not attempt a direct upstream push as
   a prerequisite for contributing.
5. Create or update the PR with the concrete problem, resulting behavior,
   relevant validation, and material limitations. For multiline `gh` bodies,
   write the text to a scratch file and use `--body-file`. Verify the remote
   branch and returned PR URL before reporting publication. Do not repeat an
   uncertain creation without first checking for an existing PR.
6. Lack of upstream write access is expected, not a failure. If the integration
   cannot create or push to the contributor fork, describe the unavailable
   integration capability and authenticated identity neutrally. Preserve the
   commit, branch, and prepared PR body, and identify the fork access needed
   to resume. Do not ask contributors for upstream write permission. Never claim a PR exists or was pushed
   based on a local commit. Do not retry denied operations without a relevant
   access change.
7. Save durable status through `total-recall remember fact ... --project` in
   the selected project brain: upstream repository, branch, commit, PR URL if
   created, verification gaps, and any unavailable fork integration capability. Keep personal
   incident details in memory rather than embedding them in this public skill.

Finish with the PR link and a brief validation summary, or the pending contribution
status, unavailable integration capability, and preserved work. Do not merge unless the user requests it.
