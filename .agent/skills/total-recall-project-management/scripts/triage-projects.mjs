#!/usr/bin/env node
// The shared package owns universal triage; this overlay adds no duplicate implementation.
try { await import(new URL('../../project-management/scripts/triage-projects.mjs', import.meta.url)); }
catch (error) { console.error(`Shared project-management triage unavailable: ${error.message}`); process.exitCode = 1; }
