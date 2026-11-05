/** Internal worker entry; argv carries only a process identity, never credentials or prompts. */
import { executeProcessTask, updateAgentRecord } from './process-manager.mjs';

const id = process.argv[3];
if (process.argv[2] !== '--job' || !/^agent-[a-z0-9-]{1,120}$/.test(id || '')) throw new Error('Managed worker identity required');
try {
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 131072) throw new Error('Managed task exceeds input limit'); }
  const job = JSON.parse(input);
  if (job.id !== id) throw new Error('Managed worker identity mismatch');
  const result = await executeProcessTask(job);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'completed') process.exitCode = 1;
} catch (error) {
  updateAgentRecord(id, { status: 'failed', error: error.message, endedAt: new Date().toISOString() });
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
