# SSSS

Required SSSS integration for Total Recall. The canonical engine remains in the [SSSS package](https://github.com/gregiteen/ssss). This plugin provides its installation checks, full project scaffold, validators and workbench.

Initialization and upgrades use the bundled owner hook to install the portable skill and complete starter project. The shared plugin is installed once per machine. Each initialized brain exposes its own checked scaffold under its Total Recall skill directory. Existing skill wrappers are preserved.

| Command | Operation |
| --- | --- |
| total-recall ssss status --json | Report engine/spec identity and verify skill and scaffold files. |
| total-recall ssss repair --scope project --json | Restore missing managed files or reverse a previously repinned scaffold. |
| total-recall ssss validate --file vault/rules/welcome.md --json | Validate an SSSS document through the canonical contract. |
| total-recall ssss registry --lock ssss-registry.lock.json --json | Verify an effective registry against its lock. |
| total-recall ssss scaffold --directory new-app --json | Generate a standalone project in a new child directory. |
| total-recall ssss conformance --json | Run the canonical engine, adapter and wire conformance suites. |

Use the scope selector for the shared brain or a project brain. Registry and document checks accept repeated extension files. Project scaffolding accepts an optional extension name and Total Recall wiring. Paths in the workbench are relative to the selected workspace. A failed check exits nonzero and supplies a structured verdict.

The starter scaffold and skill inventory are generated from the pinned canonical package. Run **npm run scaffold:refresh** when updating that pin. **npm test** verifies parity with the generator and checks positive and failing cases. **npm run check:ssss-conformance** runs the upstream suite against the actual pinned engine. Applications can use the portable capability without Total Recall. See [Capability brick](capability/BRICK.md).

### Required installation status

`total-recall ssss status --scope global --json` checks managed installed files. Repair verifies the receipt before restoring a scaffold whose manifest was repinned by an earlier updater. It preserves the previous directory and reports its path in `recoveredFrom`. Other scaffold changes fail inspection and repair. The [SSSS project tracker](docs/projects/in-progress/SSSS_PLUGIN/SSSS_PLUGIN_PROJECT_TRACKER.md) records clean-install, upgrade and maintenance results.

## Using this from an agent

Send SSSS work here: validating documents and registries, scaffolding a standalone project, conformance suites, and restoring a missing skill or scaffold.

```bash
total-recall ssss status --json
total-recall ssss validate --file <document> --json
total-recall ssss registry --lock ssss-registry.lock.json --json
total-recall ssss scaffold --directory <folder> --json
total-recall ssss conformance --json
total-recall ssss repair --scope project --json
```

Raw command this plugin owns: `npx @gregiteen/ssss-cli new`.
