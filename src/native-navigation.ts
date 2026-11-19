/** A version-checked adapter to the website's own branch selection and virtual-list navigation. */
export const NATIVE_NAV_CHANNEL='suedama.native-navigation.v1';
const MAX_PATH=20000;
const messageId=(value:unknown):value is string=>typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
const sessionId=(value:unknown):value is string=>typeof value==='string'&&/^[\w-]{1,100}$/.test(value);
const currentSession=(win:Window)=>win.location.pathname.match(/\/chat\/s\/([\w-]+)/)?.[1];
export type NativeLocation={conversationId:string;messageId:string;userId?:string;path:string[]};
export type NativeIdentity={id:string;renderKey:string;parentId:string|null;role:'USER'|'ASSISTANT'};
export type NativeLocationResult={conversationId:string;identities:NativeIdentity[]};
export interface NativeLocator{reveal(target:NativeLocation):Promise<NativeLocationResult|undefined>;cancel():void;dispose():void;}
function validTarget(value:unknown):value is NativeLocation{
  if(!value||typeof value!=='object')return false;const t=value as NativeLocation;
  return sessionId(t.conversationId)&&messageId(t.messageId)&&(t.userId===undefined||messageId(t.userId))&&Array.isArray(t.path)&&t.path.length<=MAX_PATH&&t.path.every(messageId);
}
function validResult(value:unknown,target:NativeLocation):value is NativeLocationResult{
  if(!value||typeof value!=='object')return false;const r=value as NativeLocationResult;
  return r.conversationId===target.conversationId&&Array.isArray(r.identities)&&r.identities.length>0&&r.identities.length<=MAX_PATH&&r.identities.every((m,i)=>m&&messageId(m.id)&&/^-?\d{1,16}$/.test(m.renderKey)&&(i?m.parentId===r.identities[i-1]!.id&&m.role!==r.identities[i-1]!.role:m.parentId===null&&m.role==='USER')&&['USER','ASSISTANT'].includes(m.role))&&new Set(r.identities.map(m=>m.id)).size===r.identities.length&&new Set(r.identities.map(m=>m.renderKey)).size===r.identities.length&&r.identities.at(-1)?.id===target.messageId;
}
export class NativeNavigationClient implements NativeLocator{
  private pending=new Map<string,{target:NativeLocation;finish:(result?:NativeLocationResult)=>void}>();private ready=false;private disposed=false;
  constructor(private win:Window){win.addEventListener('message',this.message);this.post({kind:'hello'});}
  private post(data:Record<string,unknown>){this.win.postMessage({channel:NATIVE_NAV_CHANNEL,from:'extension',...data},this.win.location.origin);}
  private message=(event:MessageEvent)=>{
    const d=event.data;if(event.source!==this.win||event.origin!==this.win.location.origin||!d||d.channel!==NATIVE_NAV_CHANNEL||d.from!=='page')return;
    if(d.kind==='ready')this.ready=true;
    if(d.kind==='result'&&typeof d.id==='string'){const job=this.pending.get(d.id);if(job)job.finish(currentSession(this.win)===job.target.conversationId&&validResult(d.result,job.target)?d.result:undefined);}
  };
  reveal(target:NativeLocation):Promise<NativeLocationResult|undefined>{
    if(this.disposed||!validTarget(target)||currentSession(this.win)!==target.conversationId)return Promise.resolve(undefined);
    this.cancel();const id=crypto.randomUUID();
    return new Promise(resolve=>{const timer=setTimeout(()=>{this.post({kind:'cancel',id});finish();},this.ready?1700:180);
      const finish=(result?:NativeLocationResult)=>{if(!this.pending.delete(id))return;clearTimeout(timer);resolve(result);};
      this.pending.set(id,{target,finish});this.post({kind:'reveal',id,target});});
  }
  cancel(){for(const [id,job]of this.pending){this.post({kind:'cancel',id});job.finish();}}
  dispose(){this.cancel();this.disposed=true;this.win.removeEventListener('message',this.message);}
}

type NativeMessage={id:number;renderKey:number;parentId:number|null;role:'USER'|'ASSISTANT';childIds:number[];currentChildIndex:number;isEditing?:boolean;status?:string};
type NativeSession={rootBranchIds:number[];rootBranchIndex:number;messageStore:Record<string,NativeMessage>};
type NativeState={getSession:(id:string)=>NativeSession|undefined;getMessage:(cid:string,id:number)=>NativeMessage|undefined;updateSession:(cid:string,fn:(session:NativeSession)=>void)=>void;updateMessage:(cid:string,id:number,fn:(message:NativeMessage)=>void)=>void};
type NativeRuntime={state:()=>NativeState;emit:(event:{method:string;args:{id:number;renderKey:number}})=>void};
type Require=((id:number)=>unknown)&{m:Record<string,unknown>};
/** Only the inspected build is supported. Changed module IDs/builds return unavailable, never guess. */
function websiteRuntime(win:Window):NativeRuntime|undefined{
  const known=[...win.document.scripts].some(script=>{try{const u=new URL(script.src);return u.origin==='https://fe-static.deepseek.com'&&u.pathname==='/chat/static/main.d1d163b7e4.js';}catch{return false;}});
  if(!known)return;
  const chunks=(win as unknown as {rspackChunk_deepseek_chat?:unknown[]}).rspackChunk_deepseek_chat;
  if(!Array.isArray(chunks)||chunks.push===Array.prototype.push)return;
  let require:Require|undefined;chunks.push([['suedama-navigation-'+crypto.randomUUID()],{},(loader:Require)=>{require=loader;}]);
  if(!require||typeof require.m?.[67808]!=='function'||typeof require.m?.[73412]!=='function')return;
  const store=(require(67808) as {L?:{getState?:()=>NativeState}})?.L,bus=(require(73412) as {j?:{next?:NativeRuntime['emit'];subscribe?:unknown}})?.j;
  if(typeof store?.getState!=='function'||typeof bus?.next!=='function'||typeof bus.subscribe!=='function')return;
  const state=store.getState();if(!['getSession','getMessage','updateSession','updateMessage'].every(key=>typeof state[key as keyof NativeState]==='function'))return;
  return {state:()=>store.getState!(),emit:event=>bus.next!(event)};
}
function plan(runtime:NativeRuntime,target:NativeLocation){
  const state=runtime.state(),session=state.getSession(target.conversationId);if(!session||!Array.isArray(session.rootBranchIds))return;
  if(Object.values(session.messageStore??{}).some(m=>m?.status==='WIP'||m?.isEditing))return;
  const messages:NativeMessage[]=[],seen=new Set<number>();let node=state.getMessage(target.conversationId,Number(target.messageId));
  while(node){
    if(messages.length>=MAX_PATH||seen.has(node.id)||!messageId(String(node.id))||!Number.isSafeInteger(node.renderKey)||!['USER','ASSISTANT'].includes(node.role)||node.isEditing||node.status==='WIP'||!Array.isArray(node.childIds))return;
    messages.push(node);seen.add(node.id);if(node.parentId===null)break;
    const parent=state.getMessage(target.conversationId,node.parentId);if(!parent||parent.role===node.role||!parent.childIds.includes(node.id))return;node=parent;
  }
  messages.reverse();const root=messages[0],leaf=messages.at(-1);if(!root||root.parentId!==null||root.role!=='USER'||String(leaf?.id)!==target.messageId)return;
  const rootIndex=session.rootBranchIds.indexOf(root.id);if(rootIndex<0)return;
  const user=leaf!.role==='USER'?leaf:messages.at(-2);if(!user||user.role!=='USER'||target.userId!==undefined&&String(user.id)!==target.userId)return;
  const indices=new Map(messages.map((m,i)=>[String(m.id),i]));let previous=-1;for(const id of target.path){const index=indices.get(id);if(index===undefined||index<=previous)return;previous=index;}
  return {messages,user,rootIndex};
}
export function installNativeNavigationBridge(win:Window):()=>void{
  if(win.location.origin!=='https://chat.deepseek.com')return()=>{};
  let active=true,runtime:NativeRuntime|undefined,job:{id:string;cancelled:boolean}|undefined;
  const post=(data:Record<string,unknown>)=>{if(active)win.postMessage({channel:NATIVE_NAV_CHANNEL,from:'page',...data},win.location.origin);};
  const frame=()=>new Promise<void>(resolve=>{const timer=setTimeout(resolve,80);win.requestAnimationFrame(()=>{clearTimeout(timer);resolve();});});
  const run=async(id:string,target:NativeLocation)=>{
    if(job)job.cancelled=true;const own={id,cancelled:false};job=own;
    const live=()=>active&&!own.cancelled&&job===own&&currentSession(win)===target.conversationId&&win.document.querySelectorAll('textarea').length===1;
    let result:NativeLocationResult|undefined;try{
      if(!live())return;runtime??=websiteRuntime(win);if(!runtime)return;
      const p=plan(runtime,target);if(!p)return;
      // Match the native search-result flow: validate the whole ancestry before changing view indices.
      const edges=p.messages.slice(0,-1).map((m,i)=>({id:m.id,childId:p.messages[i+1]!.id,index:m.childIds.indexOf(p.messages[i+1]!.id),before:m.currentChildIndex}));
      if(runtime.state().getSession(target.conversationId)!.rootBranchIndex!==p.rootIndex||edges.some(e=>e.before!==e.index))runtime.state().updateSession(target.conversationId,s=>{
        for(const edge of edges)s.messageStore[edge.id]!.currentChildIndex=edge.index;s.rootBranchIndex=p.rootIndex;
      });
      await frame();if(!live())return;
      const selected=()=>{const state=runtime!.state(),session=state.getSession(target.conversationId);return session?.rootBranchIndex===p.rootIndex&&edges.every(e=>{const m=state.getMessage(target.conversationId,e.id);return m?.childIds[m.currentChildIndex]===e.childId;});};
      for(let tries=0;tries<6;tries++){
        // A newer native selection must never be overwritten by a late positioning request.
        if(!selected())return;
        runtime.emit({method:'scrollNavActivateMessage',args:{id:p.user.id,renderKey:p.user.renderKey}});await frame();if(!live()||!selected())return;
        const shells=[...win.document.querySelectorAll('[data-virtual-list-item-key]')],mounted=(m:NativeMessage)=>shells.some(el=>el.getAttribute('data-virtual-list-item-key')===String(m.renderKey)&&!!el.querySelector('.ds-message'));
        if(mounted(p.user)&&mounted(p.messages.at(-1)!)){
          result={conversationId:target.conversationId,identities:p.messages.map(m=>({id:String(m.id),renderKey:String(m.renderKey),parentId:m.parentId===null?null:String(m.parentId),role:m.role}))};return;
        }
      }
    }catch{/* Website contracts may change. The caller retains DOM navigation as a fallback. */}
    finally{if(job===own)job=undefined;post({kind:'result',id,result});}
  };
  const listener=(event:MessageEvent)=>{
    const d=event.data;if(event.source!==win||event.origin!==win.location.origin||!d||d.channel!==NATIVE_NAV_CHANNEL||d.from!=='extension')return;
    if(d.kind==='hello'){post({kind:'ready'});return;}
    if(typeof d.id!=='string'||d.id.length>100)return;
    if(d.kind==='cancel'){if(job&&job.id===d.id)job.cancelled=true;return;}
    if(d.kind==='reveal'&&validTarget(d.target))void run(d.id,d.target);
  };
  win.addEventListener('message',listener);return()=>{active=false;if(job)job.cancelled=true;win.removeEventListener('message',listener);};
}
