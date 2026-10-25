# DESIGN.md — Headscale Mesh

```yaml
tokens:
  brand-name: "Headscale"
  wordmark: "HEADSCALE"
  color-primary: "#818cf8"
  color-background: "#0b1020"
  color-accent: "#3b82f6"
  color-ok: "#34d399"
  color-warn: "#fbbf24"
  color-danger: "#f87171"
  badge: "Your machines"
  font-body: "'Space Grotesk', system-ui, sans-serif"
  font-mono: "'JetBrains Mono', ui-monospace, monospace"
  border-radius: "8px"
  density: "compact"
  motion: "none"
```

This document is the design. The component follows it. Where the component and this file disagree, the component is wrong.

## What a mesh is, for this operator

A mesh here is the operator's own machines (a Mac mini, a laptop, a cloud server, a phone) joined by one control server so that people and agents can reach any of them from any other. The operator is one person, working from whichever machine is in front of them, and agents work across the rest.

A mesh is also a platform. Very little of what matters about it is configuration; most of it is what the mesh lets everything else do: run commands anywhere, tell where the person is, release a secret to a machine that has a grant, share plugins without a catalog, update a fleet, place scheduled work and agents. `docs/MESH_PLATFORM.md` maps those layers, says what is built and what is not, and is the source for this card's scope. This card is the top layer: the operator's view of the platform. It is not a network settings page.

That framing decides everything below. Four facts about this mesh came from reading its real output, not from the manifest, and each one changed the design:

1. **Reachability is a ladder, not a state.** A machine is reachable only if the control server sees it, the network path answers, a login is recorded, and a command actually runs. These are four separate checks that fail for four separate reasons with four separate fixes. A single "Healthy / Offline" label throws away the only thing the operator needs: which rung broke.
2. **The operator is a participant.** `presence` reports which machine the person is active on and for how long it has been idle. An operator working from the laptop to drive the Mac mini needs the card to know the laptop is where they are.
3. **Recorded is not live.** A node's entity file carries `last_heartbeat` and hardware figures written once by something that later stopped writing. The laptop's heartbeat is thirteen days old while it is online, pingable, answering commands and in use. A recorded date must never be read as liveness. Every screen separates what was measured now from what was recorded earlier, and states the date of the recording.
4. **Membership is the trust boundary.** The policy in force lets every member reach every port of every member and SSH as root. The CLI's own help says to audit nodes before widening that. A phone and a Chromebook are inside the same boundary as the cloud server. The card has to make that visible, because it is the one fact about the mesh with security weight.

## Who uses it and what they are in the middle of

One operator, mid-task, who suspects a machine cannot be reached, wants to know whether the things that depend on the mesh are working, or wants to know where something can run. Six jobs, in the order of how often they come up:

| # | Job | How often | What answers it |
| --- | --- | --- | --- |
| 1 | "I can't reach X" or "is everything up?" | Constant | Machines |
| 2 | "Is what rides on the mesh actually working?" (secrets, updates, plugins, scheduled work) | Often | Flows |
| 3 | "Where can this run?" (needs Docker, Claude, a camera, a display) | Often | Placement |
| 4 | "What is inside, what is exposed, and what may they do?" | Occasionally, and after any change | Boundary |
| 5 | "Add a machine." | Rarely | Join |
| 6 | "Send something to a machine or a person; see what was said." | Will be constant | Messages and Files, **when those capabilities exist** |

Job 6 has no screen yet and gets none until its operations exist. A screen that shows a feature with nothing behind it is a seeded value in another costume.

The control server, the leader and this machine's enrollment are not a job. They are a precondition for all four: if the control server cannot be verified, every other figure on the card is unreliable. So they are a strip that stays on screen, not a screen.

## The persistent strip

One row above the screens, always present:

- **Control server**: the host name and whether the API key was verified. If it is not verified, the strip turns to a danger state and the verdict line says the rest of the card cannot be trusted.
- **Leader**: which machine leads and by what strategy. It states whether this machine leads.
- **This machine**: its name, its enrollment state and the backend state.

Then the **verdict**, one sentence computed only from returned values. Its subject is the machines the operator can log in to, because that is what "reachable" can mean. A phone cannot host a login, so it is counted apart and never makes the sentence worse.

## Screen 1 — Machines

Master and detail. The roster is on the left; the selected machine is on the right. On a narrow width they stack. **A machine does not get its own screen.** One machine is a selection inside this screen, which keeps the comparison across machines visible, and that comparison is the point of the job.

### The ladder

Four rungs, always in this order, each in one of four states: passed, failed, not yet checked, not applicable.

| Rung | Question | Source | Measured |
| --- | --- | --- | --- |
| Control | Does the control server see it online? | `status` | now |
| Path | Does the network path answer? | `ping`, and direct or relayed once an operation exposes it | now, from this machine |
| Login | Is an SSH login recorded for it? | `status` access | recorded, with its verification date |
| Run | Did a command execute on it? | `doctor` | now, from this machine |

The headline for a machine is the first rung that failed, named in words. `Stops at Login: no SSH login recorded` and `Stops at Run: connection timed out` are different problems and read differently at a glance.

**Severity is decided by contradiction, not by a fixed list of expectations.** The card cannot know which machines are meant to be always on, and it does not guess. So:

- Control says online, but Path or Run fails: **danger**. The mesh claims the machine is there and it does not answer. This is a real fault.
- Control says offline: **neutral, stated plainly as offline.** Laptops sleep and phones leave. That is a fact, not an alarm.
- Online and answering, but no login is recorded: **warning**, with the fix on the next line.
- A rung not yet checked stays not-yet-checked, never passed.

**Not applicable is real.** A phone cannot host an SSH login. Its Login and Run rungs are not applicable, derived from the operating system the node reports, and it is not reported as missing a login.

### Progressive reading

`status` is fast and paints the roster at once. `ping`, `doctor` and `presence` take seconds because they run over SSH or wait on peers. They fill in as they arrive. Until then their rungs read as not yet checked with the word "checking", and a failed source shows its own error without blanking the rest. A failed read clears its figures; it never leaves the previous value standing as if current.

### Presence

The row for the machine the operator is active on says so, with idle time. This card is usually opened from a different machine than the one being fixed, and this is how it shows which is which. A peer whose presence endpoint did not answer says "presence unavailable" with the reason, which is a different fact from "idle".

### Roster order

Danger first, then warning, then not-yet-checked, then reachable, then machines that cannot host a login, with recorded-only records collapsed at the bottom. Within a group, the machine the operator is on comes first.

### The detail pane

Per machine, in this order:

1. The ladder, one line per rung: the state in words, the evidence, and how old the evidence is.
2. **Fix.** The action that addresses the failing rung, placed directly under it:
   - Path failed or not checked: **Ping now** (read).
   - Login failed: **Find a login** (`access discover`, write) and **Record a login** (`access <node> --user …`, write) with user, host, port and key path fields. A key path is a path, never a key.
   - Run failed or not checked: **Verify execution** (`access verify`, which runs a probe command on each configured machine).
   - Reachable: **Copy SSH command**. SSH is interactive and cannot run inside a sandboxed frame, so the card hands the operator the exact command.
3. Recorded facts, each dated: login source and user, verification date, hardware figures and their measurement date. A heading says these were recorded earlier.
4. Addresses: the mesh address and the LAN address. The overlay and wireless-direct interfaces that the system reports (`utun*`, `awdl0`, `llw0`) are noise for this operator and are not shown.

## Screen 2 — Flows

Job 2 is the one the first version missed entirely. The mesh's value is what it carries, so the card shows each thing that moves and whether it is moving. One row per flow, each answering the same three questions: what moves, when did it last demonstrably work, and which machines is it failing on.

| Flow | What the row shows | Read from |
| --- | --- | --- |
| Secrets | machines holding grants, and the keys each may read; an empty list stated as "no machine may read a secret through the mesh" | `grants list` |
| Plugins | what each peer shares, with each peer's own status: reachable, offline, not configured, unsupported, error | `plugin peers` |
| Updates | the version and the verified report of the last fleet update; failures counted, with the first reasons | `update --status` |
| Scheduled work | which tasks exist, on which node they run, and whether placement is per node or a selected node | `user-automations list` |
| Agents | running and recent agent processes, and the node each runs on | `agent list` |
| Alerts | recent mesh events from the alert ledger | `alerts log` |
| Deployments | the active slot and release of each registered deploy host; an empty list stated as "no host is registered with deploy", which is the case today | `deploy status` |

Three more flows belong here and are **not drawn until an operation exists**: service health per node, exit nodes and routes, and speed. The "Operations the card depends on" table in `docs/MESH_PLATFORM.md` lists them. Deployments are read from the deploy plugin and never duplicated: the mesh owns machines, deploy owns releases.

The row's headline is computed from the returned data. The fleet-update row would today read as a failure with its reason, because the last run failed on most consumers. A flow whose read operation fails says so, with the error and the time, and never reads as healthy.

A flow with no read operation is not drawn. File push has none (no transfer log), and appears in the "not built" note below until it does.

## Screen 3 — Placement

The question is "where can this run?", and the native shape of that answer is a matrix: machines down the side, capabilities across the top.

- **Runtimes** and **agent harnesses**: measured now by `doctor`. Columns are the union of what any machine returned, so the card carries no hard-coded list of tools.
- **Hardware** (screen, microphone, camera, speaker, headless): recorded, shown with the measurement date, because it comes from the entity file and not from a live probe.

A cell is **present**, **known absent**, or **unknown**. Absent is claimed only for a machine that answered `doctor`; for a machine that did not, every probed cell is unknown and the row says which rung stopped it. Without that distinction the matrix would say "no Docker" about a machine it never reached.

Below the matrix, **where work runs**: scheduled tasks and agent processes grouped by node, so "where can this run" and "where does it run" sit together.

**Choosing columns filters rows.** Selecting Docker and Claude shows only the machines that have both. That is the actual task, so it is the interaction.

## Screen 4 — Boundary

Two halves of one boundary, side by side on a wide card.

- **Inside**: who is a member, what the policy lets members do, what each may read, and any exit node or subnet route.
- **Outside**: what is reachable from the internet. For each public hostname, the origin machine, the path (a public address, the proxy or a tunnel), the protection and the last probe. The most important line on the whole card is any service meant to be mesh-only that is bound to a public address.

The outside half draws only what can be read today: DNS records from the domains plugin matched to the public addresses of machines, deploy health, and the firewall findings of the security audit. It says plainly that tunnels, their hostnames and the machines behind them are **not readable**, because no operation reads them (see `docs/MESH_PLATFORM.md`, "The edge"). It does not say there are none.

Exit nodes and subnet routes belong on the inside half, because each one widens the boundary: an exit node sees all the traffic of every client that uses it. The section appears when the operations in `docs/MESH_PLATFORM.md` (P5) exist. Until then the card does not claim there are none, because it cannot read them; it says exit nodes are not readable.

The boundary: who is inside, what the policy lets them do, and what they may read.

**Inside half.**

- **Members.** Count of machines on the control server, including those that cannot host a login. A recorded-only record is not a member.
- **Policy in plain words.** The ACL and SSH rules are translated into sentences from the returned policy, and any selector the card does not recognise is shown exactly as written, never guessed at. The policy in force today renders as: any member may reach any port on any member; any member may SSH to any member as a non-root user or as root. Root SSH is marked, because the CLI itself calls it discouraged. Policy editing stays on the command line, behind a dry run, and the card shows the command.
- **Secret grants.** Which machines may read which secret keys through the mesh. The returned list is empty, and the owner's contract is that a missing policy grants nothing, so the empty state says exactly that: no machine except the one holding the store may read any secret through the mesh. Adding and removing a grant are write actions; removing requires a confirmation that names the machine and the keys. Grants are key names, never values.
- **Records that look wrong**, computed from returned data only. Two records that share an ethernet hardware address are probably one machine: the mesh holds a live record and a recorded-only record for the Mac mini with the same address. No mesh command retires a record, and the card says so rather than offering a button that does not exist.

## Screen 5 — Join

Admitting a machine widens the boundary, so this screen restates the consequence before it offers the recipe.

- This machine's enrollment: state, backend state, addresses, whether auto-enroll is on or why it is blocked.
- A two-step recipe: mint an enrollment key on an enrolled machine, then run `tailscale up` with the control server's login address on the new one. The options are explicit: a **reusable** key can admit more than one machine, and an **ephemeral** node disappears when it goes offline. Each toggle states what it does to the boundary.
- **The card never renders the key.** An enrollment key is a credential. The recipe is shown as commands to run, with the key left to the shell that mints it.
- **Re-enroll** this machine is a destructive action: it names the target and requires confirmation.
- When no control server is configured at all, this screen is the whole card: a first-run state that shows the one command that provisions a server, because a new developer project starts here with its own control server and never points at anyone else's.

## What the card does not do, and why

| Operation | Decision |
| --- | --- |
| `ssh` | Interactive. Hand-off: the exact command, copyable. |
| `exec`, `dispatch`, `file put` | **Not on the card for now.** Running a command or sending a file to a machine from a dashboard click, including as root on the cloud server, is a decision that belongs to the operator (open decision 5 in `docs/MESH_PLATFORM.md`). Agents use these through the CLI. |
| Messages, boards, file spaces | Do not exist. See `docs/MESH_PLATFORM.md`, proposals P2 and P3. |
| `policy set`, `policy init-ssh` | Hand-off with the dry-run command. A policy edit can lock every machine out of every other. |
| `server init`, `server update`, `server console` | Hand-off. Long, staged and host-specific. Shown on the first-run state. |
| `enroll` | Status is read. Re-enroll is on Join, with confirmation. |
| `preauthkey` | Hand-off. The key is a credential. |
| `token` | Not on the card. Credentials are entered through the drawer panel, never here. |

Every operation not on the card is listed here on purpose, so that an omission can be told apart from an oversight.

## Failure states, all first-class

Control server unverified; mesh disconnected; a source unreadable (named, with its error and time); a peer's presence unavailable; a machine not on the control server; a login recorded but never verified; a rung not yet checked. None of these renders as a zero, a blank or a reassuring word.

## Identity of a machine

A machine is keyed by its mesh address everywhere on the card. The client reports names that differ from the node records (for example a cloud server reported as `web-01`, a phone as `localhost`), so a name is a label and never a key.

## Layout and accessibility

- Wide first. Machines is two panes at container width 720 px and above, stacked below it.
- Every control is at least 44 px high, reachable by keyboard, with a visible focus ring.
- Severity is never colour alone. Each rung state has its own shape (solid, hatched, dashed, dotted) and its own word.
- No timers. Reading is on open and on Refresh. Nothing animates; the one rule for reduced motion is therefore satisfied by having no motion.
- Colours come from the host's tokens with a fallback only for the state hues.
- No emoji, no decorative icons. The mark is a three-node graph drawn in SVG.

## What was wrong with the first version

It joined `status` and `doctor` into one severity label, so the ladder was lost. It treated a phone's missing login as a defect. It printed raw payload states as three adjacent words. It had no notion of where the operator is, no capability view, no trust view and no way to fix what it reported. It never rendered against real data. It was a list of commands with a verdict on top.

## Implemented host contract — 2026-10-25

The five views now follow this design. The card reads the host's frozen permitted-operation list. The dashboard currently mounts the face read-only, so login administration and re-enrollment appear as explicit CLI handoffs there; a writable host can expose the forms and target-specific confirmation. This preserves host enforcement instead of drawing mutation buttons that cannot execute.

The Placement view also renders the plugin-owned manifest integration matrix. It labels declarations separately from timestamped observations and explains what each read proves. Unknown activity, stale presence, untested capabilities, failed reads and missing configuration are distinct. Native guard contention is handled by the generic SSSS owner without dropping auth audit records. Unsupported primitive authorization, exposure/tunnel inventories and route management are not represented as implemented capabilities.
