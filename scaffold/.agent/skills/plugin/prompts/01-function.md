# Prompt 1 — Establish the function

**Do this before any code.** A plugin designed before its function is understood becomes a template.

## The prompt

Answer all five, concretely:

1. **What capability does this add?** One sentence. If it needs "and" to hold together, it is two plugins.
2. **Who uses it, and what two or three things do they actually do with it?** Name the tasks, not the features.
3. **What must be visible without a single click?** This decides the hierarchy later.
4. **What does it depend on outside itself, and who owns each dependency?** Read the installed plugin library, available plugins and project bricks. Use the owning plugin's supported interface wherever it covers the need. Vendor an existing brick when the project needs to own the code.
5. **Could another application want this capability?** If yes, part of this plugin is the capability and part is Total Recall presentation, and they must be separable from the first line of code.

## Correct means

- You can name the users and their tasks in plain words.
- You know whether a scaffold is in scope (Prompt 7), because that changes where the domain logic lives.
- The capability is one thing, not a bundle.
- You can identify what the plugin reuses, how to call or vendor it, and the specific capability gap that needs new code.

If you cannot answer 1 and 2, you are not ready to write code. Stop and find out.

## Record it

Record the owners and reuse decisions in the project plan before implementation. Carry the exact installed operations and the plugin's own responsibility into the manifest using the [composition contract](../references/surfaces.md#composition). Write the user and task answers into `ui/DESIGN.md` for Prompt 6. Keep the scaffold answer for Prompt 7.

## Check

Once the manifest is drafted, run `node <skill>/scripts/record.mjs . --reuse`. Resolve any failures before implementing the capability.
