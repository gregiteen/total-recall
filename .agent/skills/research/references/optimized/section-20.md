### 2. Graceful Plain Fetch Fallback
If Playwright is not installed or Chromium fails to launch, the engine falls back to a plain Node `fetch`.
*   **HTML Sanitization**: Automatically strips out `<script>` tags, `<style>` blocks, and other HTML/CSS markup using regex to return clean text.

---

