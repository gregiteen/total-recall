### Confidence-Based Routing
*   **High Confidence ($\ge 0.7$) [FAST PATH]**: Written directly to the active memory vault (`~/.agent/memory-vault/facts/`) as an `active` node, triggering an **immediate surface recompile** so the knowledge appears in `INSTRUCTIONS.md` within seconds.
*   **Low Confidence ($< 0.7$) [INBOX PATH]**: Staged in `~/.agent/memory-inbox/pending/` as a `draft` node for manual review and subsequent promotion by the conclusion-writer.

