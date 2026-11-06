/**
 * `--help` must never do work. Instruction surfaces tell agents to run it before using a command,
 * and an audit found 166 of 340 plugin subcommands ignored the flag and acted, including sending
 * messages and spending money. So core answers from the plugin's manifest without running any of
 * its code, unless the manifest sets `cli.answers_help` because the plugin was verified to answer
 * for itself. Answering here also means help needs no credentials and works for an inactive plugin.
 */
const HELP_FLAGS = new Set(['--help', '-h']);

/** True when these arguments ask for help rather than for the command to run. */
export function asksForHelp(args = [], subcommand = '') {
  if (subcommand === 'help') return true;
  return (Array.isArray(args) ? args : []).some((arg) => HELP_FLAGS.has(arg)) || (!subcommand && args[0] === 'help');
}

function describeArg(arg) {
  const name = arg.flag || (arg.positional || !arg.name ? `<${arg.name || 'value'}>` : `--${arg.name}`);
  const value = arg.flag && arg.type && arg.type !== 'boolean' ? ` <${arg.name || 'value'}>` : '';
  const detail = arg.description || arg.label || '';
  return { name: `${name}${value}`, detail: arg.required ? `${detail}${detail ? ' ' : ''}(required)` : detail };
}

function table(rows) {
  const width = Math.max(...rows.map((row) => row.name.length));
  return rows.map((row) => `  ${row.name.padEnd(width)}  ${row.detail || ''}`.trimEnd());
}

function subcommandHelp(manifest, namespace, sub) {
  const args = (sub.args || []).map(describeArg);
  const positional = (sub.args || []).filter((arg) => arg.positional).map((arg) => `<${arg.name}>`);
  const lines = [`total-recall ${namespace} ${sub.name}${sub.description ? ` — ${sub.description}` : ''}`, ''];
  lines.push(`Usage: total-recall ${namespace} ${sub.name}${positional.length ? ` ${positional.join(' ')}` : ''}${args.length > positional.length ? ' [options]' : ''}`);
  if (args.length) lines.push('', 'Arguments:', ...table(args));
  if (sub.effect) lines.push('', `Effect: ${sub.effect}`);
  return lines;
}

function namespaceHelp(manifest, namespace) {
  const lines = [`total-recall ${namespace}${manifest.description ? ` — ${manifest.description}` : ''}`, '', `Usage: total-recall ${namespace} <command>`];
  const tasks = (manifest.gate?.tasks || []).filter((task) => typeof task === 'string' && task.trim());
  if (tasks.length) lines.push('', 'Use it to:', ...tasks.map((task) => `  ${task}`));
  const subs = manifest.cli?.subcommands || [];
  if (subs.length) lines.push('', 'Commands:', ...table(subs.map((sub) => ({ name: sub.name, detail: sub.description }))));
  return lines;
}

/**
 * The help text for this request, or null when the plugin should run: help was not asked for, or
 * the plugin is verified to answer for itself.
 */
export function manifestHelp(plugin, { subcommand = '', args = [] } = {}) {
  const manifest = plugin?.manifest;
  if (!manifest?.cli || manifest.cli.answers_help === true || !asksForHelp(args, subcommand)) return null;
  const namespace = manifest.cli.command || plugin.id;
  const asked = subcommand && subcommand !== 'help' ? subcommand : args.find((arg) => !HELP_FLAGS.has(arg) && arg !== 'help');
  const sub = (manifest.cli.subcommands || []).find((item) => item.name === asked);
  const lines = sub ? subcommandHelp(manifest, namespace, sub) : namespaceHelp(manifest, namespace);
  if (asked && !sub && !String(asked).startsWith('-')) lines.unshift(`Unknown command: ${asked}`, '');
  lines.push('', sub ? `This comes from the plugin's manifest, and nothing was run. All commands: total-recall ${namespace} --help` : 'This comes from the plugin\'s manifest, and nothing was run.');
  return `${lines.join('\n')}\n`;
}
