## 🌐 MULTI-API WEB SEARCH & FALLBACKS

To bypass limitations and ensure high availability, the search engine utilizes a robust, prioritized fallback chain configured in `~/.agent/config/research.yml`:

$$\text{Brave Search} \longrightarrow \text{Tavily Search} \longrightarrow \text{Exa Search} \longrightarrow \text{Serper Search} \longrightarrow \text{DuckDuckGo (Always-Free Fallback)}$$

