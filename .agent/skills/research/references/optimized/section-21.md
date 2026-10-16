## 🧠 FACT SYNTHESIS, VERIFICATION & TRUST

Once raw data is gathered, it is processed to ensure accuracy:

1.  **Temporal Verification**: Synthesizers are injected with the current real-world date and the model's training cutoff date (e.g., *January 2025*). Sources published *after* the cutoff are prioritized to capture new developments.
2.  **Cross-Verification**: Facts must be cross-verified across multiple independent sources.
3.  **Confidence Grading**: Confidence scores (`0.0` to `1.0`) are mathematically computed:
    *   *Single Source*: Maximum confidence capped at `0.6`.
    *   *3+ Agreeing Sources*: Promoted up to `0.95` confidence.
4.  **Contradiction Analysis**: If sources disagree, the engine flags the conflict in a `contradictions` array.
5.  **Gap Tracking**: Unresolved questions are recorded in a `further_research_needed` array inside the report, for a human to act on. They are **never** queued automatically.

---

