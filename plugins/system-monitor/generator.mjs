import os from 'node:os';

/**
 * Context generator for System Monitor.
 * Invoked during surface compilation, so values are as of the last compile.
 */
export async function generateContext() {
  const load = os.loadavg().map(l => l.toFixed(2)).join(', ');
  const freeMb = Math.round(os.freemem() / (1024 * 1024));
  const totalMb = Math.round(os.totalmem() / (1024 * 1024));
  const usedPercent = Math.round(((totalMb - freeMb) / totalMb) * 100);

  return `#### Host Resources (as of ${new Date().toISOString()})
- Host Platform: ${os.type()} ${os.arch()} (${os.cpus().length} vCPUs)
- CPU Load Avg: ${load} (1m, 5m, 15m)
- Host Memory: ${freeMb} MB free / ${totalMb} MB total (${usedPercent}% utilized)
`;
}
export default generateContext;
