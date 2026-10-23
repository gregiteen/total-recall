# Prompt 1 — Establish the function

**Do this before any code.** A plugin designed before its function is understood becomes a template.

## The prompt

Answer all five, concretely:

1. **What capability does this add?** One sentence. If it needs "and" to hold together, it is two plugins.
2. **Who uses it, and what two or three things do they actually do with it?** Name the tasks, not the features.
3. **What must be visible without a single click?** This decides the hierarchy later.
4. **What does it depend on outside itself?** A provider's API, a local service, other machines on the mesh, another plugin, or nothing.
5. **Could another application want this capability?** If yes, part of this plugin is the capability and part is Total Recall presentation, and they must be separable from the first line of code.

## Correct means

- You can name the users and their tasks in plain words.
- You know whether a scaffold is in scope (Prompt 7), because that changes where the domain logic lives.
- The capability is one thing, not a bundle.

If you cannot answer 1 and 2, you are not ready to write code. Stop and find out.

## Record it

Write the answers into `ui/DESIGN.md` when you reach Prompt 6 — they are the basis of the face. Keep the scaffold answer for Prompt 7.

## Check

None mechanical. The check is that you can state the answers without hedging.
