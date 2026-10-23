# Prompt 3 — Scaffold, then stop generating

## The prompt

```
total-recall plugin create <id> --name "<plain descriptive name>" --description "<one concrete sentence>"
```

You receive a manifest, a CLI handler and a test.

**No UI is generated, deliberately.** A card face is a design act: it requires knowing the users, their tasks and the domain's vocabulary, which is Prompt 1's work. A generated stub is precisely what produced an ecosystem of identical cards, so the scaffold refuses to write one.

**The scaffold is not yet a valid plugin.** It has no card, and `plugin info` will say so. Do not treat a successful scaffold as finished work, and do not declare a card you have not designed.

## Correct means

- The repository exists at `tr-plugin-<id>` with a manifest carrying identity only.
- Its tests run.
- You know the face is outstanding, and that Prompts 4–6 are how it gets written.

## Then

Set the surfaces you chose in Prompt 2: add `cli.subcommands`, `secrets`, `configuration`, `status`, `branding`, and finally `ui.elements` when the face exists.

## Check

```
node <skill>/scripts/record.mjs . --manifest
```

Reports the surfaces present and the surfaces outstanding. A plugin with no `ui.elements` fails — correctly — until Prompt 6 is done.
