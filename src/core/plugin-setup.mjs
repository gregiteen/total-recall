/** Run declared, enabled plugin setup through the normal isolated CLI runner. */
import { discoverPlugins } from './plugin-loader.mjs';
import { readPluginRecord } from './plugin-store.mjs';
import { runPluginCommand } from './plugin-runner.mjs';

export async function setupInstalledPlugins({root=process.cwd(),plugins=discoverPlugins(root),run=runPluginCommand,record=readPluginRecord}={}) {
  const results=[];
  for(const plugin of plugins) {
    const command=plugin.manifest?.runtime?.setup_command;
    if(!plugin.valid || !command || record(plugin)?.runtime_enabled===false)continue;
    if(!plugin.manifest.cli?.subcommands?.some(operation=>operation.name===command)) {
      results.push({id:plugin.id,ok:false,error:'Runtime setup must name a declared CLI operation'});continue;
    }
    try {
      const result=await run(plugin,{subcommand:command,cwd:root,timeoutMs:600000});
      results.push({id:plugin.id,ok:result.ok,error:result.ok?undefined:(result.stderr || result.output || 'Plugin setup failed').slice(-1000)});
    }catch(error){results.push({id:plugin.id,ok:false,error:error.message});}
  }
  return {ok:results.every(result=>result.ok),results};
}
