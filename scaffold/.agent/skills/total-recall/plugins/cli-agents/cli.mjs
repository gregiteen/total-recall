import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADAPTERS, inspectAgents } from './src/worker.mjs';
import { inspectNode, listTargets, executeCommand, executeOnNode } from './src/executor.mjs';
import { DOC_SOURCES, documentationStatus, refreshDocumentation, ensureDocumentation, maintainDocumentation, readDocumentation, searchDocumentation } from './src/documentation.mjs';
import { manageRuntime } from './src/runtime.mjs';
import { setupIntegrations } from './src/setup.mjs';

export async function run(argv = []) {
  const args = argv.slice(3); const operation = args[0] || 'status';
  if (['--help', '-h', 'help'].includes(operation)) {
    const manifest=JSON.parse(fs.readFileSync(new URL('./plugin.json',import.meta.url),'utf8'));
    console.log('Usage: total-recall cli-agents <operation> [options]\nEvery agent receives Total Recall bootstrap before dispatch. Runtime syntax: runtime <agent> <native-command...> [--node ID].\n');
    for(const command of manifest.cli.subcommands)console.log(`  ${command.name} ${(command.args || []).map(arg=>arg.flag?`${arg.flag} <${arg.name}>`:`<${arg.name}>`).join(' ')} — ${command.description}`);
    return;
  }
  let result;
  if (operation === 'status') result = {...await inspectAgents(),documentation:documentationStatus()};
  else if (operation === 'catalog') result = { adapters: ADAPTERS, permissions: ['read', 'write', 'send', 'destructive'] };
  else if (operation === 'nodes') result = await listTargets();
  else if(operation==='docs-sources')result={sources:DOC_SOURCES};
  else if(operation==='docs-read' || operation==='docs-search') {
    const option=name=>{const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1] || args[i+1].startsWith('--'))throw new Error(`${name} requires a value`);return args[i+1];};
    result=operation==='docs-read'?readDocumentation({agent:option('--agent'),url:option('--url')}):searchDocumentation({agent:option('--agent'),query:option('--query')});
  }
  else if(operation==='setup') {
    const index=args.indexOf('--node');
    if(index>=0 && (!args[index+1] || args[index+1].startsWith('-')))throw new Error('--node requires a recorded node');
    result=await setupIntegrations({node:index>=0?args[index+1]:undefined});
  }
  else if (['docs-status','docs-refresh','docs-ensure','maintenance'].includes(operation)) {
    const selected = args.indexOf('--agent');
    if (selected>=0 && (!args[selected+1] || args[selected+1].startsWith('-'))) throw new Error('--agent requires an adapter identifier');
    const options = selected>=0 ? {agent:args[selected+1]} : {};
    if(operation==='maintenance') {
      const setup=await setupIntegrations();
      result={...await maintainDocumentation(options),setup};
    } else result = operation==='docs-status' ? documentationStatus(options) : operation==='docs-ensure' ? await ensureDocumentation(options) : await refreshDocumentation(options);
    if(!result.ok)process.exitCode=1;
  }
  else if (operation === 'runtime') {
    const runtimeArgs=args.slice(1).filter(arg=>arg!=='--json'), agent=runtimeArgs.shift();
    const index=runtimeArgs.indexOf('--node'); let node='local';
    if(index>=0){node=runtimeArgs[index+1];if(!node || node.startsWith('-'))throw new Error('--node requires an identifier');runtimeArgs.splice(index,2);}
    result = node==='local' ? await manageRuntime(agent,runtimeArgs) : await executeOnNode(node,{operation:'direct',cwd:process.cwd(),argv:['total-recall','cli-agents','runtime',agent,...runtimeArgs,'--json']});
    if(!result.ok)process.exitCode=1;
  }
  else if(operation==='dispatch') {
    if(!args.includes('--stdin'))throw new Error('Task requests must arrive through stdin');
    const input=fs.readFileSync(0,'utf8');if(Buffer.byteLength(input)>65536)throw new Error('Task request too large');
    const request=JSON.parse(input);
    result=await executeOnNode(request.node || 'local',{...request,operation:'dispatch'});
    if(!result.ok)process.exitCode=1;
  }
  else if (operation === 'inspect') {
    const index = args.indexOf('--node');
    if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error('--node requires a recorded node identifier');
    result = await inspectNode(index >= 0 ? args[index + 1] : 'local');
  }
  else if (operation === 'run-command') {
    if (!args.includes('--stdin')) throw new Error('Supply the command request through stdin');
    const input = fs.readFileSync(0, 'utf8'); if (Buffer.byteLength(input) > 65536) throw new Error('Command request is too large');
    const request = JSON.parse(input);
    const root = process.env.TR_PACKAGE_ROOT;
    if (!root) throw new Error('Native host context required');
    if (!path.isAbsolute(root)) throw new Error('Absolute native host context required');
    if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') throw new Error('Native host identity mismatch');
    const { getPlugin } = await import(pathToFileURL(path.join(root, 'src/core/plugin-loader.mjs')));
    const plugin = getPlugin(request.pluginId, request.projectRoot || process.cwd());
    result = await executeCommand({ ...request, plugin });
    if (!result.ok) process.exitCode = 1;
  } else throw new Error('Unknown CLI-agents operation');
  console.log(JSON.stringify(result));
}
export default run;
