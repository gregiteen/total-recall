#!/usr/bin/env node
try { await import(new URL('../../project-management/scripts/verify-issues.mjs', import.meta.url)); }
catch (error) { console.error(`Shared project-management template inspection unavailable: ${error.message}`); process.exitCode = 1; }
