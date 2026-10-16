## 3. Tool Suite Integration
Code Mode acts as the execution layer for the Kernel Tool Suite.
- When Gemma 4 generates a workflow plan, the OS Daemon (`task_runner.mjs`) dispatches the required logic to the Code Mode sandbox.
- Other tools like SearXNG (Web Search) and Web Scraper run alongside Code Mode in the `Kernel Tool Suite`.

