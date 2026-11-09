import { meshAutomationInventory, filterInventory } from './inventory.mjs';
import { cancelAutomation, SOURCES } from './adapters.mjs';

export const HELP = `Usage: total-recall user-automations <command> [options]

Commands:
  list                 List automation records and source coverage across the mesh
  status               Report node/source coverage and observed automation states
  show <id>            Inspect one source-owned automation record
  cancel <id>          Cancel a pending local durable task through its owner

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
  const args = argv[2] === 'user-automations' ? argv.slice(3) : [...argv];
  if (!args.length || args.includes('--help') || args.includes('-h')) return { help: true };
  const command = args.shift();
  if (!['list', 'status', 'show', 'cancel'].includes(command)) throw new Error(`Unknown command: ${command}`);
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

export async function run(argv = [], dependencies = {}) {
  const parsed = parseArgs(argv), write = dependencies.write || (output => process.stdout.write(output));
  if (parsed.help) { write(`${HELP}\n`); return; }
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
