# PLUGIN_BRICK_STANDALONE — Product Requirements

> **Project Prefix**: `PLUGIN_BRICK_STANDALONE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_BRICK_STANDALONE_AUDIT.md (Complete)

---

## 1. The distinction this project enforces

A plugin and a brick come from one source but are different artifacts. The plugin is the **reference implementation**; the brick is **the capability extracted for a builder to scaffold into their own app**.

| | **Plugin** | **Brick** |
| --- | --- | --- |
| What it is | A Total Recall capability | **The capability itself, for a builder's app** |
| Consumer | Total Recall, on the operator's machine | A builder, scaffolding into their application |
| Runtime | Total Recall present | **Total Recall absent** |
| Credentials | The Total Recall secrets store | Supplied by the calling application |
| Shape | A CLI with argv parsing | **Exported functions the app imports** |
| Configuration | Defaults fine for one operator | **Caller-supplied, no placeholders** |
| UI | A bespoke card face in the dashboard | **None** |
| Ships with | The plugin repository | The application |

Everything below follows from the brick column. The test of a brick is not "does it run" but **"can a builder use this without rewriting it?"**

## 2. Requirements

### BR-1 — The capability is importable code, not a program (P0)
The domain logic — request construction, signature verification, payload building, response mapping — is exported as functions an application can import. It does not live inside an `argv`-parsing command handler. **Audit BS-08.**

### BR-2 — A brick runs with no Total Recall on the host (P0)
It must function when the `total-recall` binary does not exist: it does not spawn it, shell out to it, or require it on `PATH`. **Audit BS-01, BS-02.**

### BR-3 — Credentials and environment values are supplied by the caller (P0)
A brick cannot read the Total Recall secrets store, because the consuming app has none. Every credential, URL, amount, currency and name is a parameter or comes from the app's own configuration. **No placeholder values ship**: not `example.com`, not a default amount, not an example product name. **Audit BS-01, BS-09, BS-10.**

### BR-4 — A brick carries no UI (P0)
The vendored payload excludes `ui/` entirely: no `card.js`, no `DESIGN.md`, no `LOGO.md`, no `logo.svg`. A card is a Total Recall presentation concern and cannot run in an app that has no dashboard. **Audit BS-03.**

### BR-5 — A brick's copy never instructs users to install Total Recall (P0)
No error message, help text or README inside a vendored brick references Total Recall commands. The brick speaks about the application that now owns it. **Audit BS-01.**

### BR-6 — The brick tells the builder how to use it (P1)
A builder receives a short, concrete entry point: what to import, what to pass, what comes back, and where the credentials come from. Not a description of the CLI.

### BR-7 — A brick's tests prove it works without Total Recall (P1)
The vendored suite must fail if the capability calls the Total Recall binary, and must exercise the capability through its exported functions with caller-supplied configuration. A test that injects a fake auth runner does not prove the contract. **Audit BS-04.**

### BR-8 — The payload is defined per path, not by copying one tree (P0)
Vendoring and installing select files by what they are for. The manifest declares which files belong to the capability and which belong to the Total Recall host, and each path takes its own set. **Audit BS-07.**

### BR-9 — The scaffolder generates no UI (P0)
`plugin create` emits a manifest, a CLI handler and a test. It does **not** emit a card, a panel, a `DESIGN.md`, or a password input. A face is authored by hand once the plugin's function is known. **Audit BS-06.**

### BR-10 — The scaffolder emits a valid manifest (P0)
Whatever `create` produces passes `validatePluginManifest` on the first run, including when `ui` is entirely absent. **Audit BS-06.**

### BR-11 — The author is asked which path they are building for (P1)
At creation and again at vendoring, the tooling states the difference and which requirements apply. An author who intends to vendor their capability must know before writing it that it cannot call Total Recall or hard-code their own values. **Audit BS-05.**

### BR-12 — `plugin info` reports both audiences (P2)
For any installed plugin, report whether the capability is standalone, whether it is vendorable, and which host facilities it uses — so "can this ship in an app?" is inspectable rather than discovered by shipping it.

## 3. Non-goals

- Not removing the Total Recall credential path. For an installed plugin, `auth secret` is correct and stays.
- Not splitting the repositories. One source, two payloads.
- Not generating cards or capability modules. A brick's capability code is authored by hand, as the card is.
- Not changing the brick registry format or provenance record, which work.

## 4. Success condition

Vendoring any plugin into a clean application produces a brick that a builder can scaffold without rewriting it: the capability is imported as functions, every environment value is theirs to pass, it runs with **no Total Recall installed**, it carries no UI, and its tests prove all of that.
