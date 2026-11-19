/** The website history protocol is independent of message rendering. */
export const HISTORY_PATH='/api/v0/chat/history_messages';
export const HISTORY_CHANNEL='suedama.history.v1';
export const MAX_HISTORY_BYTES=24_000_000;
export type HistoryMessage={id:string;parentId:string|null;role:'USER'|'ASSISTANT';question:string;answer:string;reasoning:string;status:string;files:{name:string;bytes:number;type:string}[]};
export type HistoryGraph={conversationId:string;title:string;messages:HistoryMessage[];currentMessageId:string|null;version:string|number;resetAt:string|number|null;updatedAt:number;observedAt:number;fresh:boolean};
export type HistoryPacket={data:unknown;conversationId:string;version:string|number|null;resetAt:string|number|null;startedAt:number};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const validConversationId=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{1,128}$/.test(v);
const scalar=(v:unknown):v is string|number=>typeof v==='string'&&v.length<256||typeof v==='number'&&Number.isFinite(v);
const messageId=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?String(v):typeof v==='string'&&/^[1-9]\d{0,14}$/.test(v)&&Number.isSafeInteger(Number(v))?v:undefined;
function messages(raw:unknown):HistoryMessage[]{
  if(!Array.isArray(raw)||raw.length>20000)throw new Error('历史消息数量或格式不受支持。');
  let bytes=0;const ids=new Set<string>();
  return raw.map(item=>{
    if(!object(item))throw new Error('历史消息格式无效。');
    const id=messageId(item.message_id),parentId=item.parent_id===null?null:messageId(item.parent_id);
    if(!id||parentId===undefined||ids.has(id)||!['USER','ASSISTANT'].includes(String(item.role))||!Array.isArray(item.fragments)||item.fragments.length>10000||typeof item.status!=='string')throw new Error('历史消息身份或关系无效。');
    ids.add(id);const parts={question:[] as string[],answer:[] as string[],reasoning:[] as string[]},files:HistoryMessage['files']=[];
    for(const part of item.fragments){
      if(!object(part)||typeof part.type!=='string')throw new Error('历史正文片段无效。');
      if(!['REQUEST','RESPONSE','TEMPLATE_RESPONSE','THINK','FILE','SEARCH','TOOL_SEARCH','TOOL_OPEN','TOOL_FIND','TIP','READ_LINK'].includes(part.type))throw new Error('历史正文片段类型不受支持。');
      if(part.type==='FILE'){
        if(!Array.isArray(part.files)||part.files.length>100)throw new Error('历史附件格式无效。');
        for(const file of part.files){if(!object(file)||typeof file.file_name!=='string'||file.file_name.length>1000||typeof file.file_size!=='number'||!Number.isFinite(file.file_size)||file.file_size<0)throw new Error('历史附件格式无效。');files.push({name:file.file_name,bytes:file.file_size,type:'application/octet-stream'});}
      }
      const target=part.type==='REQUEST'?'question':part.type==='RESPONSE'||part.type==='TEMPLATE_RESPONSE'?'answer':part.type==='THINK'?'reasoning':undefined;
      if(target){if(typeof part.content!=='string')throw new Error('历史正文片段无效。');bytes+=part.content.length*2;if(bytes>MAX_HISTORY_BYTES)throw new Error('历史正文过大。');parts[target].push(part.content);}
      // Tool/search/file metadata is deliberately not concatenated into the answer.
    }
    return {id,parentId,role:item.role as HistoryMessage['role'],status:item.status,question:parts.question.join(''),answer:parts.answer.join(''),reasoning:parts.reasoning.join(''),files};
  });
}
export function validateGraph(graph:HistoryGraph):HistoryGraph{
  const byId=new Map(graph.messages.map(m=>[m.id,m]));const visited=new Set<string>();
  for(const message of graph.messages){
    const path=new Set<string>();let node:HistoryMessage|undefined=message;
    while(node&&!visited.has(node.id)){
      if(path.has(node.id))throw new Error('历史分支包含循环。');path.add(node.id);
      if(node.parentId===null){if(node.role!=='USER')throw new Error('历史根消息无效。');break;}
      const parent=byId.get(node.parentId);if(!parent||parent.role===node.role)throw new Error('历史分支缺少父节点。');node=parent;
    }
    for(const id of path)visited.add(id);
  }
  if(graph.currentMessageId!==null&&!byId.has(graph.currentMessageId))throw new Error('历史当前路径不完整。');
  return graph;
}
/** MERGE is meaningful only with exactly the baseline used by the request. */
export function applyHistoryPacket(packet:HistoryPacket,baseline?:HistoryGraph):HistoryGraph{
  const envelope=packet.data;
  if(!object(envelope)||envelope.code!==0||!object(envelope.data)||envelope.data.biz_code!==0||!object(envelope.data.biz_data))throw new Error('官网历史读取失败。');
  return historyData(envelope.data.biz_data,packet,baseline,true);
}
function historyData(data:Record<string,unknown>,packet:HistoryPacket,baseline:HistoryGraph|undefined,fresh:boolean):HistoryGraph{
  const session=data.chat_session;
  if(!object(session)||session.id!==packet.conversationId||!validConversationId(session.id)||typeof session.title!=='string'||session.title.length>10000||!scalar(session.version)||typeof session.updated_at!=='number'||!Number.isFinite(session.updated_at))throw new Error('历史会话格式不受支持。');
  const incoming=messages(data.chat_messages);let merged=incoming;
  if(data.cache_control==='MERGE'){
    if(!baseline||baseline.conversationId!==packet.conversationId||packet.version===null||packet.resetAt===null||String(packet.version)!==String(baseline.version)||String(packet.resetAt)!==String(baseline.resetAt))throw new Error('历史增量缺少匹配的基线。');
    const byId=new Map(baseline.messages.map(m=>[m.id,m]));for(const m of incoming)byId.set(m.id,m);merged=[...byId.values()];
  }else if(data.cache_control!=='REPLACE')throw new Error('历史缓存协议不受支持。');
  if(merged.length>20000)throw new Error('历史消息过多。');
  if(merged.reduce((n,m)=>n+2*(m.question.length+m.answer.length+m.reasoning.length),0)>MAX_HISTORY_BYTES)throw new Error('历史正文过大。');
  const resetAt=data.cache_control==='REPLACE'?(scalar(data.cache_reset_at)?data.cache_reset_at:null):baseline!.resetAt;
  if(resetAt===null)throw new Error('历史缓存缺少校验标记。');
  const current=session.current_message_id===null||session.current_message_id===undefined?null:messageId(session.current_message_id);
  if(current===undefined)throw new Error('历史当前消息无效。');
  return validateGraph({conversationId:session.id,title:session.title,messages:merged.sort((a,b)=>Number(a.id)-Number(b.id)),version:session.version,resetAt,currentMessageId:current??merged.at(-1)?.id??null,updatedAt:session.updated_at*1000,observedAt:packet.startedAt,fresh});
}
export function cachedHistory(value:unknown,id:string):HistoryGraph|undefined{
  try{
    if(!object(value)||value.key!==id||typeof value.timestamp!=='number'||!Number.isFinite(value.timestamp)||!object(value.data)||!scalar(value.version)||!scalar(value.cacheResetAt)||value.frontendVersion!=='fv-0')return;
    const graph=historyData({...value.data,cache_control:'REPLACE',cache_reset_at:value.cacheResetAt},{conversationId:id,data:null,version:null,resetAt:null,startedAt:value.timestamp},undefined,false);
    return graph.version===value.version?graph:undefined;
  }catch{return;}
}

/** Never upgrade, create, or write the website's database. */
export async function readHistoryCache(id:string,factory:IDBFactory|undefined,signal?:AbortSignal):Promise<HistoryGraph|undefined>{
  if(!factory||!validConversationId(id)||signal?.aborted)return;
  return new Promise(resolve=>{
    let db:IDBDatabase|undefined,done=false;
    const finish=(value?:HistoryGraph)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);db?.close();resolve(value);};
    const abort=()=>finish();const timer=setTimeout(abort,700);signal?.addEventListener('abort',abort,{once:true});
    void (async()=>{
      try{
        if(typeof factory.databases!=='function'||!(await factory.databases()).some(d=>d.name==='deepseek-chat')||done)return finish();
        const open=factory.open('deepseek-chat');
        open.onupgradeneeded=()=>{open.transaction?.abort();finish();};
        open.onerror=()=>finish();open.onblocked=()=>finish();
        open.onsuccess=()=>{
          db=open.result;db.onversionchange=()=>finish();if(done){db.close();return;}
          if(!db.objectStoreNames.contains('history-message'))return finish();
          try{const tx=db.transaction('history-message','readonly'),request=tx.objectStore('history-message').get(id);request.onerror=()=>finish();request.onsuccess=()=>finish(cachedHistory(request.result,id));}catch{finish();}
        };
      }catch{finish();}
    })();
  });
}
