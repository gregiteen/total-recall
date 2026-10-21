import {describe,it,expect} from 'vitest';
import {setupInstalledPlugins} from './plugin-setup.mjs';

describe('declared plugin setup',()=>{
  const plugin={id:'fixture',valid:true,manifest:{runtime:{setup_command:'setup'},cli:{subcommands:[{name:'setup'}]}}};
  it('uses the isolated owner runner and honors disabled plugins',async()=>{
    const calls=[];
    const result=await setupInstalledPlugins({root:'/fixture',plugins:[plugin,{...plugin,id:'disabled'}],record:item=>({runtime_enabled:item.id!=='disabled'}),run:async(item,options)=>{calls.push({item,options});return {ok:true};}});
    expect(result.ok).toBe(true);expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({cwd:'/fixture',subcommand:'setup'});
  });
  it('rejects undeclared operations and propagates real setup failure',async()=>{
    const result=await setupInstalledPlugins({plugins:[plugin,{...plugin,id:'invalid',manifest:{runtime:{setup_command:'unknown'}}}],record:()=>({}),run:async()=>({ok:false,stderr:'owner failed'})});
    expect(result.ok).toBe(false);expect(result.results.map(row=>row.error)).toEqual(['owner failed','Runtime setup must name a declared CLI operation']);
  });
});
