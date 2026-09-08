import os from 'node:os';

/**
 * Context generator for System Monitor & Telemetry.
 * Invoked during evolving context compilation.
 */
export async function generateContext({ projectRoot, nodes = [] }) {
  const load = os.loadavg().map(l => l.toFixed(2)).join(', ');
  const freeMb = Math.round(os.freemem() / (1024 * 1024));
  const totalMb = Math.round(os.totalmem() / (1024 * 1024));
  const usedPercent = Math.round(((totalMb - freeMb) / totalMb) * 100);

  return `#### System Telemetry & Resource Status
- Host Platform: ${os.type()} ${os.arch()} (${os.cpus().length} vCPUs)
- CPU Load Avg: ${load} (1m, 5m, 15m)
- Host Memory: ${freeMb} MB free / ${totalMb} MB total (${usedPercent}% utilized)
- Monitored SSSS Metrics Nodes: ${nodes.length}
`;
}
export default generateContext;
