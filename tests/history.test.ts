import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {applyHistoryPacket,cachedHistory,readHistoryCache,HISTORY_PATH,HISTORY_CHANNEL,type HistoryPacket} from '../src/history-data';
import {historyTurns,mergeHistoryGraph} from '../src/history-merge';
import {installHistoryBridge} from '../src/history-bridge';
import {HistoryClient} from '../src/history-client';
import {emptyLibrary,mergeSnapshot,validateLibrary,makeQuote,sameStep} from '../src/model';
import {packLibrary,unpackLibrary} from '../src/storage-codec';

// Protocol-shaped synthetic data, not a captured user response.
const cid='history-sample';
const user=(id:number,parent:number|null,text='相同的问题')=>({message_id:id,parent_id:parent,role:'USER',status:'FINISHED',fragments:[{type:'REQUEST',content:text}]});
const answer=(id:number,parent:number,text='回答')=>({message_id:id,parent_id:parent,role:'ASSISTANT',status:'FINISHED',fragments:[{type:'RESPONSE',content:text}]});
function packet(messages=[user(1,null),answer(2,1),user(3,2),answer(4,3),user(5,2),answer(6,5),answer(7,5),user(8,7),answer(9,8),user(10,null),answer(11,10)],control='REPLACE',version=1):HistoryPacket{
  return {conversationId:cid,version:null,resetAt:null,startedAt:Date.now()+10,data:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:cid,title:'分支历史',updated_at:123,version,current_message_id:messages.at(-1)?.message_id??null},cache_control:control,cache_reset_at:42,chat_messages:messages}}}};
}
const data=(p:HistoryPacket)=>(p.data as {data:{biz_data:Record<string,unknown>}}).data.biz_data;
const pause=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(fn:()=>boolean){for(let n=0;n<100;n++){if(fn())return;await pause();}assert.fail('expected asynchronous history result');}

test('history graph imports root edits, user edits, answer variants and deeper descendants exactly once',()=>{
  const graph=applyHistoryPacket(packet()),turns=historyTurns(graph);
  assert.equal(turns.length,6);assert.equal(new Set(turns.map(t=>t.turn.answerKey)).size,6);
  const variant=turns.find(t=>t.turn.answerKey==='7')!;assert.equal(variant.turn.userVersion,2);assert.equal(variant.turn.answerVersion,2);
  assert.equal(variant.parentId,cid+':answer:2');assert.equal(turns.find(t=>t.turn.answerKey==='9')!.parentId,cid+':answer:7');
  assert.equal(turns.find(t=>t.turn.answerKey==='11')!.turn.userVersion,2);
  const library=mergeHistoryGraph(emptyLibrary(),graph);assert.equal(Object.keys(library.cards).length,6);validateLibrary(library);
  assert.equal(mergeHistoryGraph(library,graph),library);assert.equal(library.conversations[cid]!.updatedAt,123000);
});
test('delta updates replace matching IDs and empty delta retains the complete graph',()=>{
  const baseline=applyHistoryPacket(packet()),change=packet([answer(9,8,'更新后的回答')],'MERGE',2);
  data(change).chat_session={id:cid,title:'分支历史',updated_at:124,version:2,current_message_id:9};change.version=1;change.resetAt=42;
  const updated=applyHistoryPacket(change,baseline);assert.equal(updated.messages.length,11);assert.equal(updated.messages.find(m=>m.id==='9')!.answer,'更新后的回答');
  const empty=packet([],'MERGE',3);empty.version=2;empty.resetAt=42;data(empty).chat_session={id:cid,title:'分支历史',updated_at:124,version:3,current_message_id:9};
  assert.equal(applyHistoryPacket(empty,updated).messages.length,11);
  assert.throws(()=>applyHistoryPacket(change),/基线/);assert.throws(()=>applyHistoryPacket({...change,resetAt:43},baseline),/基线/);
});
test('invalid tree, duplicate IDs, wrong account/session, unknown controls and fragments fail closed',()=>{
  for(const p of [packet([user(1,2),answer(2,1)]),packet([user(1,null),answer(2,999)]),packet([user(1,null),user(1,null)]),packet([answer(1,2)]),packet(undefined,'UNKNOWN')])assert.throws(()=>applyHistoryPacket(p));
  assert.throws(()=>applyHistoryPacket({...packet(),conversationId:'other'}),/会话/);
  const wrong=packet();(wrong.data as {code:number}).code=40003;assert.throws(()=>applyHistoryPacket(wrong));
  const unknown=packet([user(1,null)]);(data(unknown).chat_messages as {fragments:unknown[]}[])[0]!.fragments=[{type:'FUTURE_TEXT',content:'不可丢失'}];assert.throws(()=>applyHistoryPacket(unknown),/不受支持/);
});
test('fragments retain markdown and reasoning separately, with files but without duplicated tool results',()=>{
  const u=user(1,null,'带附件的问题'),a=answer(2,1,'**正文**\n\n```ts\nx()\n```');
  (u.fragments as unknown[]).push({type:'FILE',files:[{file_name:'notes.txt',file_size:12}]});
  (a.fragments as unknown[]).push({type:'THINK',content:'分析过程'},{type:'TOOL_SEARCH',results:[{snippet:'不要拼入正文'}]});
  const library=mergeHistoryGraph(emptyLibrary(),applyHistoryPacket(packet([u,a]))),card=library.cards[cid+':answer:2']!;
  assert.equal(card.answer,a.fragments[0]!.content);assert.equal(card.reasoning,'分析过程');assert.equal(card.attachments?.[0]?.name,'notes.txt');assert.ok(!card.answer.includes('不要拼入正文'));
});
test('graph updates retain layout, notes, archived state and immutable reference snapshots across backup',()=>{
  const graph=applyHistoryPacket(packet());let library=mergeHistoryGraph(emptyLibrary(),graph),card=library.cards[cid+':answer:2']!;
  card.position={x:900,y:800};card.archived=true;card.annotations=[makeQuote(card,'assistant','回答')];library.drafts[card.id]={text:'保留草稿',quotes:card.annotations,mode:'continue'};library.selectedId=card.id;library.lockedId=card.id;
  const replacement=packet([user(1,null),answer(2,1,'新回答')]);replacement.startedAt=graph.observedAt+10;
  library=mergeHistoryGraph(library,applyHistoryPacket(replacement));card=library.cards[card.id]!;
  assert.deepEqual(card.position,{x:900,y:800});assert.equal(card.annotations[0]!.sourceText,'回答');assert.equal(card.answer,'新回答');assert.equal(card.archived,true);assert.equal(library.drafts[card.id]!.text,'保留草稿');
  assert.equal(Object.keys(library.cards).length,6,'REPLACE does not delete local branches');
  assert.deepEqual(validateLibrary(unpackLibrary(packLibrary(library))),library);
});
test('pending identity promotion remaps descendants, draft, selection and quote source atomically',()=>{
  let library=mergeSnapshot(emptyLibrary(),{conversationId:cid,title:'临时',busy:false,turns:[{userKey:'-document.2',question:'相同的问题',answer:'',userVersion:1,answerVersion:1}]});
  const old=Object.values(library.cards)[0]!;old.position={x:100,y:222};library.selectedId=old.id;library.lockedId=old.id;
  library.drafts[old.id]={text:'草稿',quotes:[],mode:'continue'};
  library=mergeHistoryGraph(library,applyHistoryPacket(packet([user(1,null),answer(2,1)])));
  const id=cid+':answer:2';assert.equal(Object.keys(library.cards).length,1);assert.equal(library.selectedId,id);assert.equal(library.lockedId,id);assert.equal(library.drafts[id]?.text,'草稿');assert.equal(library.cardAliases?.[old.id],id);assert.deepEqual(library.cards[id]!.position,{x:100,y:222});validateLibrary(library);
});
test('stale website cache adds missing branches without rolling back newer captured text',()=>{
  let library=mergeHistoryGraph(emptyLibrary(),applyHistoryPacket(packet([user(1,null),answer(2,1,'新正文')])));library.cards[cid+':answer:2']!.updatedAt=Date.now()+10000;
  const stale=applyHistoryPacket(packet());stale.observedAt=1;stale.fresh=false;
  library=mergeHistoryGraph(library,stale);assert.equal(library.cards[cid+':answer:2']!.answer,'新正文');assert.equal(Object.keys(library.cards).length,6);validateLibrary(library);
});
test('unanswered terminal user remains distinguishable from invented empty answers',()=>{
  const graph=applyHistoryPacket(packet([user(1,null)])),library=mergeHistoryGraph(emptyLibrary(),graph);
  assert.ok(library.cards[cid+':user:1']);assert.equal(library.cards[cid+':user:1']!.route[0]!.answerKey,undefined);validateLibrary(library);
});
test('formal identity tolerates rendered markdown differences and survives cold DOM capture',()=>{
  const graph=applyHistoryPacket(packet([user(1,null),answer(2,1,'1. 列表\n\n正文')]));
  let library=mergeHistoryGraph(emptyLibrary(),graph);const target=library.cards[cid+':answer:2']!.route[0]!;
  assert.equal(sameStep({userKey:'1',answerKey:'2',userVersion:1,answerVersion:1,question:'相同的问题',answer:'1.  列表\n\n正文'} as never,target),true);
  assert.equal(sameStep({userKey:'3',answerKey:'2',userVersion:1,answerVersion:1},target),false);
  library=mergeSnapshot(library,{conversationId:cid,title:'分支历史',busy:false,turns:[{userKey:'-new-document.2',answerKey:'2',userVersion:1,answerVersion:1,question:'相同的问题',answer:'1.  列表\n\n正文'}]});
  assert.equal(library.cards[cid+':answer:2']!.route[0]!.userKey,'1');validateLibrary(library);
});
test('website cache requires a matching session, format version and reset marker',()=>{
  const p=packet(),value={data:data(p),key:cid,version:1,cacheResetAt:42,timestamp:Date.now(),frontendVersion:'fv-0'};
  assert.equal(cachedHistory(value,cid)?.messages.length,11);assert.equal(cachedHistory(value,'other'),undefined);
  assert.equal(cachedHistory({...value,frontendVersion:'fv-99'},cid),undefined);assert.equal(cachedHistory({...value,cacheResetAt:null},cid),undefined);
});
test('cache reader does not create absent databases and aborts an open/upgrade race',async()=>{
  let opens=0,aborts=0;
  const missing={databases:async()=>[],open:()=>{opens++;}} as unknown as IDBFactory;
  assert.equal(await readHistoryCache(cid,missing),undefined);assert.equal(opens,0);
  const racing={databases:async()=>[{name:'deepseek-chat'}],open:()=>{opens++;const request={transaction:{abort:()=>aborts++},onupgradeneeded:null as null|(()=>void)};queueMicrotask(()=>request.onupgradeneeded?.());return request;}} as unknown as IDBFactory;
  assert.equal(await readHistoryCache(cid,racing),undefined);assert.equal(aborts,1);
});
test('cache reader only reads the requested record and closes its connection',async()=>{
  let closes=0;const p=packet(),value={data:data(p),key:cid,version:1,cacheResetAt:42,timestamp:Date.now(),frontendVersion:'fv-0'};
  const db={close:()=>closes++,objectStoreNames:{contains:(name:string)=>name==='history-message'},transaction:(name:string,mode:string)=>{assert.equal(name,'history-message');assert.equal(mode,'readonly');return{objectStore:()=>({get:(key:string)=>{assert.equal(key,cid);const request={result:value,onsuccess:null as null|(()=>void)};queueMicrotask(()=>request.onsuccess?.());return request;}})};}};
  const factory={databases:async()=>[{name:'deepseek-chat'}],open:()=>{const request={result:db,onsuccess:null as null|(()=>void)};queueMicrotask(()=>request.onsuccess?.());return request;}} as unknown as IDBFactory;
  assert.equal((await readHistoryCache(cid,factory))?.messages.length,11);assert.equal(closes,1);
});

function bridgeFixture(useXHR=false){
  const win=new Window({url:'https://chat.deepseek.com/a/chat/s/'+cid}),posted:Record<string,unknown>[]=[],calls:{url:string;init?:RequestInit}[]=[];
  Object.defineProperty(win,'Headers',{value:Headers,configurable:true});
  if(useXHR){class HistoryXHR extends win.EventTarget{status=200;responseType='';responseText=JSON.stringify(packet().data);open(){}setRequestHeader(){}send(){this.dispatchEvent(new win.Event('load'));}}Object.defineProperty(win,'XMLHttpRequest',{configurable:true,value:HistoryXHR});}
  win.postMessage=((message:Record<string,unknown>)=>{posted.push(structuredClone(message));queueMicrotask(()=>win.dispatchEvent(new win.MessageEvent('message',{data:message,origin:win.location.origin,source:win})));}) as typeof win.postMessage;
  win.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:typeof input==='object'&&'url'in input?input.url:String(input),init});return new Response(JSON.stringify(packet().data),{status:200,headers:{'content-type':'application/json'}});}) as unknown as typeof win.fetch;
  const dispose=installHistoryBridge(win as unknown as globalThis.Window & typeof globalThis),client=new HistoryClient(win as unknown as globalThis.Window,async()=>undefined);
  return{win,posted,calls,client,dispose:()=>{client.dispose();dispose();win.happyDOM.abort();}};
}
test('MAIN bridge preserves native response bodies, scopes active requests and never posts auth headers',async()=>{
  const f=bridgeFixture();try{
    const response=await f.win.fetch(HISTORY_PATH+'?chat_session_id='+cid,{headers:{Authorization:'Bearer synthetic-test-identity','x-client-version':'test-version','x-unrelated-secret':'not-forwarded'}});
    assert.equal((await response.json() as unknown as {code:number}).code,0);await until(()=>!!f.client.peek(cid));
    assert.equal(f.client.peek(cid)?.messages.length,11);assert.ok(f.posted.some(m=>m.kind==='packet'));
    assert.equal(JSON.stringify(f.posted).includes('synthetic-test-identity'),false);assert.equal(JSON.stringify(f.posted).includes('not-forwarded'),false);
    const graph=await f.client.get(cid,true);assert.equal(graph?.messages.length,11);assert.equal(f.calls.length,2);
    const request=f.calls[1]!;assert.equal(new URL(request.url).pathname,HISTORY_PATH);assert.equal(new URL(request.url).origin,'https://chat.deepseek.com');assert.equal(request.init?.method,'GET');
    assert.equal((request.init?.headers as Record<string,string>).authorization,'Bearer synthetic-test-identity');assert.equal((request.init?.headers as Record<string,string>)['x-unrelated-secret'],undefined);
    assert.equal(JSON.stringify(f.posted).includes('synthetic-test-identity'),false);
    f.client.invalidate(cid);assert.ok(await f.client.get(cid));assert.equal(f.calls.length,3,'a generation invalidates the short freshness shortcut');
  }finally{f.dispose();}
});
test('late responses cannot roll back a newer graph',async()=>{
  const f=bridgeFixture();try{
    await f.win.fetch(HISTORY_PATH+'?chat_session_id='+cid,{headers:{Authorization:'Bearer synthetic'}});await until(()=>!!f.client.peek(cid));
    const current=f.client.peek(cid)!;const stale=packet([user(1,null),answer(2,1,'过时内容')]);stale.startedAt=current.observedAt-100;
    f.win.postMessage({channel:HISTORY_CHANNEL,from:'page',kind:'packet',packet:stale});await pause();assert.equal(f.client.peek(cid),current);
  }finally{f.dispose();}
});
test('native prefetches do not import unrelated account conversations',async()=>{
  const f=bridgeFixture();try{
    const p=packet();p.conversationId='unrequested-prefetch';(data(p).chat_session as {id:string}).id=p.conversationId;
    f.win.postMessage({channel:HISTORY_CHANNEL,from:'page',kind:'packet',packet:p});await pause();assert.equal(f.client.peek(p.conversationId),undefined);
  }finally{f.dispose();}
});
test('unrelated requests and forged cross-origin messages cannot start a history fetch',async()=>{
  const f=bridgeFixture();try{
    await f.win.fetch('/unrelated',{headers:{Authorization:'Bearer not-history'}});assert.equal(await f.client.get(cid,true),undefined);
    const before=f.calls.length;
    f.win.dispatchEvent(new f.win.MessageEvent('message',{data:{channel:HISTORY_CHANNEL,from:'extension',kind:'get',id:'foreign',conversationId:cid,version:null,resetAt:null},source:f.win,origin:'https://other.example'}));
    f.win.postMessage({channel:HISTORY_CHANNEL,from:'extension',kind:'get',id:'bad',conversationId:'../other',version:null,resetAt:null});await pause();assert.equal(f.calls.length,before);
  }finally{f.dispose();}
});
test('XHR history transport provides the same graph without exposing its authorization',async()=>{
  const f=bridgeFixture(true);try{
    const xhr=new f.win.XMLHttpRequest();xhr.open('GET',HISTORY_PATH+'?chat_session_id='+cid);xhr.setRequestHeader('Authorization','Bearer xhr-synthetic-identity');xhr.send();await until(()=>!!f.client.peek(cid));
    assert.equal(f.client.peek(cid)?.messages.length,11);assert.equal(JSON.parse(xhr.responseText).code,0);assert.equal(JSON.stringify(f.posted).includes('xhr-synthetic-identity'),false);
    assert.ok(await f.client.get(cid,true));assert.equal((f.calls[0]!.init?.headers as Record<string,string>).authorization,'Bearer xhr-synthetic-identity');
  }finally{f.dispose();}
});
test('cancelled loads do not accept late responses and client disposal removes subscriptions',async()=>{
  const win=new Window({url:'https://chat.deepseek.com/'});let release!:(value:undefined)=>void;
  const client=new HistoryClient(win as unknown as globalThis.Window,()=>new Promise(resolve=>{release=resolve;})),controller=new AbortController();let updates=0;client.subscribe(()=>updates++);
  const load=client.get(cid,false,controller.signal);controller.abort();release(undefined);assert.equal(await load,undefined);assert.equal(updates,0);client.dispose();await win.happyDOM.abort();
});
