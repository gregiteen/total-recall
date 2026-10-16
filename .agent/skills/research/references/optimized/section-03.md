## 🎯 SYSTEM OVERVIEW & WORKFLOWS

Under the hood, the engine performs deep context collection, crawls live web pages, cross-verifies facts across multiple independent APIs, and compiles structured Markdown memory nodes with valid SSSS v2 metadata.

```mermaid
flowchart TD
    A[Trigger Research] --> B{Choose Execution Mode}
    B -->|Proactive / Deep| C[Frontier-Orchestrated Planning]
    B -->|Quick / Direct| D[Local LLM Single-Cycle Engine]
    
    C --> E[Plan: Decompose into 3 target queries]
    E --> F[Parallel Multi-Source Search & Crawl]
    D --> F
    
    F --> G{Search Fallback Chain}
    G -->|Paid| H[Brave / Tavily / Exa / Serper]
    G -->|Free Fallback| I[DuckDuckGo Instant / Wikipedia]
    
    F --> J[Specialized Adapters: arXiv / npm / GitHub]
    
    F --> K{Scraping Pipeline}
    K -->|JS Pages / SPAs| L[Playwright Headless Chromium\nResource Blocking Mode]
    K -->|Raw Fetch Fallback| M[Strip HTML Tags & Scripts]
    
    H & I & J & L & M --> N[Fact Extraction & Verification]
    N --> O{Assess Confidence}
    O -->|>= 0.7 Fast Path| P[Direct Vault Write & Immediate Surface Recompile]
    O -->|< 0.7 Inbox Path| Q[Stage as Draft Node in Inbox for Manual Review]
    
    P --> R[Done: surfaced as a System 2 brief — never re-queued]
```

---

