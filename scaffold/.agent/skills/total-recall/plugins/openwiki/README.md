# OpenWiki

> Multi-repo knowledge graph and documentation wiki engine for Total Recall

## Sharing

Offer it to your other Total Recall nodes over the mesh:

```bash
npx total-recall plugin share openwiki
```

Peers install it with `npx total-recall plugin install peer:<this-node>/openwiki`.

## Features

OpenWiki owns documentation bootstrap and templates. Total Recall core initializes portable memory without creating OpenWiki pages. After installing this plugin, create missing documentation explicitly:

```sh
total-recall openwiki bootstrap --brain /absolute/path/to/brain \
  --project-root /absolute/path/to/repository --json
```

`--brain` is required. `--project-root` adds repository documentation; omit it to seed only the brain's `openwiki/` directory. Existing files and page symlinks are preserved. A symlinked destination directory or a non-file page fails explicitly. `--dry-run` reports planned pages without writing. Bootstrap is a local Node-only operation and does not require credentials, a Total Recall server, ingestion or a provider request.

`total-recall openwiki hubs --json` lists repository pages. `total-recall openwiki ingest <directory> --project` explicitly imports documentation through the existing memory CLI. A successful bootstrap does not claim indexing or runtime readiness.

- **Identifier**: `openwiki`
- **Version**: see `plugin.json`
- **CLI Command**: `npx total-recall openwiki`
- **UI**: `ui/panel.js` custom element with DESIGN.md tokens

Open **OpenWiki** from the dashboard's Plugins folder to search workspace passages, browse indexed Markdown pages, and inspect the links between them. The atlas reads local wiki files and recorded upstream status. Customize its theme in the root `DESIGN.md`. The 16 owner blocks in `ui/chunks/` can be composed into pages or drawers. Use Settings for write-only credential entry or run `total-recall openwiki token set <provider> --stdin` in the terminal.

## Use it two ways

This plugin is a reusable brick, so a new project does not start from zero.

**Add it to a project (for apps you build and ship).** From the project directory:

```sh
total-recall plugin vendor https://github.com/gregiteen/tr-plugin-openwiki.git 
```

This copies the reduced capability and package metadata into `bricks/openwiki` and records it in `tr-bricks.json`. The [brick contract](capability/BRICK.md) covers local hub discovery, inspection, bootstrap and planning helpers. The full host CLI, generator, ingestion, UI and scheduled tasks are part of the installed plugin. See the [owner tracker](docs/projects/in-progress/OPENWIKI_RADICAL_UTILITY/OPENWIKI_RADICAL_UTILITY_PROJECT_TRACKER.md) for outstanding runtime and CLI acceptance.

**Use it directly with Total Recall (for your own machines and workflow).** Install it with `total-recall plugin install https://github.com/gregiteen/tr-plugin-openwiki.git` and run `total-recall openwiki`. Manage its credentials with `total-recall auth secret` and its skills with `total-recall skill`.

## Using this from an agent

Send wiki work here: searching or reading a repository's generated wiki, refreshing pages, and ingesting documentation into memory. Treat source code and tests as the authority over a wiki page.

```bash
total-recall openwiki hubs --json
total-recall openwiki search "<terms>"
total-recall openwiki refresh
total-recall openwiki ingest <directory> --project
```

This plugin owns no raw commands.
