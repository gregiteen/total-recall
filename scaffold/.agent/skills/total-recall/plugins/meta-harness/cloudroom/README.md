# Running Greg's agents on Cloudroom

Cloudroom (cloudroom.dev, open source, early beta) runs Claude Code, Codex, Hermes,
OpenClaw, Pi Agent, OpenCode, fx and Devin in per-thread cloud Linux sandboxes on
Greg's own model subscriptions. It bills compute only (Free: 3,000 credits a month;
Pro $50, Super $150, Ultra $500). Read 2026-10-27 from cloudroom.dev/docs.

`setup.sh` makes every cloud sandbox a Total Recall host: the pinned CLI, the nine
default plugins, every private `tr-plugin-*` repository, a sandbox-only auth store,
and Total Recall instructions for Claude Code, Codex and Hermes in each project.
Tested twice in a clean `node:24-bookworm` container with a cloned private plugin
and an imported key: both runs clean, the second changes nothing.

## What Greg does (account, sign-ins and keys stay with him)

1. Create the Cloudroom account and install the Mac app from cloudroom.dev.
2. Connect Claude (approve in the browser, paste the one-time code into the panel,
   never the chat). Codex and Hermes logins copy over from this Mac.
3. Settings → Cloud environment:
   - **Setup script:** paste `setup.sh`.
   - **Repos:** add the `tr-plugin-*` repositories the agents should have, plus the
     working repositories (for example `gro-crm`, `dsh-private`). Cloudroom clones
     them into `/repos` in every sandbox.
   - **API keys:** add only the keys a cloud task needs, then add their names, space
     separated, as `TR_IMPORT_KEYS`. The script copies each into the sandbox's
     Total Recall auth store, so agents read them through `total-recall auth`.
     Start with none.
4. Leave **Mac access** off. With it on, cloud agents can read files and run
   commands on this Mac as Greg.

## Boundaries

- No production credentials in Cloudroom: no droplet SSH or mesh keys, no Stripe,
  telephony or mail-server keys. Agents there work on branches; releases stay on the
  Mac mini through `scripts/gro-ops.py` with Greg's approval.
- Each sandbox's auth store is its own (random master password in the owner-only
  `~/.agent/tr.env`); agents with admin rights in the sandbox can read it, as
  Cloudroom's security page states.
- Hermes stays under Total Recall: `total-recall connect hermes` runs in setup, and
  cloud Hermes copies its settings from this Mac's `~/.hermes`.

## Scheduled work

No existing schedule runs an agent today (Hermes has no jobs, the Total Recall task
queue is empty, and the droplet's JSN timers are plain scripts that stay where they
are). Cloud automations start an agent only when their check script prints
something, so these cost nothing on quiet runs:

- **DSH fork watch (daily):** the check prints a new upstream `dsh-v*` release tag
  that `fork/master` lacks. The agent merges it into a `room/` branch of the fork,
  keeping every fork revision as `gro-crm/harness/README.md` describes, runs the
  fork build and typecheck, and reports. The image build and release stay on the
  Mac mini.
- **Agent maintenance (daily):** `total-recall cli-agents maintenance` refreshes
  agent documentation; the check prints only when a document is stale.

Create each with `room-cli loop create --name … --prompt … --cron … --timezone
America/Denver --script-file check.sh` in a Cloud thread after setup.
