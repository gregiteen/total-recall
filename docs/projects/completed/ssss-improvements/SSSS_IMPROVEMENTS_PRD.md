# SSSS Improvements (Reference Kernel) PRD

## Goal
Formalize Total Recall as the reference kernel for the SSSS (Structured Semantic Syntax System) operating contract. Total Recall must properly validate `.agent/memory-vault/**` bypass paths, implement memory schema v2 validation, and establish strict privacy boundaries and provenance stripping for semantic feedback loops.

## Why this matters
The SSSS spec establishes Total Recall as the sovereign standard reference kernel. To prevent arbitrary or unvalidated AI-generated state from corrupting the memory vault, Total Recall must provide a `TotalRecallMemoryValidator` and enforce schema bounds. Furthermore, semantic feedback from workspace usage must not leak private data into global system optimizations without explicit consent and anonymization.

## Key Requirements
1. **Memory Path Validation Exception Handling**: Formalize the `.agent/memory-vault/**` generic validator bypass, ensuring it strictly routes to Total Recall's internal memory validation prior to VFS commit.
2. **Schema V2 Validation**: Implement conditional validation in the memory toolchain for SSSS Memory Schema v2.
3. **Feedback Privacy Scopes**: Implement scoping for `local_thread`, `workspace`, `account`, `system_candidate`, and `system_promoted`.
4. **Provenance Stripping**: Ensure any feedback-derived optimizations moving from `workspace` scope to `system` scope undergo explicit review and anonymization.
5. **Optimizer Promotion Rules**: Define the promotion lifecycle for feedback rules inside the kernel.

## Success Metrics
- Zero unvalidated writes to `.agent/memory-vault/**`.
- Feedback events never expose private thread content into global/system optimization.
- Successful implementation of the `TotalRecallMemoryValidator` API.
