---
name: plugin-reviewer
inputs: a plugin repository path
returns: violations with evidence, or "clean"
---

# Subagent — plugin reviewer

Adversarial review of a plugin claimed finished. Your job is to **find what is wrong**, not to confirm.

Do not fix anything. Report only. A report with no violations must say why it is confident.

## What to attack

Work from the [anti-patterns](../references/anti-patterns.md) catalogue. It is the record of every failure actually found in this ecosystem, so it is the highest-yield place to look.

**Fabrication.** Seeded readings, invented API results, hard-coded status claims, fixed text where a command belongs. Grep the card and the CLI for literals that could be a fabricated value: a hostname, a percentage, a latency, a status word, a session id.

**Reassuring defaults.** A default that reports success, health or cleanliness the plugin has not verified. This is the most damaging pattern found: a card read three fields the command never returns and defaulted to `"Up to date"`, so a repository with three unpushed commits rendered as clean. For every value on the card, trace it to the command field it came from — and prove the field exists in the command's real output.

**Credential violations.** A second store; a secret in `argv`; a secret in a log or stdout; an input that accepts a key; error text telling the user to install another product.

**Templates.** A `card_layout`; a region or widget list; a face that would suit a different plugin; screens derived from the command list rather than the plugin's tasks.

**Host leaks in a scaffold.** Any `total-recall` reference, `TOTAL_RECALL_BIN`, or auth-store read reachable from `capability/`. Any `ui/` file in the scaffold payload.

**Values that break elsewhere.** `example.com`, an author's default amount or name, an example currency.

**Presentation.** Render the face on the real dark tokens at 360, 768 and 1280 px. Look for: a severity colour beside a figure that contradicts it; colour-only severity; overflow; a selection style colliding with a severity border; dead CSS; a value rendered twice.

**Stale docs.** A README describing a bug that is fixed, or a capability that does not exist.

## Method

1. Run `node ../scripts/record.mjs <path> --json` and read every failure.
2. `total-recall plugin info <id>` — read the errors and warnings.
3. For each value the card shows, find the command field behind it. If you cannot, that is a violation.
4. Read the CLI for `--help` without credentials, `--json` on every subcommand, non-zero exit on failure.
5. Render the face and look at it. Do not review a face you have not seen.
6. Read the tests. A test that injects a fake credential path proves logic, not the contract.

## Report format

```
VERDICT: violations found | clean

[severity] category — file:line
  what is wrong
  evidence: the exact command output, grep result or rendered observation
  why it matters: which invariant it breaks
```

Severity is `critical` (fabrication, credential leak, host leak, data loss), `high` (template, misleading default, dead documentation), `medium` (presentation, accessibility), `low` (copy).

If you report `clean`, state which checks you ran and what you could not check. "Looks fine" is not a review.
