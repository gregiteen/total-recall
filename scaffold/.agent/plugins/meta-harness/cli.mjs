#!/usr/bin/env node
import { auditClusterCapabilities, HARNESS_SPECS } from '../../../src/core/meta-harness.mjs';

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const clean = args.filter(a => a !== 'meta-harness' && a !== 'harness');
  const isJson = clean.includes('--json');
  const sub = clean.find(a => !a.startsWith('--')) || 'status';

  if (sub === 'status' || sub === 'audit' || sub === 'list') {
    const report = auditClusterCapabilities();
    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log('\n🤖 Total Recall — Meta Harness Runtimes & Agent Ecosystem\n');
    console.log(`  Local Host Architecture: ${report.local.arch}`);
    console.log(`  Total Harnesses Known:   ${report.local.harnesses.length}\n`);

    for (const h of report.local.harnesses) {
      const icon = h.available ? '✅ Available  ' : '❌ Not Found  ';
      const pathStr = h.binaryPath ? `(${h.binaryPath})` : '';
      console.log(`  ${icon} \x1b[1;36m${h.id.padEnd(8)}\x1b[0m ${h.name} ${pathStr}`);
      console.log(`             Role: ${h.category} | ${h.description}`);
    }
    console.log('\n  Run dispatch: npx total-recall harness dispatch <harness> "<prompt>"\n');
    return;
  }

  console.log('\nUsage: npx total-recall harness [status|audit]\n');
}

export default run;
