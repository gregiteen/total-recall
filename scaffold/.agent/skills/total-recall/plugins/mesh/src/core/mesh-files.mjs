/** Bounded atomic file transfer over the authenticated mesh execution owner. */
import fs from 'node:fs';
import crypto from 'node:crypto';
export async function putMeshFile({node,source,destination,mode=0o600,exec}={}){
  if(!node || !source || typeof destination!=='string' || !destination || destination.includes('\0'))throw new Error('Node, source and destination are required');
  if(!Number.isInteger(mode) || mode<0 || mode>0o777)throw new Error('Invalid file mode');
  const bytes=fs.readFileSync(source);if(bytes.length>256*1024)throw new Error('Mesh file exceeds 256 KiB transfer budget');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  exec ||= (await import('./mesh.mjs')).execMeshCommand;
  const payload=JSON.stringify({destination,mode,data:bytes.toString('base64'),sha256});
  const program=`const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');let input='';for await(const chunk of process.stdin)input+=chunk;const p=JSON.parse(input);const f=p.destination.startsWith('~/')?path.join(os.homedir(),p.destination.slice(2)):path.resolve(p.destination);const b=Buffer.from(p.data,'base64');if(crypto.createHash('sha256').update(b).digest('hex')!==p.sha256)throw Error('Transfer hash mismatch');fs.mkdirSync(path.dirname(f),{recursive:true,mode:448});const t=f+'.tr-transfer-'+process.pid;fs.writeFileSync(t,b,{mode:p.mode,flag:'wx'});fs.renameSync(t,f);const actual=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');if(actual!==p.sha256)throw Error('Destination verification failed');console.log(JSON.stringify({path:f,bytes:b.length,sha256:actual}));`;
  const command=`node --input-type=commonjs -e '${('(async()=>{'+program+'})().catch(()=>{console.error("Mesh transfer failed");process.exitCode=1;});').replaceAll("'","'\\''")}'`;
  const result=await exec(node,command,{timeoutMs:20000,input:payload});
  if(!result.success)throw new Error(result.stderr || 'Mesh file transfer failed');
  let observed;try{observed=JSON.parse(result.stdout);}catch{throw new Error('Invalid mesh file verification response');}
  if(observed.sha256!==sha256 || observed.bytes!==bytes.length)throw new Error('Remote file verification mismatch');
  return {ok:true,node,...observed};
}
