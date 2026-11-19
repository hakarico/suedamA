import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {installNativeNavigationBridge,NativeNavigationClient,NATIVE_NAV_CHANNEL,type NativeLocation} from '../src/native-navigation';

const cid='native-locator';
type Message={id:number;renderKey:number;parentId:number|null;role:'USER'|'ASSISTANT';childIds:number[];currentChildIndex:number;isEditing:boolean;status:string};
function fixture(long=0){
  const win=new Window({url:'https://chat.deepseek.com/a/chat/s/'+cid}),posted:Record<string,unknown>[]=[],emitted:{method:string;args:{id:number;renderKey:number}}[]=[],writes:string[]=[],loaded:number[]=[];
  const script=win.document.createElement('script');script.src='https://fe-static.deepseek.com/chat/static/main.d1d163b7e4.js';win.document.head.append(script);win.document.body.innerHTML='<textarea></textarea><main class="ds-virtual-list ds-scroll-area"></main>';
  const parents=long?Array.from({length:long*2},(_,i)=>[i+1,i===0?null:i] as const):[[1,null],[2,1],[3,2],[4,3],[5,2],[6,5],[7,5],[8,7],[9,8],[10,null],[11,10]] as const;
  const messages:Record<number,Message>={};for(const [id,parentId]of parents)messages[id]={id,parentId,renderKey:id===8?-80:id,role:parentId===null?'USER':messages[parentId]!.role==='USER'?'ASSISTANT':'USER',childIds:[],currentChildIndex:0,isEditing:false,status:'OK'};
  for(const m of Object.values(messages))if(m.parentId!==null)messages[m.parentId]!.childIds.push(m.id);
  const session={rootBranchIds:Object.values(messages).filter(m=>m.parentId===null).map(m=>m.id),rootBranchIndex:long?0:1,messageStore:messages};
  const state={getSession:(id:string)=>id===cid?session:undefined,getMessage:(id:string,m:number)=>id===cid?messages[m]:undefined,
    updateSession:(id:string,fn:(s:typeof session)=>void)=>{assert.equal(id,cid);writes.push('root');fn(session);},
    updateMessage:(id:string,m:number,fn:(message:Message)=>void)=>{assert.equal(id,cid);writes.push(String(m));fn(messages[m]!);}};
  const bus={subscribe:()=>{},next:(event:typeof emitted[number])=>{
    emitted.push(event);const user=messages[event.args.id]!;assert.equal(event.args.renderKey,user.renderKey);
    const answer=user.childIds[user.currentChildIndex],main=win.document.querySelector('main')!;main.replaceChildren();
    for(const id of [user.id,answer].filter((id):id is number=>id!==undefined)){const m=messages[id]!,shell=win.document.createElement('div');shell.setAttribute('data-virtual-list-item-key',String(m.renderKey));shell.innerHTML='<div class="ds-message">本地模拟正文</div>';main.append(shell);}
  }};
  const modules:Record<number,()=>unknown>={67808:()=>({L:{getState:()=>state}}),73412:()=>({j:bus})};
  const require=Object.assign((id:number)=>{loaded.push(id);return modules[id]?.();},{m:modules});
  const chunks:unknown[]=[];chunks.push=((entry:unknown[])=>{(entry[2] as (loader:typeof require)=>void)(require);return 1;}) as typeof chunks.push;
  Object.assign(win,{rspackChunk_deepseek_chat:chunks});
  win.postMessage=((message:Record<string,unknown>)=>{posted.push(structuredClone(message));queueMicrotask(()=>win.dispatchEvent(new win.MessageEvent('message',{data:message,origin:win.location.origin,source:win})));}) as typeof win.postMessage;
  const bridge=installNativeNavigationBridge(win as unknown as globalThis.Window),client=new NativeNavigationClient(win as unknown as globalThis.Window);
  const target:NativeLocation=long?{conversationId:cid,messageId:String(long*2),userId:String(long*2-1),path:parents.map(p=>String(p[0]))}:{conversationId:cid,messageId:'9',userId:'8',path:['1','2','5','7','8','9']};
  return {win,script,posted,loaded,messages,modules,session,state,emitted,writes,client,target,dispose:async()=>{client.dispose();bridge();await win.happyDOM.abort();}};
}

test('native IDs select root edits, user edits and regenerated answers before directly mounting an unrendered target',async()=>{
  const f=fixture();try{
    assert.equal(f.win.document.querySelector('.ds-message'),null);const result=await f.client.reveal(f.target);assert.ok(result);
    assert.equal(f.session.rootBranchIndex,0);assert.equal(f.messages[2]!.currentChildIndex,1);assert.equal(f.messages[5]!.currentChildIndex,1);
    assert.deepEqual(result.identities.map(m=>m.id),f.target.path);assert.equal(result.identities.find(m=>m.id==='8')?.renderKey,'-80');
    assert.equal(f.emitted.length,1);assert.equal(f.emitted[0]!.args.id,8);assert.equal(Object.keys(f.messages).length,11);
    assert.equal(JSON.stringify(f.posted).includes('本地模拟正文'),false,'only identities cross the bridge');
  }finally{await f.dispose();}
});

test('a long native route mounts just the target turn without walking through intermediate turns',async()=>{
  const f=fixture(1500);try{const result=await f.client.reveal(f.target);assert.equal(result?.identities.length,3000);assert.equal(f.emitted.length,1);assert.equal(f.win.document.querySelectorAll('.ds-message').length,2);assert.equal(f.writes.length,0);}finally{await f.dispose();}
});

test('missing ancestors, wrong saved paths, editing and cyclic histories fail before selecting any branch',async()=>{
  for(const failure of ['missing','wrong-path','editing','cycle','wrong-user','busy'] as const){const f=fixture();try{
    if(failure==='missing')delete f.messages[7];if(failure==='wrong-path')f.target.path=['1','2','3','4','8','9'];if(failure==='editing')f.messages[8]!.isEditing=true;if(failure==='cycle')f.messages[1]!.parentId=9;if(failure==='wrong-user')f.target.userId='5';if(failure==='busy')f.messages[11]!.status='WIP';
    assert.equal(await f.client.reveal(f.target),undefined);assert.equal(f.writes.length,0);assert.equal(f.emitted.length,0);
  }finally{await f.dispose();}}
});

test('unknown website builds and incompatible native module contracts fall back without branch changes',async()=>{
  for(const failure of ['build','store','bus'] as const){const f=fixture();try{
    if(failure==='build')f.script.src='https://fe-static.deepseek.com/chat/static/main.changed.js';if(failure==='store')f.modules[67808]=()=>({L:{getState:()=>({})}});if(failure==='bus')f.modules[73412]=()=>({j:{next:()=>{}}});
    assert.equal(await f.client.reveal(f.target),undefined);assert.equal(f.writes.length,0);assert.equal(f.emitted.length,0);if(failure==='build')assert.equal(f.loaded.length,0);
  }finally{await f.dispose();}}
});

test('cancellation and a newer selected turn prevent late native positioning from restoring the old target',async()=>{
  const f=fixture();try{
    const first=f.client.reveal(f.target);await Promise.resolve();f.client.cancel();assert.equal(await first,undefined);await new Promise<void>(resolve=>f.win.requestAnimationFrame(()=>resolve()));assert.equal(f.emitted.length,0);
    const old=f.client.reveal(f.target),latest=f.client.reveal({conversationId:cid,messageId:'4',userId:'3',path:['1','2','3','4']});assert.equal(await old,undefined);assert.ok(await latest);assert.ok(f.emitted.every(event=>event.args.id===3));assert.equal(f.messages[2]!.currentChildIndex,0);
  }finally{await f.dispose();}
});

test('leaving the native session while it prepares aborts positioning in the new session',async()=>{
  const f=fixture();try{const navigation=f.client.reveal(f.target);await Promise.resolve();f.win.history.replaceState(null,'','/a/chat/s/other');assert.equal(await navigation,undefined);assert.equal(f.emitted.length,0);}finally{await f.dispose();}
});

test('cross-origin messages and malformed or unrelated targets cannot trigger native navigation',async()=>{
  const f=fixture();try{
    const data={channel:NATIVE_NAV_CHANNEL,from:'extension',kind:'reveal',id:'foreign',target:f.target};f.win.dispatchEvent(new f.win.MessageEvent('message',{data,origin:'https://foreign.example',source:f.win}));
    f.win.postMessage({...data,id:'invalid',target:{...f.target,messageId:'-8'}});assert.equal(await f.client.reveal({...f.target,conversationId:'different-session'}),undefined);
    await Promise.resolve();assert.equal(f.loaded.length,0);assert.equal(f.writes.length,0);
  }finally{await f.dispose();}
});
