import fs from 'node:fs';
import { IMPORT_FORMATS, inspectPluginSource, importPluginSource, readImportedPlugin, exportImportedPlugin } from '../../core/plugin-import.mjs';
import { invokeFromArgv, composeImportedPlugin } from '../../core/plugin-import-runtime.mjs';

export async function runPluginImport(argv = []) {
  const optionArgv = argv.slice(0, argv.indexOf('--') < 0 ? undefined : argv.indexOf('--'));
  if (!argv.length || optionArgv.includes('--help') || optionArgv.includes('-h')) {
    console.log(`Usage: total-recall plugin import <source> --output <fresh-vault> [--format FORMAT] [--select NAME] [--dry-run] [--compose NAME]
       total-recall plugin import inspect <source> [--format FORMAT] [--select NAME]
       total-recall plugin import formats
       total-recall plugin import read|export <vault>
       total-recall plugin import compose <vault> <command-name>
       total-recall plugin import invoke <vault> <capability> --trust-source [--input JSON] [-- args...]
Import is passive and never installs dependencies or invokes source code. Export prints a portable SSSS bundle. MCP invocation without an input tool lists tools; input accepts tool/arguments, OpenAPI parameters/body.`);
    return;
  }
  const verbs = ['inspect', 'formats', 'read', 'export', 'invoke', 'compose'];
  const args = [...argv];
  const verb = verbs.includes(args[0]) ? args.shift() : 'import';
  if (verb === 'formats') { console.log(JSON.stringify(IMPORT_FORMATS)); return; }
  const source = args.shift();
  if (!source) throw new Error('Source or vault required');
  if (verb === 'invoke') {
    const result = await invokeFromArgv(source, args);
    console.log(JSON.stringify(result));
    if (result?.ok === false) process.exitCode = 1;
    return result;
  }
  const options = {}; const positional = []; let input = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { positional.push(...args.slice(i + 1)); break; }
    if (['--output', '--format', '--select', '--compose', '--input'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Option requires a value');
      const value = args[++i];
      if (arg === '--input') input = JSON.parse(value); else options[arg.slice(2)] = value;
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--trust-source') options.trust = true;
    else if (arg === '--json') continue;
    else if (arg.startsWith('-')) throw new Error('Unknown plugin import option');
    else positional.push(arg);
  }
  let result;
  if (verb === 'inspect') result = inspectPluginSource(source, options);
  else if (verb === 'read') result = readImportedPlugin(source);
  else if (verb === 'export') result = exportImportedPlugin(source);
  else if (verb === 'compose') result = await composeImportedPlugin(source, positional[0]);
  else result = await importPluginSource(source, options);
  console.log(JSON.stringify(result));
  if (result?.ok === false) process.exitCode = 1;
  return result;
}
