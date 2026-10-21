/** Official documentation downloads. Cache files are disposable projections, never credentials. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const DOC_SOURCES = [
  { id: 'claude', index: 'https://code.claude.com/docs/llms.txt', prefix: 'https://code.claude.com/docs/', catalog:true },
  { id: 'codex', index: 'https://developers.openai.com/codex/llms.txt', prefix: 'https://learn.chatgpt.com/docs/', catalog:true },
  { id: 'agy', index: 'https://antigravity.google/docs/cli/headless/', prefix: 'https://antigravity.google/docs/' },
  { id: 'cursor', index: 'https://cursor.com/llms.txt', prefix: 'https://cursor.com/docs', catalog:true },
  { id: 'dsh', repo: 'deepseek-ai/deepseek-harness', branch: 'master', directories: ['docs/', 'apps/cli/', 'packages/boot/'], index: 'https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/apps/cli/README.md' },
  { id: 'grok', index: 'https://docs.x.ai/llms.txt', prefix: 'https://docs.x.ai/build/', catalog:true },
  { id: 'muse', index: 'https://dev.meta.ai/docs/muse-code', prefix: 'https://dev.meta.ai/docs/muse-code' },
  { id: 'pi', repo: 'badlogic/pi-mono', branch: 'main', directories: ['packages/coding-agent/docs/'], index: 'https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/README.md' },
  { id: 'hermes', repo: 'NousResearch/hermes-agent', branch: 'main', directories: ['website/docs/'], index: 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/reference/cli-commands.md' },
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const TTL = 24 * 60 * 60 * 1000;
function pageFile(directory,id,file){if(!/^[a-f0-9]{64}-[a-f0-9]{64}\.txt$/.test(file || ''))throw new Error('Invalid cached documentation filename');return path.join(directory,id,file);}
function atomic(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, value, { mode: 0o600 }); fs.renameSync(temp, file); }
export function documentationDirectory() {
  const brain = process.env.TR_SECRETS_BRAIN || path.join(process.env.AGENT_DIR || path.join(os.homedir(), '.agent'), 'skills/total-recall');
  return path.join(brain, 'memory-derived/cli-agents/docs');
}
function metadata(directory, id) { try { return JSON.parse(fs.readFileSync(path.join(directory,id,'index.json'),'utf8')); } catch { return null; } }
export function documentationStatus({ directory = documentationDirectory(), agent, now = Date.now() } = {}) {
  const sources = agent ? DOC_SOURCES.filter(source => source.id === agent) : DOC_SOURCES;
  if (!sources.length) throw new Error('Unknown documentation adapter');
  const agents = sources.map(source => {
    const saved = metadata(directory,source.id);
    const complete = saved?.complete === true && saved.pages?.length > 0 && saved.pages.every(page => {
      try { return hash(fs.readFileSync(pageFile(directory,source.id,page.file))) === page.sha256; } catch { return false; }
    });
    const age=now-Date.parse(saved?.checkedAt);
    const fresh = complete && Number.isFinite(age) && age>=-300000 && age<=TTL && !saved.error;
    return { id:source.id, complete, fresh, pages:saved?.pages?.length || 0, checkedAt:saved?.checkedAt || null, lastAttempt:saved?.lastAttempt || null, error:saved?.error || null };
  });
  return { ok:agents.every(row=>row.fresh), directory, agents };
}
async function download(url, fetchImpl) {
  const allowed = new Set(['code.claude.com','claude.com','platform.claude.com','docs.anthropic.com','anthropic.com','developers.openai.com','openai.com','help.openai.com','learn.chatgpt.com','chatgpt.com','antigravity.google','cursor.com','docs.x.ai','dev.meta.ai','raw.githubusercontent.com','api.github.com']);
  let target = new URL(url);
  for(let redirects=0;redirects<5;redirects++) {
    if(target.protocol!=='https:' || target.username || target.password || !allowed.has(target.hostname)) throw new Error(`Unapproved official documentation origin: ${target.hostname}`);
    const response=await fetchImpl(target,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Total-Recall-CLI-Agents-Docs','Accept':'*/*'}});
    if(response.status>=300 && response.status<400){target=new URL(response.headers.get('location'),target);continue;}
    // Some entries advertise Markdown exports which no longer exist while the
    // same official HTML document remains available. Fetch that representation.
    if(response.status===404 && ['cursor.com','docs.x.ai'].includes(target.hostname) && target.pathname.endsWith('.md')){target.pathname=target.pathname.slice(0,-3);continue;}
    if(!response.ok)throw new Error(`Documentation HTTP ${response.status}: ${target.origin}${target.pathname}`);
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.byteLength;if(size>8*1024*1024){throw new Error('Documentation page exceeds download budget');}chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);
    const text=new TextDecoder().decode(bytes);
    if(text.trim().length<40)throw new Error('Empty documentation response');
    return text;
  }
  throw new Error('Too many documentation redirects');
}
function links(text,base,prefix) {
  const values=base.endsWith('llms.txt')?[...text.matchAll(/https:\/\/[^\s<>"'\])]+/g)].map(match=>match[0]):[];
  for(const match of text.matchAll(/\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)){try{values.push(new URL(match[1],base).href);}catch{}}
  for(const match of text.matchAll(/href=["']([^"']+)["']/g)) {try{values.push(new URL(match[1],base).href);}catch{}}
  return [...new Set(values.map(value=>{try{const url=new URL(value);url.hash='';url.search='';url.pathname=url.pathname.replace(/\/{2,}/g,'/').replace(/\/$/,'') || '/';return url.href;}catch{return '';}}))]
    .filter(url=>url.startsWith(prefix) && !/\.(png|jpg|jpeg|svg|gif|css|js|woff2?|ico|pdf)$/i.test(url));
}
export async function refreshDocumentation({ directory = documentationDirectory(), agent, fetchImpl = fetch, now = () => new Date(), maxPages = 1500 } = {}) {
  const sources=agent?DOC_SOURCES.filter(source=>source.id===agent):DOC_SOURCES;
  if(!sources.length)throw new Error('Unknown documentation adapter');
  const reports=[];
  for(const source of sources) {
    const previous=metadata(directory,source.id), pages=[], queue=[source.index], seen=new Set(), queued=new Set(queue), errors=[];
    const enqueue=url=>{if(!queued.has(url)){queued.add(url);queue.push(url);}};
    try {
      if(source.repo) {
        const tree=JSON.parse(await download(`https://api.github.com/repos/${source.repo}/git/trees/${source.branch}?recursive=1`,fetchImpl));
        if(tree.truncated)throw new Error('Official repository documentation tree is truncated');
        for(const entry of tree.tree || [])if(entry.type==='blob' && /\.(md|mdx)$/i.test(entry.path) && source.directories.some(dir=>entry.path.startsWith(dir)))enqueue(`https://raw.githubusercontent.com/${source.repo}/${source.branch}/${entry.path}`);
      }
      // Bounded batches; follow the official index/navigation to cover agent features.
      while(queue.length) {
        const batch=[];
        while(queue.length && batch.length<4){const url=queue.shift();if(!seen.has(url)){seen.add(url);batch.push(url);}}
        if(seen.size>maxPages)throw new Error('Official documentation exceeds configured page budget');
        const downloads=await Promise.allSettled(batch.map(async url=>({url,text:await download(url,fetchImpl)})));
        for(let index=0;index<downloads.length;index++) {
          const result=downloads[index];if(result.status==='rejected'){errors.push({url:batch[index],error:result.reason.message});continue;}
          const {url,text}=result.value;
          const sha256=hash(text),file=`${hash(url)}-${sha256}.txt`;
          atomic(path.join(directory,source.id,file),text);
          pages.push({url,file,sha256,bytes:Buffer.byteLength(text)});
          // A published llms index is the authoritative documentation catalog.
          // HTML navigation also contains unrelated and obsolete marketing links.
          if(source.prefix && (!source.catalog || url.endsWith('llms.txt')))for(const link of links(text,url,source.prefix))enqueue(link);
        }
      }
      const checkedAt=now().toISOString();
      if(errors.length){
        const error=`${errors.length} official document(s) failed: ${errors[0].error}`;
        const preserved=previous?.complete?previous:{id:source.id,complete:false,pages};
        atomic(path.join(directory,source.id,'index.json'),JSON.stringify({...preserved,lastAttempt:checkedAt,error,failedCount:errors.length,failures:errors},null,2));
        reports.push({id:source.id,ok:false,error,pages:preserved.pages?.length || 0,downloadedPages:pages.length,failedCount:errors.length,failures:errors});continue;
      }
      atomic(path.join(directory,source.id,'index.json'),JSON.stringify({id:source.id,complete:true,checkedAt,lastAttempt:checkedAt,pages},null,2));
      reports.push({id:source.id,ok:true,pages:pages.length});
    } catch(error) {
      atomic(path.join(directory,source.id,'index.json'),JSON.stringify({...previous,id:source.id,lastAttempt:now().toISOString(),error:error.message},null,2));
      reports.push({id:source.id,ok:false,error:error.message,pages:previous?.pages?.length || 0});
    }
  }
  return {ok:reports.every(row=>row.ok),directory,agents:reports};
}
export async function ensureDocumentation(options={}) {
  const status=documentationStatus(options);
  if(status.ok)return status;
  const refresh=[];
  for(const row of status.agents.filter(row=>!row.fresh))refresh.push(await refreshDocumentation({...options,agent:row.id}));
  return {...documentationStatus(options),refresh};
}

export async function maintainDocumentation(options={}) {
  const status=documentationStatus(options);
  const next=status.agents.filter(row=>!row.fresh).sort((a,b)=>String(a.lastAttempt || '').localeCompare(String(b.lastAttempt || '')))[0];
  if(!next)return {...status,scope:'all-agent-documentation-current'};
  const refreshed=await refreshDocumentation({...options,agent:next.id});
  const current=documentationStatus(options);
  return {...refreshed,scope:'one-stale-agent-refreshed',coverage_complete:current.ok,pending:current.agents.filter(row=>!row.fresh).map(row=>row.id)};
}

export function readDocumentation({agent,url,directory=documentationDirectory()}) {
  if(!DOC_SOURCES.some(source=>source.id===agent))throw new Error('Unknown documentation adapter');
  const index=metadata(directory,agent);
  if(!url)return {agent,pages:index?.pages?.map(page=>({url:page.url,sha256:page.sha256,bytes:page.bytes})) || []};
  const page=index?.pages?.find(page=>page.url===url);
  if(!page)throw new Error('Official document is not cached');
  const content=fs.readFileSync(pageFile(directory,agent,page.file),'utf8');
  if(hash(content)!==page.sha256)throw new Error('Cached documentation integrity mismatch');
  return {agent,url,sha256:page.sha256,checkedAt:index.checkedAt,content};
}

export function searchDocumentation({agent,query,directory=documentationDirectory()}) {
  if(typeof query!=='string' || !query.trim())throw new Error('Documentation query required');
  const sources=agent?DOC_SOURCES.filter(source=>source.id===agent):DOC_SOURCES;
  const matches=[];
  for(const source of sources)for(const page of metadata(directory,source.id)?.pages || []) {
    const doc=readDocumentation({agent:source.id,url:page.url,directory});const index=doc.content.toLowerCase().indexOf(query.toLowerCase());
    if(index>=0)matches.push({agent:source.id,url:page.url,excerpt:doc.content.slice(Math.max(0,index-120),index+600)});
    if(matches.length>=30)return {matches,truncated:true};
  }
  return {matches,truncated:false};
}
