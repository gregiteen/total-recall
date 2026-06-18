# Sovereign Policy Enforcement & Verification — PRD

## 1. Goal
The goal of this project is to guarantee that workspace agents strictly adhere to system instructions, invariants, and coding preferences. This is achieved by removing rule truncation in prompt shims, generating live catalog indexes/logs directly inside the workspace vault, and executing automated spec-compliance checks and programmatic skill assertions within the pre-commit/pre-push quality gate.

## 2. Scope & Features

### Feature 1: Complete Instruction Context (No Truncation)
- Update the surface compiler to bypass character truncation for the three active directive categories (`invariants`, `preferences`, and `anti-patterns`).
- Render the full body content (including multi-line formatting) of these rules so the agents' context is fully populated with exact paths, scripts, and constraints.

### Feature 2: Live OKF Catalog Index & Update History
- Automatically generate a SPEC-compliant `index.md` (type-grouped `#` headers, alphabetical sorting, `*` bullets) in the root of the active vault directory upon compilation.
- Automatically generate a SPEC-compliant `log.md` (date-grouped `## YYYY-MM-DD` headers, newest first, `*` bullets) in the root of the active vault directory upon compilation.

### Feature 3: Quality Gate Verification & OKF Compliance Reports
- Integrate the skill optimization enforcement check (`enforce-skill-optimization.mjs`) into the quality gate (`code-quality-gate.mjs`) to block pushes if any skill directory is malformed.
- Include a non-blocking OKF compliance scan (`lint --okf`) in the quality gate to warn developers about any legacy or new memory nodes lacking required metadata (description, title, tags).

### Feature 4: Programmatic Skill Evals
- Implement a Vitest suite to programmatically execute the assertions defined in the skills' `evals/evals.json` files.

## 3. Non-Goals
- Altering the SSSS v2 operation envelope protocol.
- Enforcing strict blocking errors for legacy memory nodes lacking optional fields.
