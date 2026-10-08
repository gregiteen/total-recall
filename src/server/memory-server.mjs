import { createMemoryApp } from './memory-app.mjs';
import { host, port } from '../core/config.mjs';
import { stopMemoryMaintenance } from './routes/memory.mjs';

const server = createMemoryApp().listen(port, host || '127.0.0.1', () => {
  console.error(`Total Recall memory listening on ${host || '127.0.0.1'}:${port}`);
});
server.on('error', (err) => {
  console.error(err.message);
  process.exitCode = 1;
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(async () => {
      await stopMemoryMaintenance();
      process.exitCode = 0;
    });
  });
}
