/** Official documentation downloads. Cache files are disposable projections, never credentials. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { agentEnvironment, loadCustomAdapters } from './worker.mjs';

const exec = promisify(execFile);

export const DOC_SOURCES = [
  { id: 'claude', index: 'https://code.claude.com/docs/llms.txt', prefix: 'https://code.claude.com/docs/', catalog:true },
  { id: 'codex', index: 'https://developers.openai.com/codex/llms.txt', prefix: 'https://learn.chatgpt.com/docs/', catalog:true },
  { id: 'agy', index: 'https://antigravity.google/docs/cli/reference', prefix: 'https://antigravity.google/docs/' },
  { id: 'cursor', index: 'https://cursor.com/llms.txt', prefix: 'https://cursor.com/docs', catalog:true },
  { id: 'dsh', repo: 'deepseek-ai/deepseek-harness', branch: 'master', directories: ['docs/', 'apps/cli/', 'packages/boot/'], index: 'https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/apps/cli/README.md' },
  { id: 'grok', index: 'https://docs.x.ai/llms.txt', prefix: 'https://docs.x.ai/build/', catalog:true },
  { id: 'muse', index: 'https://dev.meta.ai/docs/muse-code', prefix: 'https://dev.meta.ai/docs/muse-code' },
  { id: 'pi', repo: 'badlogic/pi-mono', branch: 'main', directories: ['packages/coding-agent/docs/'], index: 'https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/README.md' },
  { id: 'hermes', repo: 'NousResearch/hermes-agent', branch: 'main', directories: ['website/docs/'], index: 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/reference/cli-commands.md' },
  { id: 'devin', index: 'https://docs.devin.ai/llms.txt', prefix: 'https://docs.devin.ai/', catalog:true },
  { id: 'windsurf', index: 'https://docs.windsurf.com/llms.txt', prefix: 'https://docs.windsurf.com/', catalog:true },
  { id: 'cline', index: 'https://docs.cline.bot/llms.txt', prefix: 'https://docs.cline.bot/', catalog:true },
  { id: 'openclaw', index: 'https://docs.openclaw.ai/llms.txt', prefix: 'https://docs.openclaw.ai/', catalog:true },
  { id: 'aider', index: 'https://aider.chat/docs/', prefix: 'https://aider.chat/docs/' },
  { id: 'goose', index: 'https://goose-docs.ai/llms.txt', prefix: 'https://goose-docs.ai/', catalog:true },
  { id: 'openhands', index: 'https://docs.openhands.dev/llms.txt', prefix: 'https://docs.openhands.dev/', catalog:true },
  { id: 'replit', index: 'https://docs.replit.com/llms.txt', prefix: 'https://docs.replit.com/', catalog:true },
  { id: 'lovable', index: 'https://docs.lovable.dev/llms.txt', prefix: 'https://docs.lovable.dev/', catalog:true },
  { id: 'ollama', index: 'https://docs.ollama.com/llms.txt', prefix: 'https://docs.ollama.com/', catalog:true },
];
function sourcesFor(agent) {
  const sources = new Map(DOC_SOURCES.map(source => [source.id, source]));
  for (const adapter of loadCustomAdapters()) if (adapter.docs) {
    const url = new URL(adapter.docs);
    sources.set(adapter.id, { id: adapter.id, index: url.href, prefix: new URL('.', url).href, origin: url.hostname });
  }
  const selected = agent ? [sources.get(agent)].filter(Boolean) : [...sources.values()];
  if (!selected.length) throw new Error('Unknown documentation adapter or missing declared documentation URL');
  return selected;
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const TTL = 24 * 60 * 60 * 1000;
function pageFile(directory,id,file){if(!/^[a-f0-9]{64}-[a-f0-9]{64}\.txt$/.test(file || ''))throw new Error('Invalid cached documentation filename');return path.join(directory,id,file);}
function atomic(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, value, { mode: 0o600 }); fs.renameSync(temp, file); }
export function documentationDirectory() {
  const brain = process.env.TR_SECRETS_BRAIN || path.join(process.env.AGENT_DIR || path.join(os.homedir(), '.agent'), 'skills/total-recall');
  const directory = path.join(brain, 'memory-derived/meta-harness/docs');
  // Keep the downloaded pages when the old directory name is still on disk.
  const legacy = path.join(brain, 'memory-derived/cli-agents/docs');
  if (!fs.existsSync(directory) && fs.existsSync(legacy)) { fs.mkdirSync(path.dirname(directory), { recursive: true }); fs.renameSync(legacy, directory); }
  return directory;
}
function metadata(directory, id) { try { return JSON.parse(fs.readFileSync(path.join(directory,id,'index.json'),'utf8')); } catch { return null; } }
export function documentationStatus({ directory = documentationDirectory(), agent, now = Date.now() } = {}) {
  const sources = sourcesFor(agent);
  if (!sources.length) throw new Error('Unknown documentation adapter');
  const agents = sources.map(source => {
    const saved = metadata(directory,source.id);
    const complete = saved?.complete === true && saved.pages?.some(page => page.url === source.index) && saved.pages.every(page => {
      try { return hash(fs.readFileSync(pageFile(directory,source.id,page.file))) === page.sha256; } catch { return false; }
    });
    const age=now-Date.parse(saved?.checkedAt);
    const fresh = complete && Number.isFinite(age) && age>=-300000 && age<=TTL && !saved.error;
    return { id:source.id, complete, fresh, pages:saved?.pages?.length || 0, checkedAt:saved?.checkedAt || null, lastAttempt:saved?.lastAttempt || null, error:saved?.error || null };
  });
  return { ok:agents.every(row=>row.fresh), directory, agents };
}
async function download(url, fetchImpl, declaredOrigin) {
  const allowed = new Set(['code.claude.com','claude.com','platform.claude.com','docs.anthropic.com','anthropic.com','developers.openai.com','openai.com','help.openai.com','learn.chatgpt.com','chatgpt.com','antigravity.google','cursor.com','docs.x.ai','dev.meta.ai','docs.devin.ai','docs.windsurf.com','windsurf.com','docs.cline.bot','docs.openclaw.ai','aider.chat','docs.replit.com','docs.lovable.dev','docs.ollama.com','goose-docs.ai','block.github.io','docs.openhands.dev','raw.githubusercontent.com','api.github.com']);
  let target = new URL(url);
  if (declaredOrigin) allowed.add(declaredOrigin);
  for(let redirects=0;redirects<5;redirects++) {
    if(target.protocol!=='https:' || target.username || target.password || !allowed.has(target.hostname)) throw new Error(`Unapproved official documentation origin: ${target.hostname}`);
    const response=await fetchImpl(target,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Total-Recall-Meta-Harness-Docs','Accept':'*/*'}});
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
    .filter(url=>url.startsWith(prefix) && !/%3[CE]|[<>"'`\s]/i.test(url) && !/\.(png|jpg|jpeg|svg|gif|css|js|woff2?|ico|pdf|json|ya?ml|xml|zip|gz|tgz|lock)$/i.test(url));
}
async function gitDocumentationPaths(source) {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-harness-doc-tree-'));
  const options = {
    cwd: checkout, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...agentEnvironment(), GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull },
  };
  try {
    await exec('git', ['-c', 'http.followRedirects=false', 'clone', '--quiet', '--filter=blob:none',
      '--depth=1', '--single-branch', '--branch', source.branch, '--no-checkout',
      '--', `https://github.com/${source.repo}.git`, checkout], options);
    const { stdout } = await exec('git', ['ls-tree', '-r', '-z', 'HEAD', '--', ...source.directories], options);
    return stdout.split('\0').flatMap(entry => {
      const match = /^100(?:644|755) blob [a-f0-9]+\t([\s\S]+)$/.exec(entry);
      return match ? [match[1]] : [];
    });
  } catch {
    throw new Error(`Could not read the official documentation tree through Git for ${source.repo}`);
  } finally { fs.rmSync(checkout, { recursive: true, force: true }); }
}

export async function refreshDocumentation({ directory = documentationDirectory(), agent, fetchImpl = fetch, now = () => new Date(), maxPages = 1500, readGitPaths = gitDocumentationPaths } = {}) {
  const sources=sourcesFor(agent);
  if(!sources.length)throw new Error('Unknown documentation adapter');
  const reports=[];
  for(const source of sources) {
    const previous=metadata(directory,source.id), pages=[], queue=[source.index], seen=new Set(), queued=new Set(queue), errors=[], discovered=new Set(), skipped=[];
    // `found` marks a link taken from HTML navigation. The vendor's catalog, the index and the repository tree are authoritative; a link found by scraping is not.
    const enqueue=(url,found=false)=>{if(!queued.has(url)){queued.add(url);queue.push(url);if(found)discovered.add(url);}};
    let treeSource;
    try {
      if(source.repo) {
        let paths;
        try {
          const tree = JSON.parse(await download(`https://api.github.com/repos/${source.repo}/git/trees/${source.branch}?recursive=1`, fetchImpl));
          if (tree.truncated) throw new Error('Official repository documentation tree is truncated');
          if (!Array.isArray(tree.tree)) throw new Error('Invalid official repository documentation tree');
          paths = tree.tree.filter(entry => entry.type === 'blob').map(entry => entry.path);
          treeSource = 'github-rest';
        } catch (error) {
          if (!/^Documentation HTTP (403|429):|^Official repository documentation tree is truncated$/.test(error.message)) throw error;
          paths = await readGitPaths(source);
          treeSource = 'github-git';
        }
        for (const file of paths) {
          if (!/\.(md|mdx)$/i.test(file) || !source.directories.some(dir => file.startsWith(dir))) continue;
          const encoded = file.split('/').map(encodeURIComponent).join('/');
          enqueue(`https://raw.githubusercontent.com/${source.repo}/${source.branch}/${encoded}`);
        }
        if (queue.length === 1) throw new Error('Official repository documentation tree contains no additional pages');
      }
      // Bounded batches; follow the official index/navigation to cover agent features.
      while(queue.length) {
        const batch=[];
        while(queue.length && batch.length<4){const url=queue.shift();if(!seen.has(url)){seen.add(url);batch.push(url);}}
        if(seen.size>maxPages)throw new Error('Official documentation exceeds configured page budget');
        const downloads=await Promise.allSettled(batch.map(async url=>({url,text:await download(url,fetchImpl,source.origin)})));
        for(let index=0;index<downloads.length;index++) {
          const result=downloads[index];
          if(result.status==='rejected'){
            const message=result.reason.message;
            // A scraped link that is gone (404 or 410) is a stale or illustrative link, such as a placeholder in a code sample. It is reported as skipped and does not fail the refresh. Anything else, and anything the vendor itself lists, stays a failure.
            if(discovered.has(batch[index]) && /HTTP (404|410)\b/.test(message)){skipped.push({url:batch[index],error:message});continue;}
            // A page that redirects off the approved origins (for example a trust-center portal) is an external link, not documentation. It is never followed, and it is reported. The index itself redirecting away still fails the refresh.
            if(batch[index]!==source.index && /^Unapproved official documentation origin/.test(message)){skipped.push({url:batch[index],error:message});continue;}
            errors.push({url:batch[index],error:message});continue;
          }
          const {url,text}=result.value;
          const sha256=hash(text),file=`${hash(url)}-${sha256}.txt`;
          atomic(path.join(directory,source.id,file),text);
          pages.push({url,file,sha256,bytes:Buffer.byteLength(text)});
          // A published llms index is the authoritative documentation catalog.
          // HTML navigation also contains unrelated and obsolete marketing links.
          if(source.prefix && (!source.catalog || url.endsWith('llms.txt')))for(const link of links(text,url,source.prefix))enqueue(link,!url.endsWith('llms.txt'));
        }
      }
      const checkedAt=now().toISOString();
      if(errors.length){
        const error=`${errors.length} official document(s) failed: ${errors[0].error}`;
        const preserved=previous?.complete?previous:{id:source.id,complete:false,pages};
        atomic(path.join(directory,source.id,'index.json'),JSON.stringify({...preserved,lastAttempt:checkedAt,error,failedCount:errors.length,failures:errors,...(skipped.length?{skipped}:{})},null,2));
        reports.push({id:source.id,ok:false,error,pages:preserved.pages?.length || 0,downloadedPages:pages.length,failedCount:errors.length,failures:errors,...(skipped.length?{skippedCount:skipped.length,skipped}:{})});continue;
      }
      atomic(path.join(directory,source.id,'index.json'),JSON.stringify({id:source.id,complete:true,checkedAt,lastAttempt:checkedAt,pages,...(skipped.length?{skipped}:{})},null,2));
      reports.push({id:source.id,ok:true,pages:pages.length,...(treeSource?{treeSource}:{}),...(skipped.length?{skippedCount:skipped.length,skipped}:{})});
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
  sourcesFor(agent);
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
  const sources=sourcesFor(agent);
  const matches=[],phrase=query.trim().toLowerCase(),terms=phrase.split(/\s+/).filter(Boolean);
  for(const source of sources)for(const page of metadata(directory,source.id)?.pages || []) {
    const doc=readDocumentation({agent:source.id,url:page.url,directory});const text=doc.content.toLowerCase();
    // The exact phrase wins. Otherwise a page matches when it contains every term, in any order, so a query of two words is not limited to pages where they happen to be adjacent.
    let index=text.indexOf(phrase);
    if(index<0 && terms.length>1 && terms.every(term=>text.includes(term)))index=Math.min(...terms.map(term=>text.indexOf(term)));
    if(index>=0)matches.push({agent:source.id,url:page.url,excerpt:doc.content.slice(Math.max(0,index-120),index+600)});
    if(matches.length>=30)return {matches,truncated:true};
  }
  return {matches,truncated:false};
}
