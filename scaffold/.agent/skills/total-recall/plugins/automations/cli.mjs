import { meshAutomationInventory, filterInventory } from './inventory.mjs';
import { cancelAutomation, SOURCES } from './adapters.mjs';
import { spawnSync } from 'node:child_process';

export const HELP = `Usage: total-recall automations <command> [options]

Commands:
  list                 List automation records and source coverage across the mesh
  status               Report node/source coverage and observed automation states
  show <id>            Inspect one source-owned automation record
  cancel <id>          Cancel a pending local durable task through its owner
  dream --all-brains   Run dream, including decay, for every brain on this node

Options:
  --local              Inspect this node only (also used by authenticated peers)
  --node <id|hostname>  Select one known mesh node
  --source <source>    Filter records by source
  --trigger <kind>     Filter records by trigger kind
  --state <state>      Filter records by observed state
  --json               Machine-readable output (also the default)
  --help, -h           Show this help

Sources: ${SOURCES.join(', ')}
Declarations, runner availability and observed outcomes remain separate.
Unsupported or failed sources are reported explicitly; they are never empty success.`;

export function parseArgs(argv) {
  const args = argv[2] === 'automations' ? argv.slice(3) : [...argv];
  if (!args.length || args.includes('--help') || args.includes('-h')) return { help: true };
  const command = args.shift();
  if (!['list', 'status', 'show', 'cancel', 'dream'].includes(command)) throw new Error(`Unknown command: ${command}`);
  if (command === 'dream') {
    if (args.filter(arg => arg === '--all-brains').length !== 1 || args.some(arg => !['--all-brains', '--json'].includes(arg))) {
      throw new Error('dream requires --all-brains and accepts only --json');
    }
    return { command };
  }
  const result = { command, filters: {}, localOnly: false };
  if (['show', 'cancel'].includes(command)) {
    result.id = args.shift(); if (!result.id || !/^[a-z-]+:[a-f0-9]{20}$/.test(result.id)) throw new Error('A valid automation id is required');
  }
  while (args.length) {
    const flag = args.shift();
    if (flag === '--json') continue;
    if (flag === '--local') { result.localOnly = true; continue; }
    const name = { '--node': 'node', '--source': 'source', '--trigger': 'trigger', '--state': 'state' }[flag];
    if (!name) throw new Error(`Unknown option: ${flag}`);
    const value = args.shift(); if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`);
    if (result.filters[name]) throw new Error(`Duplicate option: ${flag}`);
    result.filters[name] = value;
  }
  if (result.filters.source && !SOURCES.includes(result.filters.source)) throw new Error('Unknown source');
  if (command === 'cancel' && (Object.keys(result.filters).length || result.localOnly)) throw new Error('cancel accepts only a local automation id and --json');
  return result;
}

/** Core owns dream execution. Check support before an old core can ignore the flag. */
export function runDream(spawn = spawnSync) {
  const options = { shell: false, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true };
  const failure = (error, child = {}, results = []) => ({
    ok: false, exit_code: Number.isInteger(child.status) && child.status !== 0 ? child.status : 1,
    child_exit_code: child.status ?? null, signal: child.signal || null, results, error,
  });
  try {
    const help = spawn('total-recall', ['dream', '--help'], options);
    if (help.error || help.signal || help.status !== 0) return failure(`Cannot check core dream support: ${help.error?.message || help.stderr || help.signal || 'help failed'}`, help);
    if (!String(help.stdout).includes('--all-brains')) return failure('Core dream does not support --all-brains. Update Total Recall before this task can run.', help);
    const child = spawn('total-recall', ['dream', '--all-brains', '--json'], { ...options, timeout: 1800000 });
    if (child.error || child.signal) return failure(`Core dream did not complete: ${child.error?.message || child.signal}`, child);
    let report;
    try {
      report = JSON.parse(child.stdout);
    } catch {
      // Core log lines may surround one JSON report.
      const reports = String(child.stdout || '').split('\n').flatMap(line => {
        try { const value = JSON.parse(line); return Array.isArray(value) || Array.isArray(value?.results) || Array.isArray(value?.brains) ? [value] : []; } catch { return []; }
      });
      if (reports.length === 1) report = reports[0];
    }
    const results = Array.isArray(report) ? report : report?.results ?? report?.brains;
    if (!Array.isArray(results) || !results.length || results.some(result => !result || typeof result !== 'object' || Array.isArray(result)
      || !(typeof result.ok === 'boolean' || typeof result.success === 'boolean' || ['ok', 'success', 'completed', 'failed', 'error', 'skipped'].includes(result.status) || ['ok', 'success', 'completed', 'failed', 'error', 'skipped'].includes(result.state)))) {
      return failure(`Core dream returned no per-brain results (exit ${child.status}). Update Total Recall if --all-brains is unavailable. ${String(child.stderr || '').trim()}`.trim(), child);
    }
    if (child.status !== 0 || report?.ok === false || report?.success === false || results.some(result => result.ok === false || result.success === false || result.error
      || (Number.isInteger(result.exit_code) && result.exit_code !== 0) || ['failed', 'error'].includes(result.status) || ['failed', 'error'].includes(result.state))) {
      return failure(`Core dream failed (exit ${child.status}). ${String(child.stderr || '').trim()}`.trim(), child, results);
    }
    return { ok: true, exit_code: 0, child_exit_code: 0, results };
  } catch (error) {
    return failure(`Cannot run core dream: ${error.message}`);
  }
}

export async function run(argv = [], dependencies = {}) {
  const parsed = parseArgs(argv), write = dependencies.write || (output => process.stdout.write(output));
  if (parsed.help) { write(`${HELP}\n`); return; }
  if (parsed.command === 'dream') {
    const result = runDream(dependencies.spawnSync);
    write(`${JSON.stringify(result)}\n`);
    if (!result.ok) (dependencies.setExitCode || (code => { process.exitCode = code; }))(result.exit_code);
    return result;
  }
  const root = dependencies.packageRoot || process.env.TR_PACKAGE_ROOT;
  if (!root) throw new Error('TR_PACKAGE_ROOT is required');
  if (parsed.command === 'cancel') {
    const result = await (dependencies.cancel || cancelAutomation)(root, parsed.id);
    write(`${JSON.stringify(result)}\n`); return result;
  }
  let inventory = await (dependencies.inventory || meshAutomationInventory)(root, { localOnly: parsed.localOnly });
  inventory = filterInventory(inventory, parsed.filters);
  let result = inventory;
  if (parsed.command === 'show') {
    const records = inventory.nodes.flatMap(node => node.automations).filter(record => record.id === parsed.id);
    if (records.length !== 1) throw new Error(records.length ? 'Automation id is ambiguous' : 'Automation not found');
    result = { schema_version: 1, checked_at: inventory.checked_at, automation: records[0] };
  }
  if (parsed.command === 'status') result = { ...inventory, nodes: inventory.nodes.map(node => ({ ...node, counts: node.automations.reduce((counts, record) => ({ ...counts, [record.state]: (counts[record.state] || 0) + 1 }), {}), automations: undefined })) };
  write(`${JSON.stringify(result)}\n`); return result;
}
export default run;
