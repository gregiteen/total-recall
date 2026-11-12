---
type: ui-chunk:chunk
plugin: openwiki
id: link-topology
title: Trace documentation links
description: Inspect links and isolated pages in the wiki topology.
timestamp: "2026-11-08T09:14:38Z"
intents: [show wiki graph, trace page links, find unlinked documentation]
surfaces: [page, right]
operations: [graph]
data: ["graph:/counts/nodes", "graph:/counts/edges", "graph:/counts/orphans"]
---

<section style="border-block-start:1px solid var(--color-outline,#cbb497)">
  <h2>Trace documentation links</h2>
  <p>Select <strong>Inspect links</strong> in the atlas to see the sources and destinations of resolved Markdown links and wikilinks.</p>
  <p>Export topology through <code>total-recall openwiki graph --format mermaid</code> or <code>--format dot</code>.</p>
</section>
