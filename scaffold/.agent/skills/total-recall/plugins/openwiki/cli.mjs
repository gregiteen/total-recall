#!/usr/bin/env node
/**
 * OpenWiki CLI Handler
 * Executed via: npx total-recall openwiki <subcommand>
 */
// Scaffold: report honestly what exists. Add each real subcommand to
// IMPLEMENTED and to plugin.json "cli.subcommands" as it is built.

import fs from "node:fs";
import path from "node:path";
import { runBootstrapCommand } from './src/bootstrap.mjs';

async function probeCommand(args) {
  const json = args.includes("--json");
  const host = process.env.TOTAL_RECALL_URL || "http://127.0.0.1:3000";
  const start = Date.now();
  try {
    const res = await fetch(`${host}/health`, { signal: AbortSignal.timeout(3000) });
    const latency_ms = Date.now() - start;
    const ok = res.ok;
    const status = res.status;
    const result = { status, ok, latency_ms, endpoint: "/health" };
    if (json) console.log(JSON.stringify(result));
    else console.log(`Health probe: HTTP ${status} (${latency_ms}ms) from ${host}`);
    if (!ok) process.exitCode = 1;
  } catch (err) {
    const latency_ms = Date.now() - start;
    const result = { status: 503, ok: false, latency_ms, error: err.message };
    if (json) console.log(JSON.stringify(result));
    else console.error(`Health probe failure: ${err.message} (${latency_ms}ms)`);
    process.exitCode = 1;
  }
}

async function hubsCommand(args) {
  const json = args.includes("--json");
  const targetDir = path.resolve(process.cwd(), "openwiki");
  const hubs = [];

  if (fs.existsSync(targetDir)) {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith(".md")) {
        const fullPath = path.join(targetDir, ent.name);
        const content = fs.readFileSync(fullPath, "utf8");
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : ent.name.replace(/\.md$/, "");
        const lines = content.split("\n").length;
        hubs.push({
          title,
          path: path.relative(process.cwd(), fullPath),
          lines,
          size_bytes: content.length
        });
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ hubs, count: hubs.length, directory: targetDir }));
  } else {
    if (hubs.length === 0) {
      console.log(`No markdown hubs found in ${targetDir}`);
    } else {
      console.log(`Discovered ${hubs.length} OpenWiki Hub(s) in ${targetDir}:`);
      for (const h of hubs) {
        console.log(`  - ${h.title}: ${h.path} (${h.lines} lines, ${h.size_bytes} bytes)`);
      }
    }
  }
}

import { runOpenWikiIngest } from "./src/ingest.mjs";

async function ingestCommand(args) {
  const result = await runOpenWikiIngest(args);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

const IMPLEMENTED = {};
IMPLEMENTED.probe = probeCommand;
IMPLEMENTED.hubs = hubsCommand;
IMPLEMENTED.ingest = ingestCommand;
IMPLEMENTED.bootstrap = runBootstrapCommand;


export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const sub = args[0] || "status";
  const json = args.includes("--json");

  if (sub === "status") {
    const status = { plugin: "openwiki", implemented: Object.keys(IMPLEMENTED) };
    if (json) console.log(JSON.stringify(status));
    else console.log(status.implemented.length
      ? `OpenWiki: implemented subcommands: ${status.implemented.join(", ")}`
      : `OpenWiki: scaffold only — no subcommands implemented yet.`);
    return;
  }

  if (sub === "help" || sub === "--help" || sub === "-h") {
    console.log(`
  OpenWiki — Multi-repo knowledge graph and documentation wiki engine

  Usage:
    total-recall openwiki <subcommand> [options]

  Subcommands:
    status                    Show OpenWiki plugin status
    probe [--json]            Check subsystem health
    hubs [--json]             List indexed documentation hubs
    ingest <path> [options]   Ingest Markdown files into knowledge graph
    bootstrap --brain <path> [--project-root <path>] [--dry-run] [--json]
                              Create missing plugin-owned documentation pages
`);
    return;
  }

  if (Object.hasOwn(IMPLEMENTED, sub)) return IMPLEMENTED[sub](args.slice(1));

  if (json) console.log(JSON.stringify({ ok: false, error: `OpenWiki operation is not implemented: ${sub}` }));
  console.error(`OpenWiki: "${sub}" is not implemented.`);
  process.exitCode = 2;
}
export default run;
