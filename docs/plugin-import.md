# Import plugin declarations

`total-recall plugin import` converts local packages into a fresh SSSS vault.
Inspection and import are passive: they preserve source bytes, unknown metadata
and hashes without loading handlers, contacting services or installing dependencies.
Importing declarations does not activate a native plugin or grant permissions.

```sh
total-recall plugin import formats
total-recall plugin import inspect ./my-plugin
total-recall plugin import ./my-plugin --output ./imported-plugin --dry-run
total-recall plugin import ./my-plugin --output ./imported-plugin
total-recall plugin import read ./imported-plugin
total-recall plugin import export ./imported-plugin > plugin.ssss.json
```

Supply a complete package directory for referenced assets. Use `--format FORMAT`
for ambiguous packages or `--format generic` for unfamiliar declarations. Local
marketplaces require `--select NAME`; remote marketplace sources are unsupported.
Directory collection skips private `.agent` brains, VCS and dependency directories.
Public `skills/`, `.codex-plugin/` and `.claude-plugin/` metadata remain included.
Output must be absent. Complete-plan validation precedes staging and publication;
existing output is never intentionally overwritten. Exported SSSS bundles can be
imported into another fresh vault.

| Format | Recognized declaration | Execution in this adapter |
| --- | --- | --- |
| `native` | TR `plugin.json` or `tr-plugin-bundle/1` | Declared `commands` handlers; `cli` activation requires the installed host |
| `ssss` | Validated SSSS bundle JSON | Preserves bundle documents; imported plugin assets retain their capabilities |
| `agent-plugin` | Root `plugin.json` without native `id` | Portable MCP; skills need an agent host |
| `codex-plugin` | `.codex-plugin/plugin.json` | Portable MCP; other host declarations preserved |
| `claude-plugin` | `.claude-plugin/plugin.json` | Portable MCP; other host declarations preserved |
| `mcp` | JSON/YAML `mcpServers` | Unauthenticated stdio and Streamable HTTP tool listing/calls |
| `openapi` | OpenAPI 3.0–3.2 JSON/YAML | HTTP operations with scalar path/query/header parameters and JSON bodies |
| `npm` | `package.json` | JavaScript `bin` entries; dependencies must already be available |
| `vscode` | `package.json` with `engines.vscode` | Preserved contributions; extension host required |
| `python` | `pyproject.toml` | Preserved entry points; package environment required |
| `mcpb` | MCPB/DXT `manifest.json`, `.mcpb`, `.dxt` or ZIP | Portable `server.mcp_config` only; entry point alone does not create a launcher |
| `openclaw` | `openclaw.plugin.json` | Preserved declaration; native runtime required |
| `generic` | JSON/YAML/TOML or raw files | Lossless declaration/assets only; no arbitrary host execution |

Root identity and fixed portable `skills/` and `mcp.json` remain canonical.
An inline `extensions.com.openai` object replaces the whole compatibility overlay;
otherwise the overlay supplies fallback settings, including custom component
paths. Original overlay bytes survive either way. See the
[OpenAI package contract](https://developers.openai.com/plugins/build/plugins).

Execution always requires explicit source trust:

```sh
total-recall plugin import invoke ./imported-plugin mcp:docs --trust-source
total-recall plugin import invoke ./imported-plugin mcp:docs --trust-source --input '{"tool":"search","arguments":{"query":"setup"}}'
total-recall plugin import invoke ./imported-plugin hello --trust-source -- --name example
total-recall plugin import compose ./imported-plugin imported
total-recall imported hello --trust-source -- --name example
```

Composition uses the installed `composable-cli` owner in the current project and
references the imported vault. Native `run(argv)` receives the node executable,
`total-recall`, command name and literal arguments; a default handler receives
only the arguments. Returned `exitCode` and child process failures are reported.
Trusted code runs as the current OS user; the bounded subprocess is not a sandbox.

Limits: 200 files and 5 MiB of collected source bytes; archive expansion has the
same bound. TOML and ZIP reading require Python 3.11+. Symlinks and unsafe paths
are refused, except verified macOS `/var` and `/tmp` system aliases. Detected
literal credentials and credential files are rejected; use the auth secrets store.
Authenticated MCP/OpenAPI configurations require an explicit auth adapter and
are unavailable here. Legacy MCP SSE, OpenAPI references/callbacks, server variables
and complex parameter serialization are unsupported. Native UI, apps, hooks and
host extensions are retained as declarations without execution.

Each invocation extracts source into temporary storage and removes it afterwards.
There is no durable plugin data binding: configurations using `${PLUGIN_DATA}` or
`${CLAUDE_PLUGIN_DATA}` are marked unsupported. State written into extraction
directories does not persist across calls or updates. No dependencies are installed
automatically.

Installed native plugins are also ingested by normal compilation into the SSSS
installed-capabilities asset and derived CLI library. This includes CLI, API,
MCP, routers/modules and composed declarations with sanitized metadata, source
identity and activation state. Declaration completeness and callable state are
separate; passive API/MCP/router records do not acquire an execution bridge merely
by being declared. Discovery does not probe services or establish authentication.
