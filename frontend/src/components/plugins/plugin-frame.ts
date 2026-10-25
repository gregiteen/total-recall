const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

export interface PluginScreen { id: string; label: string }

/** Bound untrusted screen metadata without deriving any screen from commands. */
export function sanitizePluginScreens(value: unknown): PluginScreen[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.slice(0, 128).flatMap(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(item.id)
      || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 160 || /[\u0000-\u001f\u007f]/.test(item.label) || seen.has(item.id)) return []
    seen.add(item.id)
    return [{ id: item.id, label: item.label.trim() }]
  })
}

/** Owner code runs in an opaque origin, with no dashboard DOM/storage or direct network. */
export function pluginFrameDocument(source: string, tag: string, channel: string, theme: Record<string, string> = {}, pluginId = '', commandTimeouts: Record<string, number> = {}, operations: readonly string[] = []) {
  return `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${channel}' blob:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: https:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Cabinet+Grotesk:wght@700;800&family=Chivo+Mono:wght@500;700&family=Cinzel:wght@600;700;900&family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600;1,700&family=DM+Mono:wght@500&family=DM+Sans:wght@500;700&family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@500;700&family=Lexend:wght@600;800&family=Newsreader:ital,opsz,wght@0,6..72,600;1,6..72,600&family=Orbitron:wght@700;900&family=Outfit:wght@500;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&family=Space+Grotesk:wght@600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:0;background:transparent;color:var(--text-primary)}*{box-sizing:border-box}</style>
</head><body><script nonce="${channel}" type="module">
const channel=${inlineJson(channel)};
const pending=new Map();let sequence=0;
const send=(type,extra={})=>parent.postMessage({channel,type,...extra},'*');
let ownerScreens=[];
const sanitizeScreens=${sanitizePluginScreens.toString()};
function publishScreens(element){
 ownerScreens=sanitizeScreens(element.screens);
 send('screens',{screens:ownerScreens});
 if(ownerScreens.some(screen=>screen.id===element.screen))host.screenChanged(element.screen);
}
window.addEventListener('contextmenu',event=>{event.preventDefault();send('contextmenu');});
for(const [name,value] of Object.entries(${inlineJson(theme)}))document.documentElement.style.setProperty(name,value);
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!==channel)return;
 if(event.data.type==='show-screen'){
  if(ownerScreens.some(screen=>screen.id===event.data.screen))window.dispatchEvent(new CustomEvent('plugin-show-screen',{detail:{pluginId:${inlineJson(pluginId)},screen:event.data.screen}}));
  return;
 }
 if(event.data.type!=='result')return;
 const request=pending.get(event.data.requestId);if(!request)return;
 pending.delete(event.data.requestId);clearTimeout(request.timer);
 if(event.data.error)request.reject(new Error(event.data.error));else request.resolve(event.data.result);
});
const host=Object.freeze({pluginId:${inlineJson(pluginId)},operations:Object.freeze(${inlineJson(operations)}),screenChanged(screen){if(ownerScreens.some(item=>item.id===screen))send('screen-changed',{screen});},run(subcommand,args=[],options={}){return new Promise((resolve,reject)=>{
 const requestId=String(++sequence);
 const declared=${inlineJson(commandTimeouts)}[subcommand];
 const timeout=Number.isInteger(declared)&&declared>=1&&declared<=600000?declared:30000;
 const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Operation timed out'));},timeout+5000);
 pending.set(requestId,{resolve,reject,timer});send('run',{requestId,subcommand,args,...(options.stdin!==undefined?{stdin:options.stdin}:{})});
});}});
try{
 const url=URL.createObjectURL(new Blob([${inlineJson(source)}],{type:'text/javascript'}));
 try{await import(url);}finally{URL.revokeObjectURL(url);}
 const tag=${inlineJson(tag)};
 if(!customElements.get(tag))throw new Error('The plugin did not register its declared interface');
 const element=document.createElement(tag);element.host=host;document.body.append(element);
 publishScreens(element);
 if(typeof element.load==='function'&&!element.hasAttribute('data-loaded')){try{element.load();}catch(_){}}
 if('view' in element||tag==='domains-console'||tag==='stripe-panel'){
  host.run('view').then(v=>{element.view=v;}).catch(()=>{
   host.run('status').then(s=>{element.view=s;}).catch(()=>{});
  });
 }
 element.addEventListener('refresh',()=>{
  host.run('view').then(v=>{element.view=v;}).catch(()=>{
   host.run('status').then(s=>{element.view=s;}).catch(()=>{});
  });
 });
 element.addEventListener('select-domain',e=>{
  if(e.detail?.domain)host.run('view',['--domain',e.detail.domain]).then(v=>{element.view=v;}).catch(()=>{});
 });
 element.addEventListener('search',e=>{
  const names=(e.detail?.names||[]).join(',');
  if(names)host.run('view',['--search',names]).then(v=>{element.view=v;}).catch(()=>{});
 });
 element.addEventListener('set-record',e=>{
  const d=e.detail||{};
  const args=['--domain',d.domain,'--name',d.name,'--type',d.type,'--value',d.value,'--yes'];
  if(d.ttl)args.push('--ttl',String(d.ttl));
  if(d.mxPriority)args.push('--priority',String(d.mxPriority));
  host.run('set',args).then(()=>host.run('view',['--domain',d.domain])).then(v=>{element.view=v;}).catch(()=>{});
 });
 element.addEventListener('delete-record',e=>{
  const d=e.detail||{};
  host.run('record-rm',['--domain',d.domain,'--id',d.recordId,'--yes']).then(()=>host.run('view',['--domain',d.domain])).then(v=>{element.view=v;}).catch(()=>{});
 });
 new ResizeObserver(()=>send('height',{height:document.body.scrollHeight})).observe(document.body);
 send('ready');
}catch{send('error',{message:'Could not open the plugin interface'});}
</script></body></html>`
}

export function pluginCommandTimeouts(manifest: Record<string, unknown> | undefined): Record<string, number> {
  const cli = manifest?.cli as { subcommands?: Array<{ name: string; timeout_ms?: number }> } | undefined
  return Object.fromEntries((cli?.subcommands || []).filter(command => Number.isInteger(command.timeout_ms) && command.timeout_ms! >= 1 && command.timeout_ms! <= 600000).map(command => [command.name, command.timeout_ms!]))
}

export function allowedFrameCommand(value: unknown, allowed: Set<string>, secretCommands: Set<string> = new Set()): value is { requestId: string; subcommand: string; args: string[]; stdin?: string } {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return typeof request.requestId === 'string' && request.requestId.length <= 64 &&
    typeof request.subcommand === 'string' && allowed.has(request.subcommand) &&
    (request.stdin === undefined || (secretCommands.has(request.subcommand) && typeof request.stdin === 'string' && request.stdin.length > 0 && new TextEncoder().encode(request.stdin).length <= 65536)) &&
    Array.isArray(request.args) && request.args.length <= 64 &&
    request.args.every(arg => typeof arg === 'string' && arg.length <= 8192) &&
    request.args.reduce((sum, arg) => sum + arg.length, 0) <= 32768
}
