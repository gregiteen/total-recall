// Child-process entry for plugin-runner.mjs. Imports one plugin CLI handler and
// invokes it with the argv shape `total-recall <command> [sub] [...args]` would
// give it, then exits. Runs in its own process so a plugin that calls
// process.exit(), throws asynchronously, or leaks handles cannot affect the
// brain server.
import { pathToFileURL } from 'node:url';

const [handlerPath, ...pluginArgv] = process.argv.slice(2);

try {
  const mod = await import(pathToFileURL(handlerPath).href);
  const composable = process.env.TR_PLUGIN_COMMAND_MODE === 'composable';
  const json = composable && pluginArgv.slice(1).includes('--json');
  const args = composable ? [pluginArgv[0], ...pluginArgv.slice(1).filter(arg => arg !== '--json')] : pluginArgv;
  const argv = ['node', 'total-recall', ...args];
  let result;
  if (typeof mod.run === 'function') {
    result = await mod.run(argv);
  } else if (typeof mod.default === 'function') {
    result = await mod.default(argv.slice(3));
  } else {
    console.error(`Plugin handler ${handlerPath} exports neither run() nor a default function`);
    process.exitCode = 1;
  }
  if (composable) {
    const exitCode = Number.isInteger(result?.exitCode) ? result.exitCode : process.exitCode || 0;
    if (json) console.log(JSON.stringify({ ok: exitCode === 0, exit_code: exitCode, result: result?.data ?? result ?? null }));
    process.exitCode = exitCode;
  }
} catch (err) {
  const code = Number.isInteger(err?.exitCode) ? err.exitCode : 1;
  if (process.env.TR_PLUGIN_COMMAND_MODE === 'composable' && pluginArgv.slice(1).includes('--json')) {
    console.log(JSON.stringify({ ok: false, exit_code: code, error: err.message }));
  } else console.error(err?.stack || String(err));
  process.exitCode = code;
}
