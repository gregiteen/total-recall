# Generative plugin Home

1. Inventory the owner with `total-recall plugin info <id>`, `total-recall plugin library --plugin <id> --json` and its existing provider adapters. Identify the operator's primary workflows, useful readouts, and the exact operation and response field for each. Record expected coverage in the owner's plan.
2. Write the root `DESIGN.md` around those workflows. Describe the plugin's visual identity, typography, layout, motion, accessibility, and useful unavailable states. Set `ui.design_tokens` to `DESIGN.md` and `ui.home` to the ID of the declared native Home element. That element should accomplish a meaningful workflow and show real state. A command listing alone is a fallback.
3. Author independent HTML blocks at `ui/chunks/<id>.md`. Use `type: ui-chunk:chunk`, `plugin`, `id`, `title`, `description`, an ISO `timestamp`, `intents`, and `surfaces`. Include `page` for Home. Bind `operations` to exact manifest command names. Bind `data` to exact output fields using `operation:/json/pointer`. Verify each pointer against real JSON output. An optional `panel` references a declared native element that renders live data or actions through the authenticated command bridge. Package the design, the blocks, and any native modules.
4. Use CSS and accessible HTML for presentation. Declare browser-safe operations and their argument types so a block can accept input and run the real owner command in place. For specialized controls, bind the native panel and keep its effect and permission checks. Mutations require deliberate operator input. Keep user records, secrets, executable HTML, and raw provider output out of Decision requests. Send only the approved intent and eligible block metadata. Validate every returned ID before composing the page. Keep the owner Home useful if Decision abstains or is unavailable.
5. Run `node <skill>/scripts/record.mjs . --home` and compare the bindings from `total-recall plugin chunks coverage --plugin <id> --json` with the owner inventory. A valid schema and a keyword fallback establish local coverage only. Verify a successful authorized Decision request separately when configured, plus the rendered Home and the main workflow in an isolated preview.

For an operation that can return a credential, declare `sensitive_output: true` in its CLI metadata. A block may document the operation. Leave its private response fields out of `data` and route credential work through the owning CLI or Auth controls.

Reserve host file arguments with `terminal_only_args`. Use `terminal_only: true` for a wholly terminal operation, including a positional host path or a foreground server. Its safe response fields can stay indexed. Use `sensitive_output` when the result itself carries credentials or private pairing material.

## Live design

Save design tokens in the YAML frontmatter of `DESIGN.md`. The open Home reads new revisions automatically and applies their CSS while retaining the selected block order. Bind colors, typography, spacing and radii with CSS custom properties. A chunk can opt into a named style using `data-design-component="component-name"`. Shadow DOM panels inherit the published CSS variables and can use `--component-<name>-<property>` in their styles.

For a page region that should grow as the owner adds component definitions, put one owner-designed root element inside `<template data-design-components>` in a chunk. The renderer creates a copy for each supported component in the design. Add `data-design-label` to a text element to show the component name. Reserve this for a region where every definition belongs, such as a reusable design library. Keep operations, live data and HTML structure in the owner panel and SSSS blocks.

Verify a token edit and a new named component with Home open, then save malformed YAML and confirm the last valid design remains. A design save applies locally. Use Decision explicitly when the context calls for a different selection of blocks.

## Agent tool

Use `total-recall decision compose --plugin <id> --intent "<short approved task context>" --json` to publish an agent-selected page to the authenticated dashboard. The command returns the path and ordered SSSS block IDs. The open Home picks up the publication automatically. A provider abstention leaves the current page in place. Avoid adding prompts or provider controls to the Home.

When the user names a brain, pass `--brain <registered ID>` to compose, workspace search, and block add. Use the same ID throughout. In a multi-brain dashboard, choose one destination for publication. The server verifies the selected brain and the enabled owner before exposing or publishing a block.

Declare the bundled Auth plugin for host session verification. Read credential status through Auth and use the installed owning plugin for each other shared capability. A local plugin may use Auth for dashboard access without declaring an external credential.

List reused installed operations in `reuse.commands` and state the plugin's own responsibility in `reuse.owned`. Use `requires` for vendored brick IDs. Validate the package against the Total Recall binary that runs the preview. Set `TOTAL_RECALL_BIN` to that binary if your terminal resolves a different installation.

## Author and place a block

1. Search the selected brain with `total-recall plugin chunks "<intent>" --workspace --surface page --brain <brain> --json`. Use blocks from any enabled plugin that serves the task. An agent can author any missing view or workflow as an SSSS block. Ship broadly useful defaults in the owner repository and publish task-specific views into the selected brain's pool.
2. For a new pool block, author `<id>.md` with the enabled owner as `plugin`, a unique `id`, verified operation/data bindings where applicable, and `page` in `surfaces`. Use the owner design or the user's approved design. Bind a native panel for real interactive behavior. Run `total-recall plugin chunks add <id.md> --plugin <owner> --brain <brain> --json`. Add validates the SSSS document against its installed owner and returns the stable key. Read it back with `total-recall plugin chunks get <owner>:<id> --workspace --surface page --brain <brain> --json`.
3. For contextual composition, use `total-recall decision compose --plugin <owner> --intent "<approved context>" --page <id> --title "<title>" --brain <brain> --json`. Jev selects from the published pool. Open the returned path or use Saved pages in the left drawer.
4. For exact placement, supply the desired ordered keys with `total-recall plugin chunks page <id> <owner>:<block> <other-owner>:<block> --title "<title>" --brain <brain> --json`. For an existing page, read it with `total-recall plugin chunks page <id> --brain <brain> --json` and submit the complete ordered list with `--revision <current-version>` in place of `--title`. Retain the blocks the user wants to keep. A revision conflict means reread the page before retrying. Verify the stored order and render the page.

Keep secret values and private records out of block HTML and routing metadata. Use real owner data and actions. If the owner has no operation for the requested behavior, implement and verify the missing capability at the owner before calling the view functional.
