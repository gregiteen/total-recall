### 2. Always-Free Web Fallbacks (No Auth Required)
*   **DuckDuckGo Instant Answers**: Used automatically when paid budgets are exhausted or keys are missing. Excellent for definitions, structured entity facts, and direct calculations.
*   **Daily Search Budget Tracker**: To protect free-tier developers from unexpected overage charges, Total Recall tracks daily searches in `~/.agent/config/search-usage.json`. The default limit is **50 paid searches/day** (roughly 1,500/month). When this cap is exceeded, the engine gracefully falls back to free DuckDuckGo search so that research never halts.

---

