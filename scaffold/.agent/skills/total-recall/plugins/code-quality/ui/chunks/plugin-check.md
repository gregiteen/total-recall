---
type: ui-chunk:chunk
plugin: code-quality
id: plugin-check
title: Check a plugin
description: Validate the plugin in this repository and list anything that would stop it from loading or rendering.
timestamp: '2026-11-25T02:10:00Z'
intents: [validate a plugin, check plugin manifest, find missing plugin files, check plugin blocks]
surfaces: [page]
operations: [plugin-check]
---
<section data-design-component="report">
  <h2>Check this plugin</h2>
  <p>Run <code>plugin-check</code> in a plugin repository. It reads the working tree and reports manifest errors, files the manifest names that are not there, blocks that break their contract and versions that disagree. It fails when it finds one.</p>
</section>
