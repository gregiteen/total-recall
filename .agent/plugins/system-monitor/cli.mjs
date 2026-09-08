#!/usr/bin/env node
import os from 'node:os';
import process from 'node:process';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const sub = (args[0] === 'system-monitor' || args[0] === 'monitor') ? (args[1] || 'status') : (args[0] || 'status');

  if (sub === 'status' || sub === 'stats' || sub === 'info') {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = ((usedMem / totalMem) * 100).toFixed(1);
    const load = os.loadavg().map(l => l.toFixed(2)).join(', ');
    const cpus = os.cpus();
    const memUsage = process.memoryUsage();

    console.log('\n📊 Total Recall — System Monitor Telemetry\n');
    console.log(`  Host OS:         ${os.type()} ${os.release()} (${os.arch()})`);
    console.log(`  Hostname:        ${os.hostname()}`);
    console.log(`  CPU Cores:       ${cpus.length} cores (${cpus[0]?.model || 'Unknown CPU'})`);
    console.log(`  Load Average:    ${load} (1m, 5m, 15m)`);
    console.log(`  System Uptime:   ${formatUptime(os.uptime())}`);
    console.log(`  RAM Usage:       ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${memPercent}% used)`);
    console.log(`  Free RAM:        ${formatBytes(freeMem)}`);
    console.log(`  Process RSS:     ${formatBytes(memUsage.rss)} (Heap: ${formatBytes(memUsage.heapUsed)} / ${formatBytes(memUsage.heapTotal)})`);
    console.log(`  Node.js:         ${process.version}\n`);
    return;
  }

  if (sub === 'sample' || sub === 'record' || sub === '--json') {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = ((usedMem / totalMem) * 100).toFixed(1);
    const load = os.loadavg();

    const sample = {
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
      platform: os.platform(),
      uptimeSeconds: os.uptime(),
      loadAvg: load,
      memory: {
        total: totalMem,
        free: freeMem,
        usedPercent: Number(memPercent)
      }
    };

    console.log(JSON.stringify(sample, null, 2));
    return;
  }

  console.log(`\nUsage: npx total-recall system-monitor [status|sample]\n`);
}

export default run;
