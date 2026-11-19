import {HISTORY_CHANNEL,HISTORY_PATH,MAX_HISTORY_BYTES,validConversationId,type HistoryPacket} from './history-data';
const headerNames=['authorization','x-client-bundle-id','x-client-platform','x-client-version','x-client-locale','x-client-timezone-offset','x-device-id','x-device-model'];
/** Runs in MAIN. Credentials stay in this closure; only history JSON crosses the bridge. */
export function installHistoryBridge(win:Window & typeof globalThis):()=>void{
  if(win.location.origin!=='https://chat.deepseek.com')return()=>{};
  const original=win.fetch,proto=win.XMLHttpRequest?.prototype,open=proto?.open,send=proto?.send,setHeader=proto?.setRequestHeader;
  let active=true,connected=false,headers:Record<string,string>|undefined;
  const buffered:HistoryPacket[]=[],controllers=new Set<AbortController>();
  const post=(data:Record<string,unknown>)=>{if(active)win.postMessage({channel:HISTORY_CHANNEL,from:'page',...data},win.location.origin);};
  const meta=(input:string|URL|Request,init?:RequestInit)=>{
    try{
      const request=typeof input==='object'&&'url'in input?input:undefined,url=new URL(request?request.url:String(input),win.location.href),method=init?.method??request?.method??'GET';
      if(url.origin!==win.location.origin||url.pathname!==HISTORY_PATH||method.toUpperCase()!=='GET'||!validConversationId(url.searchParams.get('chat_session_id')))return;
      const numberOrText=(name:string)=>{const value=url.searchParams.get(name);return value===null||value==='null'||value===''?null:/^-?\d+(?:\.\d+)?$/.test(value)?Number(value):value;};
      return{conversationId:url.searchParams.get('chat_session_id')!,version:numberOrText('cache_version'),resetAt:numberOrText('cache_reset_at'),startedAt:Date.now(),requestHeaders:init?.headers??request?.headers};
    }catch{return;}
  };
  const remember=(value:HeadersInit|undefined)=>{try{const source=new win.Headers(value);if(source.has('authorization'))headers=Object.fromEntries(headerNames.flatMap(name=>source.has(name)?[[name,source.get(name)!]]:[]));}catch{/* Never affect the website request. */}};
  const emit=(packet:HistoryPacket)=>{if(connected)post({kind:'packet',packet});else{buffered.push(packet);if(buffered.length>2)buffered.shift();}};
  async function json(response:Response){
    if(!response.ok||Number(response.headers.get('content-length'))>MAX_HISTORY_BYTES)throw new Error('unavailable');
    const reader=response.body?.getReader();if(!reader)throw new Error('unavailable');
    const decoder=new TextDecoder();let text='',bytes=0;
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>MAX_HISTORY_BYTES)throw new Error('large');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();return JSON.parse(text) as unknown;}
    catch(error){void reader.cancel().catch(()=>{});throw error;}
    finally{reader.releaseLock();}
  }
  const wrapped:typeof fetch=function(this:unknown,input,init){
    const info=meta(input,init);if(info)remember(info.requestHeaders);
    const response=Reflect.apply(original,this,[input,init]) as Promise<Response>;
    if(info)void response.then(value=>{if(value.status===401||value.status===403)headers=undefined;return json(value.clone()).then(data=>emit({conversationId:info.conversationId,version:info.version,resetAt:info.resetAt,startedAt:info.startedAt,data}));}).catch(()=>{});
    return response;
  };
  win.fetch=wrapped;
  const requests=new WeakMap<XMLHttpRequest,{info:NonNullable<ReturnType<typeof meta>>;headers:Record<string,string>}>();
  if(proto&&open&&send&&setHeader){
    proto.open=function(this:XMLHttpRequest,method:string,url:string|URL,...rest:unknown[]){const info=meta(String(url),{method});requests.delete(this);if(info)requests.set(this,{info,headers:{}});return Reflect.apply(open,this,[method,url,...rest]);} as typeof open;
    proto.setRequestHeader=function(this:XMLHttpRequest,name:string,value:string){const state=requests.get(this);if(state&&headerNames.includes(name.toLowerCase()))state.headers[name.toLowerCase()]=value;return setHeader.call(this,name,value);};
    proto.send=function(this:XMLHttpRequest,body?:Document|XMLHttpRequestBodyInit|null){const state=requests.get(this);if(state){remember(state.headers);this.addEventListener('load',()=>{try{if(this.status<200||this.status>=300)return;const text=this.responseType===''||this.responseType==='text'?this.responseText:undefined;if(text!==undefined&&text.length*2>MAX_HISTORY_BYTES)return;const data=this.responseType==='json'?this.response:JSON.parse(text??'null');if(data)emit({conversationId:state.info.conversationId,version:state.info.version,resetAt:state.info.resetAt,startedAt:state.info.startedAt,data});}catch{/* Unknown responses are ignored. */}},{once:true});}return send.call(this,body);};
  }
  const listener=(event:MessageEvent)=>{
    if(event.source!==win||event.origin!==win.location.origin)return;const data=event.data;
    if(!data||data.channel!==HISTORY_CHANNEL||data.from!=='extension')return;
    if(data.kind==='hello'){connected=true;post({kind:'ready'});for(const packet of buffered.splice(0))post({kind:'packet',packet});return;}
    if(data.kind==='cancel'&&typeof data.id==='string'){jobs.get(data.id)?.abort();return;}
    if(data.kind!=='get'||typeof data.id!=='string'||data.id.length>100||!validConversationId(data.conversationId))return;
    if(!headers||!original||controllers.size>=2){post({kind:'result',id:data.id,error:'unavailable'});return;}
    const scalar=(v:unknown)=>v===null||typeof v==='string'&&v.length<256||typeof v==='number'&&Number.isFinite(v);
    if(!scalar(data.version)||!scalar(data.resetAt))return;
    const url=new URL(HISTORY_PATH,win.location.origin);url.searchParams.set('chat_session_id',data.conversationId);
    if(data.version!==null&&data.resetAt!==null){url.searchParams.set('cache_version',String(data.version));url.searchParams.set('cache_reset_at',String(data.resetAt));}
    const controller=new AbortController(),startedAt=Date.now();controllers.add(controller);jobs.set(data.id,controller);const timeout=setTimeout(()=>controller.abort(),8000);
    void original.call(win,url.href,{method:'GET',headers:{...headers},credentials:'same-origin',signal:controller.signal}).then(async response=>{
      if(response.status===401||response.status===403)headers=undefined;
      const packet:HistoryPacket={data:await json(response),conversationId:data.conversationId,version:data.version,resetAt:data.resetAt,startedAt};post({kind:'result',id:data.id,packet});
    }).catch(()=>post({kind:'result',id:data.id,error:'unavailable'})).finally(()=>{clearTimeout(timeout);controllers.delete(controller);jobs.delete(data.id);});
  };
  const jobs=new Map<string,AbortController>();win.addEventListener('message',listener);
  return()=>{active=false;headers=undefined;buffered.length=0;controllers.forEach(c=>c.abort());win.removeEventListener('message',listener);if(win.fetch===wrapped)win.fetch=original;if(proto&&open&&send&&setHeader){proto.open=open;proto.send=send;proto.setRequestHeader=setHeader;}};
}
