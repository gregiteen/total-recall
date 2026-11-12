---
type: ui-chunk:chunk
plugin: openwiki
id: passage-search
title: Search wiki passages
description: Retrieve ranked wiki excerpts with source page and line references.
timestamp: "2026-11-08T09:14:38Z"
intents: [search wiki text, find documentation passage, find source line for a claim]
surfaces: [page, right]
operations: [search]
data: ["search:/count", "search:/totalHits", "search:/totalHubsScanned"]
---

<section>
  <h2>Search wiki passages</h2>
  <p>Search a term or phrase in the atlas. Each result shows the excerpt, section and line reference. Open the referenced Markdown file to read the surrounding text.</p>
  <p>Use <code>total-recall openwiki search &lt;query&gt; --limit 8 --json</code> to retrieve the same evidence from a harness.</p>
</section>
