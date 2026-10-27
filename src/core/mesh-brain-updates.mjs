/** The daemon dispatches maintenance through the mesh owner; remote brains stay separate. */
export async function updateMeshBrainPackages({version,versions,listNodes,exec,now=Date.now}={}) {
  if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version || ''))throw new Error('A verified published TR version is required');
  if(!listNodes || !exec){
    const mesh=await import('./mesh.mjs');
    listNodes ||= ()=>mesh.listEnrichedMeshNodes();
    exec ||= mesh.execMeshCommand;
  }
  const results=[];
  for(const node of await listNodes()){
    if(node.self || !node.ip || !node.access?.ssh_user)continue;
    const row={node:node.ip,status:'pending'};results.push(row);
    if(!node.online){row.status='failed';row.error='Configured mesh node is offline; retry pending';continue;}
    try{
      // Read the durable report first, then launch only when stale or failed.
      const observed=await exec(node.ip,'cd "$HOME" && total-recall update --status --json',{timeoutMs:20000});
      let report;try{report=JSON.parse(observed.stdout).last;}catch{}
      const localFailed=report?(report.local_failed ?? Math.max(0,(report.failed || 0)-(report.mesh?.failed || 0))):null;
      const current=observed.success && report && localFailed===0 && now()>=report.checkedAt && now()-report.checkedAt<2*60*60*1000 && report.versions?.['total-recall-brain']===version && (!versions?.['@gregiteen/ssss-cli'] || report.versions?.['@gregiteen/ssss-cli']===versions['@gregiteen/ssss-cli']);
      if(current){row.status='verified';row.report=report;continue;}
      // npm exec pins the verified release so an old installed CLI can bootstrap
      // this capability. The remote command owns its lock, verification and report.
      const command=`cd "$HOME" && nohup npm exec --yes --package=total-recall-brain@${version} -- total-recall update --automatic --local-only --json </dev/null >/tmp/total-recall-automatic-update.log 2>&1 &`;
      const launched=await exec(node.ip,command,{timeoutMs:20000});
      row.status=launched.success?'dispatched':'failed';
      row.error=!launched.success?launched.stderr || 'Mesh maintenance dispatch failed'
        :localFailed?`Peer reports ${localFailed} local maintenance failure(s); re-dispatched`
        :'Awaiting independently verified remote report';
    }catch(error){row.status='failed';row.error=error.message;}
  }
  // A dispatched process is not a verified update. Keep it visible for retries.
  return {failed:results.filter(row=>row.status!=='verified').length,results};
}
