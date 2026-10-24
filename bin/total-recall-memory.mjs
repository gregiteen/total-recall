#!/usr/bin/env node
import { main } from '../src/cli/memory-entry.mjs';
try { await main(process.argv.slice(2)); }
catch (err) { console.error(`Error: ${err.message}`); process.exitCode = 1; }
