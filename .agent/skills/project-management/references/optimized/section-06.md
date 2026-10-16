## The Standard: 5-File Kanban Documentation System

All project documentation lives in `docs/projects/`, organized as a Kanban board.

> **THE FIRST RULE: EVERY PROJECT STARTS WITH AN AUDIT.**
> The first file of every project is `<PROJECT_PREFIX>_AUDIT.md`. It is an extensive, evidence-based audit of the existing code, data, infrastructure and standing rules that the project touches. **No other project document (PRD, ARCHITECTURE, DEVELOPMENT_PLAN, PROJECT_TRACKER) is created, and no code is changed, until the audit exists and is marked `Complete`.** The other four documents are written from the audit and cite its finding IDs. A project with no audit is not planned; it is a guess.
>
> If you catch yourself having already written a PRD or edited code first, stop, write the audit now, then revise the other documents and any code to match what it found. Say so in the audit's "Process note".

