# UltraChat SSSS Smoke Test Instructions

This document provides instructions for verifying that UltraChat properly integrates with the canonical Total Recall SSSS Sovereign AI OS reference kernel.

## Prerequisites

1. A local or deployed instance of UltraChat.
2. The Total Recall package installed as a dependency or linked locally.

## Test 1: Conformance Fixture Integration

Verify that UltraChat successfully imports and runs the Total Recall SSSS conformance fixtures:

1. In the UltraChat repository, create or update the conformance test suite (`tests/ssss-conformance.spec.mjs`).
2. Import the fixtures directly from the `total-recall` package:

```js
// tests/ssss-conformance.spec.mjs
import 'total-recall/fixtures/conformance.spec.mjs';
```

3. Run the test suite:
```bash
npx vitest run tests/ssss-conformance.spec.mjs
```
The suite should pass completely, indicating that UltraChat's parsers are fully aligned with the Total Recall schema specifications.

## Test 2: Local Brain Runtime Streaming

Verify that UltraChat can communicate with the Total Recall local runtime:

1. Start the Total Recall local runtime:
   ```bash
   npm start
   ```
2. In UltraChat, configure the AI provider to use the `total-recall/gemma4` model.
3. Send a test message in the UltraChat UI. 
4. Verify that the response is successfully streamed from the Total Recall backend via the OpenAI-compatible `/v1/chat/completions` endpoint.

## Test 3: Import/Export SSSS Archive Compatibility

Verify that SSSS archives (.tar.gz / .zip) can be interchanged between UltraChat and Total Recall.

1. Export a memory vault archive from UltraChat.
2. Use the Total Recall CLI to restore the vault locally:
   ```bash
   npx total-recall restore --input path/to/ultrachat-export.tar.gz
   ```
3. Run the Total Recall drift detector to verify index integrity and schema validation:
   ```bash
   npx total-recall rebuild --check
   ```
4. Verify that no data loss or schema validation errors occur.
5. Export the vault from Total Recall and import it back into UltraChat to ensure bidirectional compatibility.
