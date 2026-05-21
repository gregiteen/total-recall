import fs from 'fs';
import readline from 'readline';
import { logger } from './logger.mjs';

/**
 * Total Recall Friction Detection
 * Analyzes structured JSONL logs to identify workflow bottlenecks, high failure rates,
 * and performance regressions.
 */

export async function detectFriction(logFilePath) {
  if (!fs.existsSync(logFilePath)) {
    logger.warn('friction', `Log file not found at ${logFilePath}`);
    return null;
  }

  const fileStream = fs.createReadStream(logFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const stats = {
    totalEvents: 0,
    errors: 0,
    taskFailures: {},
    latencySum: 0,
    latencyCount: 0,
    slowestTasks: [],
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      stats.totalEvents++;
      
      if (entry.level === 'error' || entry.level === 'fatal') {
        stats.errors++;
      }

      if (entry.event === 'task_failed' && entry.taskId) {
        stats.taskFailures[entry.taskId] = (stats.taskFailures[entry.taskId] || 0) + 1;
      }

      if (entry.durationMs) {
        stats.latencySum += entry.durationMs;
        stats.latencyCount++;
        
        if (entry.durationMs > 5000) { // arbitrary 5s threshold for "slow"
          stats.slowestTasks.push({ task: entry.taskId || entry.event, duration: entry.durationMs });
        }
      }
    } catch (e) {
      // Ignore invalid JSON lines
    }
  }

  stats.averageLatency = stats.latencyCount > 0 ? stats.latencySum / stats.latencyCount : 0;
  
  // Sort slowest tasks descending
  stats.slowestTasks.sort((a, b) => b.duration - a.duration);
  stats.slowestTasks = stats.slowestTasks.slice(0, 10); // keep top 10

  const report = generateFrictionReport(stats);
  return { stats, report };
}

function generateFrictionReport(stats) {
  let report = `### Friction Detection Report\n`;
  report += `- **Total Events Analyzed**: ${stats.totalEvents}\n`;
  report += `- **Error Count**: ${stats.errors}\n`;
  report += `- **Average Latency**: ${stats.averageLatency.toFixed(2)} ms\n\n`;

  const frequentFailures = Object.entries(stats.taskFailures)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (frequentFailures.length > 0) {
    report += `#### Bottleneck: High Failure Rates\n`;
    frequentFailures.forEach(([taskId, count]) => {
      report += `- Task \`${taskId}\` failed ${count} times.\n`;
    });
    report += `\n`;
  }

  if (stats.slowestTasks.length > 0) {
    report += `#### Bottleneck: Slow Executions\n`;
    stats.slowestTasks.slice(0, 5).forEach(t => {
      report += `- \`${t.task}\` took ${t.duration} ms.\n`;
    });
  }

  return report;
}
