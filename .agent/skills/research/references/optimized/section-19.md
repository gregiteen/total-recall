### 1. Playwright Headless Browser Mode
If `playwright` is installed, the engine launches a headless Chromium instance to fetch pages. This handles:
*   **JavaScript-Rendered Pages**: SPAs, React, Next.js, and complex frontend architectures.
*   **Bot Detection & Protections**: Spoofs common desktop headers and sets real device viewports (`1280x800`).
*   **Performance Optimization (Resource Blocking)**: Speeds up scraping and conserves bandwidth by intercepting and **blocking** requests for:
    *   `image`
    *   `media`
    *   `font`
    *   `stylesheet`
*   **Selector Traversal**: Prioritizes key readable elements (`article`, `main`, `[role="main"]`, `.content`, `#content`) before resorting to `body` text, extracting the first 8,000 characters of clean content.

