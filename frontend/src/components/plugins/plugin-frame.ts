const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

/** Owner code runs in an opaque origin, with no dashboard DOM/storage or direct network. */
export function pluginFrameDocument(source: string, tag: string, channel: string, theme: Record<string, string> = {}, pluginId = '') {
  return `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${channel}' blob:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<style>html,body{margin:0;background:transparent;color:var(--text-primary);font-family:var(--font-sans,system-ui)}*{box-sizing:border-box}</style>
</head><body><script nonce="${channel}" type="module">
const channel=${inlineJson(channel)};
const pending=new Map();let sequence=0;
const send=(type,extra={})=>parent.postMessage({channel,type,...extra},'*');
for(const [name,value] of Object.entries(${inlineJson(theme)}))document.documentElement.style.setProperty(name,value);
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!==channel||event.data?.type!=='result')return;
 const request=pending.get(event.data.requestId);if(!request)return;
 pending.delete(event.data.requestId);clearTimeout(request.timer);
 if(event.data.error)request.reject(new Error(event.data.error));else request.resolve(event.data.result);
});
const host=Object.freeze({pluginId:${inlineJson(pluginId)},run(subcommand,args=[]){return new Promise((resolve,reject)=>{
 const requestId=String(++sequence);
 const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Operation timed out'));},35000);
 pending.set(requestId,{resolve,reject,timer});send('run',{requestId,subcommand,args});
});}});
try{
 const url=URL.createObjectURL(new Blob([${inlineJson(source)}],{type:'text/javascript'}));
 try{await import(url);}finally{URL.revokeObjectURL(url);}
 const tag=${inlineJson(tag)};
 if(!customElements.get(tag))throw new Error('The plugin did not register its declared interface');
 const element=document.createElement(tag);element.host=host;document.body.append(element);
 new ResizeObserver(()=>send('height',{height:document.body.scrollHeight})).observe(document.body);
 send('ready');
}catch{send('error',{message:'Could not open the plugin interface'});}
</script></body></html>`
}

export function allowedFrameCommand(value: unknown, allowed: Set<string>): value is { requestId: string; subcommand: string; args: string[] } {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return typeof request.requestId === 'string' && request.requestId.length <= 64 &&
    typeof request.subcommand === 'string' && allowed.has(request.subcommand) &&
    Array.isArray(request.args) && request.args.length <= 64 &&
    request.args.every(arg => typeof arg === 'string' && arg.length <= 8192) &&
    request.args.reduce((sum, arg) => sum + arg.length, 0) <= 32768
}
