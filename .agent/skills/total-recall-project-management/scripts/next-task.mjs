#!/usr/bin/env node
try { await import(new URL('../../project-management/scripts/next-task.mjs', import.meta.url)); }
catch (error) { console.error(`Shared project-management task inventory unavailable: ${error.message}`); process.exitCode = 1; }
