# Total Recall

**Portable personal memory for any IDE** — open source, with canonical SSSS Markdown and disposable search indexes.

Total Recall stores rules, preferences, facts and project knowledge. The portable runtime provides validated memory operations, local retrieval, task context and instruction surfaces. Optional capabilities run through explicitly installed plugins. Initialization creates an empty brain.

## Memory CLI

```sh
npm install total-recall-brain
npx total-recall-memory init --project
npx total-recall-memory remember preference "Prefer clear, short answers." --project
npx total-recall-memory recall "short answers" --local --project
npx total-recall-memory context "Implement a memory change" --action edit,test --project
npx total-recall-memory compile --project
```

The package preserves the `total-recall` executable, dashboard and plugin scaffold during migration. The isolated memory CLI is available as `total-recall-memory`. Use `npx --package total-recall-brain total-recall-memory <command>` without a local installation.

`context` includes required rules before ranked knowledge. Check `ready: true`; exit 2 means the required rules exceed the selected budget. Increase the explicit budget or curate applicability before continuing.

Project memory lives at `<repo>/.agent/skills/total-recall/`; global memory lives at `<home>/.agent/skills/total-recall/`. `--project` and `--global` select the layer. `AGENT_DIR` explicitly pins all layer operations to one agent root. Canonical memory remains separate between roots.

Local retrieval needs no server or embedding provider. Set `TR_EMBEDDINGS_DISABLED=1` for provider-free operation. Semantic search requires a configured provider. Compilation preserves existing embeddings; mutation commands await local indexing.

Run `total-recall --help` for the current commands. `import` preserves authored rule files and imports validated memory. `lint` validates memory and can validate installed manifests with `--plugins`; feature records require their owning validator.

## Optional capabilities

```sh
total-recall plugin install /path/to/capability --global
total-recall plugin list
total-recall plugin info capability-id
total-recall capability-command --help
total-recall plugin remove capability-id --global
```

Local directories and Git sources use the same manifest validation, canonical installation records and artifact digest. Installed `cli` and `commands` declarations use an isolated child process with bounded output and timeout. Removal disables dispatch and preserves memory and recorded installation history; reinstalling the same artifact restores its digest.

Plugins are trusted code with the operator's OS permissions. A child process protects the host from handler exits and output interference; it provides no OS sandbox. Background jobs, services, interfaces, distribution and feature-specific validation belong to the capability owner.

Dashboard plugin interfaces run in scripts-only frames with an opaque origin. They cannot access dashboard DOM/storage or fetch services directly. Self-contained owner modules receive themed variables and a `host.run(subcommand, args)` bridge restricted to manifest-declared commands and server authorization. Native command handlers retain the trust boundary described above. Never embed secret values in generated interface code.

## Memory HTTP service

After installing the package locally:

```sh
AGENT_DIR=/path/to/agent TR_EMBEDDINGS_DISABLED=1 total-recall-memory init
AGENT_DIR=/path/to/agent HOST=127.0.0.1 PORT=3900 node node_modules/total-recall-brain/src/server/memory-server.mjs
```

In the source checkout, `npm run start:memory` selects the memory server. `npm start` preserves the existing dashboard service.

The service exposes memory, context, instructions, rules, scoped keys and authentication. `/health` reports initialization, node count, runtime and package version. Health requires authentication except direct local access. `/.well-known/total-recall.json` lists available memory endpoints. Configure a scoped credential with `total-recall key --help` or `generate-pat --help` before remote use.

The `total-recall-brain/memory` export provides `createMemoryApp()`. Existing package and secret-store exports remain available for installed consumers.

## Source and migration

The source checkout and this compatible npm release retain existing product implementations during migration, including the dashboard, update command and plugin creation scaffold. The package gate verifies the complete memory file inventory alongside these compatibility surfaces and excludes private brain state. The isolated memory entrypoint does not load the product worker or dashboard. A default memory-only package requires a breaking release and completed capability migration.

Versions ahead of the public npm release display **Preview features**. Host updates and older registered projects are reported separately; updating projects never downgrades a preview installation.

The [prior product README](docs/reference/legacy-product-readme.md) preserves the original documentation. The [active core/plugin project](docs/projects/in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md) records implementation and verification; its unfinished acceptance items are not release claims.

## Development

The source uses Node ESM and Vitest. Run the repository's configured background gates on its sanctioned test host. `npm run check:package` inspects npm's actual file inventory; `npm run check:ssss-registry` verifies the composed registry lock. Clean installed-artifact and native service checks complement the source suite.

MIT license. See [LICENSE](LICENSE).
