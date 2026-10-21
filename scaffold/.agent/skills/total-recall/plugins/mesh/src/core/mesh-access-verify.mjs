/** Prove execution from every configured online machine; metadata is not access proof. */
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
export async function verifyMeshAccess({allPairs=false,listNodes,exec}={}){
  if(!listNodes || !exec){const mesh=await import('./mesh.mjs');listNodes ||= ()=>mesh.listEnrichedMeshNodes();exec ||= mesh.execMeshCommand;}
  const nodes=listNodes();const machines=nodes.filter(node=>node.ip && node.access?.ssh_user);
  const self=nodes.find(node=>node.self);
  if(!self)throw new Error('Local mesh identity is unavailable');
  const sources=allPairs?machines:[self];const results=[];
  for(const source of sources)for(const destination of machines){
    if(source.ip===destination.ip)continue;
    const row={source:source.ip,destination:destination.ip,status:'unverified'};results.push(row);
    if(source.online===false || destination.online===false){row.status='offline';continue;}
    try{
      const command=source.self?'id -un':`cd "$HOME" && total-recall mesh exec ${quote(destination.ip)} ${quote('id -un')}`;
      const result=await exec(source.self?destination.ip:source.ip,command,{timeoutMs:20000});
      const actual=result.stdout?.trim();
      row.status=result.success && actual===destination.access.ssh_user?'verified':'failed';
      if(row.status==='failed')row.error=result.stderr || `Expected recorded login ${destination.access.ssh_user}, received ${actual || 'no identity'}`;
    }catch(error){row.status='failed';row.error=error.message;}
  }
  return {ok:results.length>0 && results.every(row=>row.status==='verified'),observedAt:new Date().toISOString(),results,unconfigured:nodes.filter(node=>node.ip && !node.access?.ssh_user).map(node=>({node:node.ip,online:node.online,reason:'No SSH account is configured; execution not verified'}))};
}
