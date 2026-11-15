# Total Recall

Portable memory and instructions for coding agents. Keep facts, rules and decisions in SSSS Markdown, retrieve them locally, and compile task-specific instruction capsules for connected clients.

[MIT license](LICENSE) · [Architecture](docs/ARCHITECTURE.md) · [SSSS](docs/SSSS.md) · [Release notes](docs/developer/CHANGELOG.md)

## Install and use

```sh
npm install -g total-recall-brain
total-recall init --project
total-recall remember fact "The application reads its port from configuration." --project
total-recall recall "application port" --local
total-recall context "Update application configuration" --action read,edit,test
```

Ordinary memory commands work without a running HTTP server. Canonical state is validated SSSS Markdown; search indexes and compiled instruction surfaces are derived artifacts. Local recall does not require a model call. Semantic retrieval and generation use separately configured capabilities.

Run `total-recall connect --help` to discover client setup. Before a task, read its complete context capsule and require `ready:true`; connected enforcement hooks also require a current preflight receipt and Metaharness route.

## Discover and compose capabilities

```sh
total-recall --help
total-recall plugin available
total-recall plugin list --json
total-recall plugin library --json
total-recall help "run repository quality checks" --json
total-recall composable-cli --help
```

Plugins own their implementations, configuration, credentials and interfaces. Installed plugins share one host source with per-brain activation. The available and installed inventories are reported separately; their sizes depend on the installation. Auth owns credential storage and verification.

[Plugin import](docs/plugin-import.md) covers native and foreign manifests, MCP configurations, API specifications and generic declarations. Imported declarations retain provenance and compatibility information. Executing imported code or accessing a provider requires the applicable trust and authorization; passive import alone does not establish a working integration.

For code you want to own in an application, inspect `total-recall new --help` and `total-recall plugin vendor --help` for scaffold and vendored-brick contracts.

## Contextual workspace

The dashboard hosts native plugin Homes and validated SSSS UI blocks. Search the installed block catalog with `total-recall plugin chunks --help`. Decision/Jev selects contextual compositions through the Decision owner; unavailable or abstaining providers produce a labeled fallback.

The shared Help and Tools drawers support installed interfaces, shortcuts and custom markup. Owner operations remain subject to selected-brain activation and authorization. A saved credential, installed panel or active badge does not establish provider connectivity.

## Runtime and routing evidence

```sh
total-recall startup check --json
total-recall status --json
total-recall meta-harness route "Review a repository change" --json
total-recall meta-harness router-benchmark --help
```

Runtime health, source tests, package installation and provider acceptance are separate checks. Router benchmark reports distinguish measured retrieval/routing results from configured priors and unmeasured provider cost or final decision accuracy.

## Development

Follow the repository's preflight, project and test instructions. Discover the configured quality gates through their owner:

```sh
total-recall code-quality --help
total-recall code-quality run --tier remote
npm run check:package
npm run check:ssss-registry
npm run check:plugin-versions
```

The configured full checker includes the test suite. Run it on the sanctioned test host, record the actual source and exit status, and preserve failures. Release notes and the repository's push skill define publication and deployment checks.
