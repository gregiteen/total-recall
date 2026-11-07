/** The daemon dispatches maintenance through the mesh owner; remote brains stay separate. */
// Mesh clients on these systems cannot run Total Recall, so they have nothing to update.
const NO_RUNTIME_OS=new Set(['ios','android','tvos']);
// Rows that are not machines this release can reach. They stay in the report and never count as failed.
const NOT_APPLICABLE=new Set(['not-enrolled','unsupported']);

export async function updateMeshBrainPackages({version,versions,listNodes,exec,now=Date.now}={}) {
  if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version || ''))throw new Error('A verified published TR version is required');
  if(!listNodes || !exec){
    const mesh=await import('./mesh.mjs');
    listNodes ||= ()=>mesh.listEnrichedMeshNodes();
    exec ||= mesh.execMeshCommand;
  }
  const results=[];
  const nodes=await listNodes();
  // A stored record with no live counterpart is a machine that left the mesh, but when every
  // row is stored the mesh itself did not answer, and that must not read as a clean run.
  const meshAnswered=nodes.some(node=>!node.vault_only);
  for(const node of nodes){
    if(node.self)continue;
    const name=node.ip || node.hostname || 'unidentified peer';
    if(node.vault_only && meshAnswered){results.push({node:name,status:'not-enrolled'});continue;}
    if(NO_RUNTIME_OS.has(String(node.os).toLowerCase())){results.push({node:name,status:'unsupported',os:node.os});continue;}
    const row={node:name,status:'pending'};results.push(row);
    if(!node.online){row.status='failed';row.error='Mesh node is offline; retry pending';continue;}
    if(!node.ip || !node.access?.ssh_user){row.status='failed';row.error='Mesh peer has no configured update transport; verification pending';continue;}
    try{
      // Read the durable report first, then launch only when stale or failed.
      const observed=await exec(node.ip,'cd "$HOME" && total-recall update --status --json',{timeoutMs:20000});
      let report,serving;try{const status=JSON.parse(observed.stdout);report=status.last;serving=status.server;}catch{}
      const localFailed=report?(report.local_failed ?? Math.max(0,(report.failed || 0)-(report.mesh?.failed || 0))):null;
      const current=observed.success && report && localFailed===0 && now()>=report.checkedAt && now()-report.checkedAt<2*60*60*1000 && report.versions?.['total-recall-brain']===version && (!versions?.['@gregiteen/ssss-cli'] || report.versions?.['@gregiteen/ssss-cli']===versions['@gregiteen/ssss-cli']);
      // Maintenance could not fix this server, or it would have reported a local failure above and
      // been dispatched again, so this is reported. One that lags since the last run waits for that run's report to age.
      if(current && serving?.status==='stale'){row.status='failed';row.report=report;row.server=serving;row.error=serving.reason;continue;}
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
  return {failed:results.filter(row=>row.status!=='verified' && !NOT_APPLICABLE.has(row.status)).length,results};
}
