---
type: ui-chunk:chunk
plugin: openwiki
id: link-hygiene
title: Audit wiki link health
description: Identify broken references and orphaned pages without rewriting Markdown.
timestamp: "2026-11-08T09:14:38Z"
intents: [lint wiki links, find broken markdown links, inspect orphaned wiki pages]
surfaces: [page, right]
operations: [lint]
data: ["lint:/brokenLinksCount", "lint:/orphanCount"]
---

<section style="border-inline-start:3px solid var(--color-primary,#8d3e10);padding-inline-start:1rem">
  <h2>Audit wiki link health</h2>
  <dl>
    <dt><strong>Broken links</strong></dt><dd>Check Markdown and wikilink targets.</dd>
    <dt><strong>Orphaned pages</strong></dt><dd>Look for pages with neither incoming nor outgoing references.</dd>
  </dl>
  <p>Run <code>total-recall openwiki lint --json</code> and repair the reported files in their repository.</p>
</section>
