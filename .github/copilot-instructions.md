Read and follow .agent/skills/total-recall/SKILL.md on every turn.

<!-- BEGIN INJECTED ACTIVE DIRECTIVES: do not edit by hand; rebuilt by total-recall surface -->
# Invariant Rules

These rules are mandatory and must never be violated.

## Agent Behavior
- Always reply directly to all user messages without exception.
- Always be thorough. Do not add placeholders.
- Check the Interrupts section in SKILL.md at the start of every turn.

## Memory Operations
- All files in this system must conform to the SSSS format. Read `skills/ssss/SKILL.md` before creating or editing any memory node.
- When you learn a new pattern or receive a correction, write it as an SSSS node to the appropriate file in this skill folder.
- After modifying memory/knowledge files, trigger a recompile via the REST API.

## User Rules
<!-- Add your project-specific invariant rules below this line -->
- Never run tsc or npm run typecheck directly.
- Never run tsc directly.

# User Preferences

Learned preferences about how the user likes to work.

<!-- Add your preferences below as the agent learns them -->
<!-- Examples:
- Be concise and direct
- Use markdown formatting
- Prefer TypeScript over JavaScript
- Always use dark mode in UI designs
-->
- Always use double quotes.

# Corrections

Mistakes that have been made and must not be repeated.

<!-- The agent adds entries here when it makes a mistake or receives a correction -->
<!-- Examples:
- Do NOT hallucinate skills or tools. Only reference things that actually exist.
- Do NOT create monolithic memory nodes. Keep rules atomic and focused.
- Do NOT duplicate rules across multiple nodes.
-->
<!-- END INJECTED ACTIVE DIRECTIVES -->
