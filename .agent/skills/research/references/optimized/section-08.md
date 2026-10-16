### 1. Proactive / Deep Research (`handleProactiveResearch`)
*   **Orchestration**: Leverages the frontier model (if configured in `~/.agent/config/frontier.yml`) to decompose the high-level objective into **3 distinct, specific search queries**.
*   **Parallelization**: Launches parallel multi-source crawlers for each query.
*   **Drafting**: Writes separate draft batch files inside `~/.agent/memory-inbox/pending/`.
*   **Synthesis**: Synthesizes the aggregated draft batches using the frontier model (falling back to the local LLM if the frontier is unavailable) to produce a comprehensive final report.
*   **Synthesis quality gate**: A synthesis that answers about its prompt (refusals, "prompt injection" warnings) or is too thin is discarded. Only the cited sources are kept, so the report is never surfaced as knowledge.

