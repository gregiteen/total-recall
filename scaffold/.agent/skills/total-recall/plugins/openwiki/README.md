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
- **Version**: 0.1.1
- **SSSS Category**: `openwiki-hubs`
- **CLI Command**: `npx total-recall openwiki`
- **UI**: `ui/panel.js` custom element with DESIGN.md tokens

## Use it two ways

This plugin is a reusable brick, so a new project does not start from zero.

**Add it to a project (for apps you build and ship).** From the project directory:

```sh
total-recall plugin vendor https://github.com/gregiteen/tr-plugin-openwiki.git 
```

This copies the plugin's source, skills, tests and docs into `bricks/openwiki` and records it in `tr-bricks.json`. Your project then owns that code: edit it, test it in your own gates, and ship it with no runtime dependency on this plugin or on Total Recall. Combine as many bricks as the project needs. List them with `total-recall plugin bricks`.

**Use it directly with Total Recall (for your own machines and workflow).** Install it with `total-recall plugin install https://github.com/gregiteen/tr-plugin-openwiki.git` and run `total-recall openwiki`. Manage its credentials with `total-recall auth secret` and its skills with `total-recall skill`.
