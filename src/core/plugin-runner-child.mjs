// Child-process entry for plugin-runner.mjs. Imports one plugin CLI handler and
// invokes it with the argv shape `total-recall <command> [sub] [...args]` would
// give it, then exits. Runs in its own process so a plugin that calls
// process.exit(), throws asynchronously, or leaks handles cannot affect the
// brain server.
import { pathToFileURL } from 'node:url';

const [handlerPath, ...pluginArgv] = process.argv.slice(2);

try {
  const mod = await import(pathToFileURL(handlerPath).href);
  const argv = ['node', 'total-recall', ...pluginArgv];
  if (typeof mod.run === 'function') {
    await mod.run(argv);
  } else if (typeof mod.default === 'function') {
    await mod.default(argv.slice(3));
  } else {
    console.error(`Plugin handler ${handlerPath} exports neither run() nor a default function`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
