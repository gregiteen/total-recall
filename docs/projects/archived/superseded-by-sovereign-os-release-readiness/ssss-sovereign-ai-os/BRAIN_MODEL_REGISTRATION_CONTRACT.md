# Total Recall Brain Model Registration Contract

This document outlines the Phase 6 Registration Contract between the canonical Total Recall kernel and the UltraChat product layer. 

## Registration Objective
Enable UltraChat (or any SSSS-compliant interface) to discover, mount, and natively interact with the Total Recall local brain without relying on centralized API providers (e.g., OpenAI, Anthropic). The local runtime must seamlessly expose an OpenAI-compatible API surface that satisfies UltraChat's `ai-service` expectations while leveraging the $0 cost structure of sovereign compute.

## Contract Requirements

1. **VFS Manifest Availability**
   Total Recall MUST project its active runtime capability as a standard `MODEL.md` file located at `models/catalog/total-recall/{model_id}/MODEL.md`. UltraChat's `ModelVFSService` will scan this directory.

2. **Required Schema Fields**
   The frontmatter of the `MODEL.md` MUST conform to the SSSS schema and contain the following invariant fields:
   - `type: model`
   - `provider: total-recall`
   - `provider_type: local-runtime`
   - `pricing_prompt: 0`
   - `pricing_completion: 0`
   - `model_id`: Must accurately reflect the expected underlying parameter payload (e.g. `gpt-4o-compatible` if pretending to be OpenAI format, or `gemma4`).

3. **API Emulation Layer**
   The Total Recall `src/core/runtime.mjs` component MUST listen on `http://localhost:11434/v1/chat/completions` (or user-configured port) and accept the standard payload shape expected by UltraChat. 
   
4. **VFS Passthrough**
   The registration contract assumes that Total Recall maintains sovereign authority over `memory-vault/`. UltraChat reads `MODEL.md` and uses the local endpoint directly to service its chat requests without routing through the typical proxy pool.

## Sample Implementation
See the reference sample at `models/catalog/total-recall/gemma4/MODEL.md`.

## Conformance Verification
To verify this contract:
1. Initialize the Total Recall brain using `total-recall start --runtime ollama`.
2. Ensure the SSSS metadata watcher in UltraChat indexes `total-recall/gemma4`.
3. Select `Total Recall Sovereign Brain` in the UltraChat model modal.
4. Execute a streaming chat request and verify `costCalculationService` deducts precisely `0.00` credits.
