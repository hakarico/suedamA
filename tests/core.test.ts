import {createElement,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {archiveMessageStates,installNativeReadonly} from '../src/native-readonly';
import {packLibrary,unpackLibrary} from '../src/storage-codec';
import {ArchivePanel,archiveGroups} from '../src/ArchivePanel';
import {NativeConversation} from '../src/NativeConversation';
import {SettingsPanel,PromptSettings} from '../src/SettingsPanel';
import {AnnotationChip} from '../src/AnnotationChip';
import {localeFromLanguage,translate} from '../src/i18n';
import {nativeParts,nativeSelection,selectedParts} from '../src/native-selection';
import {installNativeReference,nativeReferenceBlocks} from '../src/native-reference';
import {parsePrompt,DEFAULT_PREAMBLE,nativeRootTurn,LEGACY_PREAMBLE,PREVIOUS_PREAMBLE,openingGuidance,effectivePrompt,promptSendMode} from '../src/prompt';
import {NativeBoardList} from '../src/NativeBoardList';
import {folderForItem,sidebarSort,sortedItems,sortedFolders,sidebarEdgeSpeed,recentItems} from '../src/sidebar';
import {installSidebarDrag} from '../src/sidebar-drag';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {DeepSeekAdapter,PageNavigation} from '../src/adapter';
import {emptyLibrary,mergeSnapshot,makeQuote,turnQuotes,composePrompt,validateLibrary,turnId,historyLine,sameStep,type Snapshot} from '../src/model';
import {isArchived,archivedCards,recolorLine,previewLayout,archiveLeaf} from '../src/topology';
import {isChromeMutation} from '../src/dom-observers';
import {cardChain} from './performance-data';
import {CanvasGestures,lassoSelection} from '../src/canvas-gestures';
import {projectSelection,projectText,referenceRange} from '../src/selection';
import {belongsToBoard,boardAppearance} from '../src/boards';
import {cardViewport,scrollbarLane} from '../src/card-geometry';
import {CanvasStore} from '../src/store';
import {LibraryStorage,mergeLocalChanges} from '../src/storage';
import {readMarkdown} from '../src/markdown';
import {marked} from 'marked';
import formatSample from './native-format.json';
import {installFixture,cid} from './fixture';
const win=new Window({url:`http://127.0.0.1:3097/a/chat/s/${cid}`});
for(const name of ['window','document','Node','Element','HTMLElement','HTMLTextAreaElement','HTMLInputElement','KeyboardEvent','DataTransfer','FileReader','MutationObserver','Event','localStorage']) Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?win:(win as unknown as Record<string,unknown>)[name]});
for(const name of ['innerWidth','innerHeight','requestAnimationFrame','cancelAnimationFrame'] as const){const value=win[name];Object.defineProperty(globalThis,name,{configurable:true,value:typeof value==='function'?value.bind(win):value});}
Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:win.getComputedStyle.bind(win)});Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:win.matchMedia.bind(win)});
function fixture(){document.body.replaceChildren();const page=installFixture(document);const adapter=new DeepSeekAdapter(document,()=>win.location.href,()=>{throw new PageNavigation('会话导航将在重新加载后继续。');});return {page,adapter};}
const snap=(answer='原始回答'):Snapshot=>({conversationId:'sample',title:'测试',busy:false,turns:[{userKey:'1',answerKey:'2',question:'第一问',answer,userVersion:1,answerVersion:1}]});
test('official edit versions remain separate nodes and retain the common ancestor',async()=>{
  const {page,adapter}=fixture();
  let library=mergeSnapshot(emptyLibrary(),adapter.read());
  const oldIds=library.conversations[cid]!.activeIds;
  const target=library.cards[oldIds[1]!]!;
  page.setBranch(2);library=mergeSnapshot(library,adapter.read());
  assert.equal(Object.keys(library.cards).length,4);
  const newIds=library.conversations[cid]!.activeIds;
  assert.equal(newIds[0],oldIds[0]);assert.notEqual(newIds[1],oldIds[1]);
  assert.equal(library.cards[newIds[1]!]!.parentId,oldIds[0]);
  await adapter.locate(cid,target.route);
  assert.equal(page.getBranch(),1);
  assert.equal(adapter.read().turns[2]!.userKey,'5');
});
test('new questions after a historical card edit the next native user turn exactly once',async()=>{
  const {page,adapter}=fixture();
  const library=mergeSnapshot(emptyLibrary(),adapter.read());
  const target=Object.values(library.cards)[0]!;
  await adapter.send(cid,target.route,'从第一轮分叉\n\n保留换行','continue',()=>{});
  assert.equal(page.versions.length,3);assert.equal(page.getBranch(),3);
  const turns=adapter.read().turns;
  assert.equal(turns.length,2);assert.equal(turns[1]!.question,'从第一轮分叉\n\n保留换行');
  page.setBranch(1);assert.equal(adapter.read().turns.length,3);
});
test('continuing a leaf appends without creating an edit variant',async()=>{
  const {page,adapter}=fixture();
  const library=mergeSnapshot(emptyLibrary(),adapter.read());
  const target=Object.values(library.cards).at(-1)!;
  await adapter.send(cid,target.route,'再问一个问题','continue',()=>{});
  assert.equal(page.versions.length,2);assert.equal(adapter.read().turns.length,4);
});
test('editing the selected turn preserves the old question and answer',async()=>{
  const {page,adapter}=fixture();const library=mergeSnapshot(emptyLibrary(),adapter.read());
  const card=Object.values(library.cards)[1]!;
  await adapter.send(cid,card.route,'修改后的提问','edit',()=>{});
  assert.equal(page.getBranch(),3);assert.equal(adapter.read().turns[1]!.question,'修改后的提问');
  page.setBranch(1);assert.equal(adapter.read().turns[1]!.question,card.question);
});
test('a branch mismatch or an existing native draft never sends',async()=>{
  const {page,adapter}=fixture();const library=mergeSnapshot(emptyLibrary(),adapter.read());const card=Object.values(library.cards)[0]!;
  await assert.rejects(adapter.send('another-chat',card.route,'不得发送','continue',()=>{}),/会话导航/);
  document.querySelector('textarea')!.value='原生草稿';
  await assert.rejects(adapter.send(cid,card.route,'不得覆盖','continue',()=>{}),/还有草稿/);
  assert.equal(page.versions.length,2);assert.equal(document.querySelector('textarea')!.value,'原生草稿');
});
test('streaming updates preserve card identity, annotation, layout and selection',()=>{
  const pending=snap();delete pending.turns[0]!.answerKey;pending.turns[0]!.answer='';
  let library=mergeSnapshot(emptyLibrary(),pending);const id=Object.keys(library.cards)[0]!;
  library.cards[id]!.position={x:333,y:777};library.cards[id]!.bookmarked=true;library.selectedId=id;
  library=mergeSnapshot(library,snap('第一段'));
  const next=Object.keys(library.cards)[0]!;
  assert.equal(library.selectedId,next);assert.equal(Object.keys(library.cards).length,1);assert.equal(library.cards[next]!.position.x,333);assert.ok(library.cards[next]!.bookmarked);
  const updated=mergeSnapshot(library,snap('第一段\n\n第二段'));
  assert.equal(updated.cards[next]!.answer,'第一段\n\n第二段');assert.equal(mergeSnapshot(updated,snap('第一段\n\n第二段')),updated);
});
test('annotations preserve repeated text offsets and blank lines without markdown mismatch',()=>{
  const library=mergeSnapshot(emptyLibrary(),snap('**原文**'));const card=Object.values(library.cards)[0]!;
  const source='原文\n\n代码\n\n\n原文';const selected='代码\n\n\n原文';const start=source.indexOf('代码');
  const quote=makeQuote(card,'assistant',selected,start,source);
  assert.equal(quote.start,start);assert.equal(quote.text,selected);
  assert.ok(composePrompt({text:'解释一下',quotes:[quote],mode:'continue'}).includes(selected));
  assert.throws(()=>makeQuote(card,'assistant','伪造内容'),/不一致/);
});
test('backup import rejects cycles, invalid viewports and malformed annotation offsets',()=>{
  const library=mergeSnapshot(emptyLibrary(),snap());assert.equal(validateLibrary(JSON.parse(JSON.stringify(library))).schema,1);
  const id=Object.keys(library.cards)[0]!;
  assert.throws(()=>validateLibrary({...library,cards:{[id]:{...library.cards[id],parentId:id}}}),/历史连接/);
  assert.throws(()=>validateLibrary({...library,viewport:{x:0,y:0,zoom:NaN}}),/视口/);
  assert.throws(()=>validateLibrary({...library,cards:{[id]:{...library.cards[id],annotations:[{id:'x',sourceId:id,role:'assistant',text:'abc',sourceText:'xyz',start:0,end:3}]}}}),/引用无效/);
});
test('queued local writes cannot replace a newer draft with an older one',async()=>{
  localStorage.clear();const storage=new LibraryStorage();const a=emptyLibrary(),b=emptyLibrary();a.revision=1;b.revision=2;
  await Promise.all([storage.save(a),storage.save(b)]);assert.equal((await storage.load()).revision,2);
});
test('store immediately creates pending cards, binds annotations and clears only accepted drafts',async()=>{
  localStorage.clear();const {adapter}=fixture();const store=new CanvasStore(adapter);await store.start();
  const id=store.get().library.selectedId!;const card=store.get().library.cards[id]!;
  store.setDraft({text:'解释这份引用',quotes:[makeQuote(card,'assistant',card.answer)]});
  let overlap=false;const unsubscribe=store.subscribe(()=>{const s=store.get(),p=s.pending;if(p&&Object.values(s.library.cards).some(c=>!p.before.has(c.id)&&c.question===p.wire.trim()))overlap=true;});
  const send=store.send();assert.ok(store.get().pending);await send;unsubscribe();assert.equal(overlap,false,'pending replacement must publish atomically');
  assert.equal(store.get().pending,undefined);
  const received=store.get().library.cards[store.get().library.selectedId!]!;
  assert.equal(received.annotations.length,1);assert.equal(store.get().library.drafts[id],undefined);
  await store.flush();validateLibrary(store.get().library);store.dispose();
});
test('failed pending cards retain input and can be archived or removed',async()=>{
  localStorage.clear();const {adapter}=fixture();const store=new CanvasStore(adapter);await store.start();store.setDraft({text:'保留这个草稿'});
  document.querySelector('textarea')!.value='已有网页草稿';await store.send();
  assert.match(store.get().pending!.error!,/草稿/);assert.equal(store.draft().text,'保留这个草稿');
  store.archivePending();assert.ok(store.get().pending!.archived);store.dismissPending();assert.equal(store.get().pending,undefined);store.dispose();
});
test('temporary negative user keys become permanent without duplicating the answer card',()=>{
  const original=snap();original.turns[0]!.userKey='-2';
  let library=mergeSnapshot(emptyLibrary(),original);const id=Object.keys(library.cards)[0]!;
  library.cards[id]!.bookmarked=true;library.selectedId=id;
  const reloaded=snap();library=mergeSnapshot(library,reloaded);
  assert.equal(Object.keys(library.cards).length,1);assert.ok(library.cards[id]!.bookmarked);assert.equal(library.selectedId,id);validateLibrary(library);
});
test('virtualized suffix links to its known leading answer without inventing a root',()=>{
  let library=mergeSnapshot(emptyLibrary(),snap());const root=Object.keys(library.cards)[0]!;
  library=mergeSnapshot(library,{conversationId:'sample',title:'测试',busy:false,atStart:false,leadingAnswerKey:'2',turns:[{userKey:'-4',answerKey:'4',question:'后续问题',answer:'后续回答',userVersion:1,answerVersion:1}]});
  const child=library.cards['sample:answer:4']!;assert.equal(child.parentId,root);assert.equal(child.route.length,2);assert.ok(child.route[0]!.root);validateLibrary(library);
});
test('quoting an unfinished turn keeps source references valid after answer identity arrives',()=>{
  const pending=snap();delete pending.turns[0]!.answerKey;pending.turns[0]!.answer='';
  let library=mergeSnapshot(emptyLibrary(),pending);const id=Object.keys(library.cards)[0]!;
  library.drafts[id]={text:'解释',mode:'continue',quotes:[makeQuote(library.cards[id]!,'user','第一问')]};
  library=mergeSnapshot(library,snap());const stable=Object.keys(library.cards)[0]!;
  assert.equal(library.drafts[stable]!.quotes[0]!.sourceId,stable);validateLibrary(library);
});
test('separate tabs preserve unrelated cards and field changes during persistence',async()=>{
  localStorage.clear();const storage1=new LibraryStorage();const storage2=new LibraryStorage();
  const base=mergeSnapshot(emptyLibrary(),snap());await storage1.save(base);await storage1.load();await storage2.load();
  const id=Object.keys(base.cards)[0]!;
  const a=structuredClone(base),b=structuredClone(base);a.cards[id]!.bookmarked=true;b.cards[id]!.position={x:1234,y:5678};
  await storage1.save(a);await storage2.save(b);const result=await new LibraryStorage().load();
  assert.ok(result.cards[id]!.bookmarked);assert.equal(result.cards[id]!.position.x,1234);
  const c=mergeSnapshot(base,{...snap(),conversationId:'another'});const merged=mergeLocalChanges(result,base,c);
  assert.ok(merged.cards['another:answer:2']);assert.ok(merged.cards[id]!.bookmarked);
});
test('scanner collects the current route through a virtualized native list and restores scroll',async()=>{
  const {adapter}=fixture();
  const main=document.querySelector('main')!;const rows=[...main.children];main.replaceChildren();
  const scroller=document.createElement('div');scroller.className='ds-virtual-list ds-scroll-area';
  const visible=document.createElement('div');visible.className='ds-virtual-list-visible-items';scroller.append(visible);main.append(scroller);
  Object.defineProperty(scroller,'clientHeight',{value:600});Object.defineProperty(scroller,'scrollHeight',{value:1800});
  scroller.scrollTo=(options?:ScrollToOptions|number)=>{
    scroller.scrollTop=Math.max(0,Math.min(1200,typeof options==='number'?options:options?.top??0));
    const start=Math.floor(scroller.scrollTop/300);visible.style.setProperty('--dsl-virtual-list-transform-y',String(start*300));
    visible.replaceChildren(...rows.slice(start,start+4));
    for(const [index,row]of rows.entries())(row as HTMLElement).getBoundingClientRect=()=>({top:index*300-scroller.scrollTop,left:0,right:480,bottom:(index+1)*300-scroller.scrollTop,width:480,height:300,x:0,y:index*300-scroller.scrollTop,toJSON:()=>({})});
  };
  scroller.scrollTo({top:300});assert.equal(adapter.read().atStart,false);assert.equal(adapter.read().leadingAnswerKey,'2');
  const snapshot=await adapter.scanCurrent();assert.equal(snapshot.turns.length,3);assert.ok(snapshot.atStart);assert.equal(scroller.scrollTop,300);
});
test('native loading spinner is busy even though old edit controls remain enabled',()=>{
  fixture();const adapter=new DeepSeekAdapter(document,()=>`https://chat.deepseek.com/a/chat/s/${cid}`);
  const send=document.querySelector('.ds-button--primary')!;send.classList.add('ds-button--disabled');
  send.innerHTML='<div class="ds-loading"><svg data-icon="spin"></svg></div>';assert.ok(adapter.read().busy);
  send.innerHTML='<svg><path d="M8.3125 0.980206"></path></svg>';assert.equal(adapter.read().busy,false);
});
test('transient assistant keys promote to permanent answers without breaking bookmarks',()=>{
  const transient=snap('部分输出');transient.turns[0]!.userKey='-2';transient.turns[0]!.answerKey='-3';
  let library=mergeSnapshot(emptyLibrary(),transient);const oldId=Object.keys(library.cards)[0]!;library.cards[oldId]!.bookmarked=true;
  const complete=snap('完整回答');complete.turns[0]!.userKey='-2';library=mergeSnapshot(library,complete);
  assert.equal(Object.keys(library.cards).length,1);assert.ok(library.cards['sample:answer:2']!.bookmarked);
});
test('history color belongs to a real segment and does not leak across a fork',()=>{
  const {page,adapter}=fixture();let library=mergeSnapshot(emptyLibrary(),adapter.read());
  const old=library.conversations[cid]!.activeIds;page.setBranch(2);library=mergeSnapshot(library,adapter.read());
  const fork=library.conversations[cid]!.activeIds[1]!;
  assert.equal(historyLine(library.cards[old[0]!]!,library.cards),historyLine(library.cards[old[2]!]!,library.cards));
  assert.notEqual(historyLine(library.cards[fork]!,library.cards),historyLine(library.cards[old[0]!]!,library.cards));
  // Same apparent color must not mean same history ownership.
  library.cards[fork]!.historyColor=library.cards[old[0]!]!.historyColor;
  const recolored=recolorLine(library.cards,old[1]!,6);
  for(const id of old)assert.equal(recolored[id]!.historyColor,6);
  assert.notEqual(recolored[fork]!.historyColor,6);
  const again=mergeSnapshot({...library,cards:recolored},adapter.read());assert.equal(again.cards[old[2]!]!.historyColor,6);
});

test('old prototype backups migrate independent card colors into a single inherited palette',()=>{
  const {adapter}=fixture();const library=mergeSnapshot(emptyLibrary(),adapter.read());
  const cards=Object.values(library.cards);for(const [i,c]of cards.entries()){delete c.lineId;c.color=7;c.historyColor=i;}
  const restored=validateLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(new Set(Object.values(restored.cards).map(c=>c.lineId)).size,1);
  assert.equal(new Set(Object.values(restored.cards).map(c=>c.historyColor)).size,1);
});

test('archive masks hide true descendants; restoring a parent preserves nested archives',()=>{
  const {page,adapter}=fixture();let library=mergeSnapshot(emptyLibrary(),adapter.read());const old=library.conversations[cid]!.activeIds;
  page.setBranch(2);library=mergeSnapshot(library,adapter.read());const fork=library.conversations[cid]!.activeIds[1]!;
  library.cards[old[1]!]!.archived=true;
  assert.ok(isArchived(library.cards[old[2]!]!,library.cards));assert.ok(!isArchived(library.cards[fork]!,library.cards));
  library.cards[old[2]!]!.archived=true;library.cards[old[0]!]!.archived=true;
  library.cards[old[0]!]!.archived=false;library.cards[old[1]!]!.archived=false;
  assert.ok(isArchived(library.cards[old[2]!]!,library.cards));assert.ok(!isArchived(library.cards[old[1]!]!,library.cards));
});

test('global preview is deterministic topology independent of manually moved or resized cards',()=>{
  const {page,adapter}=fixture();let library=mergeSnapshot(emptyLibrary(),adapter.read());page.setBranch(2);library=mergeSnapshot(library,adapter.read());
  const original=previewLayout(Object.values(library.cards));
  for(const card of Object.values(library.cards)){card.position={x:99999,y:-4444};card.width=1800;card.height=2000;}
  const after=previewLayout(Object.values(library.cards).reverse());
  assert.deepEqual([...after].sort(),[...original].sort());
  for(const card of Object.values(library.cards))if(card.parentId)assert.ok(after.get(card.id)!.y>after.get(card.parentId)!.y);
  assert.equal(new Set([...after.values()].map(p=>`${p.x},${p.y}`)).size,Object.keys(library.cards).length);
});

test('browsing a quote source preserves a locked input target and quote numbers never recycle',async()=>{
  localStorage.clear();const {adapter}=fixture();const store=new CanvasStore(adapter);await store.start();
  const cards=Object.values(store.get().library.cards),target=cards[2]!,source=cards[0]!;
  store.lock(target.id);store.select(source.id);
  assert.equal(store.anchorId(),target.id);
  store.quote(makeQuote(source,'assistant',source.answer));assert.equal(store.draft(target.id).quotes[0]!.number,1);
  store.setDraft({quotes:[]});store.quoteMany([makeQuote(source,'user',source.question),makeQuote(source,'assistant',source.answer)]);
  const draft=store.draft(target.id);assert.equal(draft.quotes.length,2);assert.equal(draft.quotes[0]!.number,2);assert.equal(draft.quotes[1]!.number,2);
  assert.ok(composePrompt({...draft,text:'说明'}).includes('<context id="2" type="question and answer">'));
  assert.equal(store.draft(source.id).quotes.length,0);store.dispose();
});

test('visible selections preserve block boundaries and exact offsets in repeated code',()=>{
  const article=document.createElement('article');article.innerHTML='<p>原文</p><p>原文</p><pre>first\nsecond\nthird</pre>';
  const range=document.createRange();range.setStart(article.children[1]!.firstChild!,0);range.setEnd(article.children[2]!.firstChild!,12);
  const selected=projectSelection(article,range)!;
  assert.equal(selected.text,'原文\n\nfirst\nsecond');assert.equal(selected.start,4);
  assert.equal(selected.sourceText.slice(selected.start,selected.start+selected.text.length),selected.text);
});

test('right drag moves cards in canvas coordinates, while short right click remains a menu',()=>{
  const gesture=new CanvasGestures(),positions=new Map([['a',{x:20,y:30}],['b',{x:50,y:80}]]);
  const event={button:2,pointerId:1,clientX:100,clientY:100};
  assert.equal(gesture.start(event,undefined,true,['a'],positions),false,'blank right drag belongs to canvas pan');
  assert.equal(gesture.start({...event,button:0},'a',false,['a'],positions),false,'text left drag must remain native selection');
  gesture.start(event,'a',false,['a','b'],positions);assert.equal(gesture.move({...event,clientX:102},.5),undefined);assert.equal(gesture.finish()!.moved,false);
  gesture.start(event,'a',false,['a','b'],positions);const moved=gesture.move({...event,clientX:120,clientY:130},.5)!;
  assert.deepEqual(moved.get('a'),{x:60,y:90});assert.deepEqual(moved.get('b'),{x:90,y:140});assert.equal(gesture.finish()!.moved,true);
  gesture.start(event,'b',false,['a'],positions);assert.deepEqual([...gesture.move({...event,clientX:120},1)!.keys()],['b']);assert.equal(gesture.finish(true),undefined,'cancel must not commit geometry');
});

test('canvas geometry undo preserves a streaming answer received after the movement',async()=>{
  localStorage.clear();const {adapter}=fixture();const store=new CanvasStore(adapter);await store.start();const id=store.get().library.selectedId!;
  const before={...store.get().library.cards[id]!.position};store.move([{id,position:{x:800,y:900}}]);
  store.get().library.cards[id]!.answer+='\n新到的流式内容';store.replay('undo');
  assert.deepEqual(store.get().library.cards[id]!.position,before);assert.ok(store.get().library.cards[id]!.answer.endsWith('新到的流式内容'));
  store.replay('redo');assert.deepEqual(store.get().library.cards[id]!.position,{x:800,y:900});store.dispose();
});

test('opening an edited branch first does not turn it into the original history line',()=>{
  const {page,adapter}=fixture();page.setBranch(2);
  let library=mergeSnapshot(emptyLibrary(),adapter.read());const alternative=library.conversations[cid]!.activeIds;
  assert.notEqual(historyLine(library.cards[alternative[0]!]!,library.cards),historyLine(library.cards[alternative[1]!]!,library.cards));
  page.setBranch(1);library=mergeSnapshot(library,adapter.read());const original=library.conversations[cid]!.activeIds;
  assert.equal(historyLine(library.cards[original[0]!]!,library.cards),historyLine(library.cards[original[1]!]!,library.cards));
  assert.equal(library.cards[original[0]!]!.historyColor,library.cards[original[2]!]!.historyColor);
  assert.notEqual(library.cards[original[0]!]!.historyColor,library.cards[alternative[1]!]!.historyColor);
});

test('blank clicks clear primary selection; double blank clears secondary selection without restoring it on capture',async()=>{
  localStorage.clear();const {adapter}=fixture();const store=new CanvasStore(adapter);await store.start();const id=store.get().library.selectedId!;
  store.secondarySelect(id);store.clearSelection();assert.equal(store.get().library.selectedId,undefined);assert.equal(store.get().library.lockedId,id);
  store.clearSelection(true);assert.equal(store.anchorId(),undefined);store.setDraft({text:'独立的新问题'});
  adapter.nativeAction('thinking');assert.equal(store.get().library.selectedId,undefined);assert.equal(store.draft().text,'独立的新问题');
  assert.deepEqual(store.get().selectedIds,[]);store.toggleArchives();store.returnToCanvas();assert.equal(store.get().archives,false);assert.equal(store.get().preview,false);store.dispose();
});

test('one board owns multiple isolated native root sessions and can resume any internal session',async()=>{
  localStorage.clear();const {page,adapter}=fixture();const store=new CanvasStore(adapter);await store.start();
  const boardId=store.get().canvasId,old=store.get().library.selectedId!;store.clearSelection(true);store.setDraft({text:'第二条独立根线路：概率学习'});await store.send();
  assert.equal(store.get().pending,undefined);assert.equal(store.get().canvasId,boardId);
  const root=store.get().library.cards[store.get().library.selectedId!]!;assert.equal(root.parentId,null);assert.notEqual(root.conversationId,cid);
  assert.equal(store.get().library.boards![boardId]!.conversationIds.length,2);assert.ok(belongsToBoard(root,store.get().library.boards![boardId]));
  assert.ok(root.historyColor!==store.get().library.cards[old]!.historyColor);
  store.select(old);store.setDraft({text:'回到旧根线路继续'});await store.send();
  const continuation=store.get().library.cards[store.get().library.selectedId!]!;
  assert.equal(continuation.parentId,old);assert.equal(continuation.conversationId,cid);assert.equal(page.current,cid);
  assert.equal(store.get().canvasId,boardId);assert.equal(Object.keys(page.sessions).length,2);await store.flush();validateLibrary(store.get().library);store.dispose();
});

test('a new board exposes one board entry and no inherited native history',async()=>{
  localStorage.clear();const {adapter}=fixture();const store=new CanvasStore(adapter);await store.start();const oldBoard=store.get().canvasId;
  store.newBoard();const id=store.get().canvasId;assert.notEqual(id,oldBoard);assert.deepEqual(store.get().library.boards![id]!.conversationIds,[]);
  assert.equal(store.get().library.selectedId,undefined);assert.equal(store.get().library.lockedId,undefined);
  store.setDraft({text:'新白板根问题'});await store.send();assert.equal(store.get().canvasId,id);
  const c=store.get().library.cards[store.get().library.selectedId!]!;assert.equal(c.parentId,null);assert.ok(belongsToBoard(c,store.get().library.boards![id]));assert.ok(!belongsToBoard(c,store.get().library.boards![oldBoard]));store.dispose();
});

test('navigation before submission resumes once; a reload during submission never auto-sends twice',async()=>{
  localStorage.clear();const {adapter}=fixture();const storage=new LibraryStorage('navigation-resume');
  const first=new CanvasStore({...{read:()=>adapter.read(),observe:(fn:(s:Snapshot)=>void)=>adapter.observe(fn),reveal:(...args:Parameters<typeof adapter.reveal>)=>adapter.reveal(...args),locate:(...args:Parameters<typeof adapter.locate>)=>adapter.locate(...args),send:(...args:Parameters<typeof adapter.send>)=>adapter.send(...args)},newConversation:async()=>{throw new PageNavigation('重载');}},storage);
  await first.start();first.clearSelection(true);first.setDraft({text:'跨页面恢复的新根'});await first.send();assert.equal(first.get().library.resume!.stage,'locate');await first.flush();first.dispose();
  const second=new CanvasStore(adapter,new LibraryStorage('navigation-resume'));await second.start();assert.equal(second.get().pending,undefined);assert.equal(second.get().library.resume,undefined);assert.equal(Object.keys(second.get().library.boards!).length,1);await second.flush();second.dispose();
  const third=new CanvasStore({read:()=>adapter.read(),observe:fn=>adapter.observe(fn),reveal:()=>Promise.resolve(),locate:()=>Promise.resolve(),send:async(_c,_r,_t,_m,stage)=>{await stage('即将发送');throw new PageNavigation('重载');}},new LibraryStorage('submit-resume'));
  await third.start();third.setDraft({text:'提交中重载'});await third.send();assert.equal(third.get().library.resume!.stage,'submitting');await third.flush();third.dispose();
  let sends=0;const fourth=new CanvasStore({read:()=>adapter.read(),observe:fn=>adapter.observe(fn),reveal:()=>Promise.resolve(),locate:()=>Promise.resolve(),send:async()=>{sends++;}},new LibraryStorage('submit-resume'));
  await fourth.start();assert.equal(sends,0);assert.match(fourth.get().pending!.error!,/核对/);assert.equal(fourth.draft(fourth.get().pending!.baseId).text,'提交中重载');fourth.dispose();
});

test('official thinking/search controls share their real native DOM state',()=>{
  const {adapter}=fixture();const before=adapter.read().controls!;assert.deepEqual(before.map(c=>c.id),['thinking','search','attach','send']);
  const selected=before.find(c=>c.id==='thinking')!.active;adapter.nativeAction('thinking');const after=adapter.read().controls!.find(c=>c.id==='thinking')!;
  assert.equal(after.active,!selected);assert.ok(after.svg.includes('<svg'));assert.equal(document.querySelector('.ds-toggle-button')!.getAttribute('aria-pressed'),String(!selected));
});

test('scrollbar priority scales with the viewport, including the wider left hit lane',()=>{
  const scroll={offsetWidth:600,clientWidth:594,scrollHeight:900,clientHeight:400,getBoundingClientRect:()=>({right:500,width:300})};
  assert.equal(scrollbarLane(scroll,494),true);assert.equal(scrollbarLane(scroll,491),false);
  assert.equal(scrollbarLane({...scroll,scrollHeight:300},499),false);
});

test('reference jumps recover exact frozen text offsets without searching a repeated phrase',()=>{
  const article=document.createElement('article');article.innerHTML='<p>重复文字</p><p>重复文字</p><pre>line one\nline two</pre>';
  const range=document.createRange();range.setStart(article.children[1]!.firstChild!,0);range.setEnd(article.children[2]!.firstChild!,8);const frozen=projectSelection(article,range)!;
  const resolved=referenceRange(article,{...frozen,end:frozen.start+frozen.text.length})!;assert.equal(resolved.startContainer,article.children[1]!.firstChild);assert.equal(resolved.startOffset,0);
  article.prepend(document.createTextNode('正文前面有新内容'));assert.equal(referenceRange(article,{...frozen,end:frozen.start+frozen.text.length}),undefined);
});

test('matching native message numbers from another session are rejected when content differs',()=>{
  const library=mergeSnapshot(emptyLibrary(),snap('正确历史'));const expected=Object.values(library.cards)[0]!.route[0]!;
  assert.equal(sameStep(snap('不同历史').turns[0]!,expected),false);assert.equal(sameStep(snap('正确历史').turns[0]!,expected),true);
});

test('reload preserves a cleared selection and its independent root draft',async()=>{
  localStorage.clear();const {adapter}=fixture();const key='cleared-root-reload';
  const first=new CanvasStore(adapter,new LibraryStorage(key));await first.start();first.clearSelection(true);first.setDraft({text:'重载后保留的新根问题'});
  const board=first.get().canvasId;await first.flush();first.dispose();
  const second=new CanvasStore(adapter,new LibraryStorage(key));await second.start();
  assert.equal(second.get().canvasId,board);assert.equal(second.anchorId(),undefined);assert.deepEqual(second.get().selectedIds,[]);
  assert.equal(second.draft().text,'重载后保留的新根问题');await second.flush();second.dispose();
});

test('importing a backup never arms a saved send intent',async()=>{
  localStorage.clear();const {adapter}=fixture();const store=new CanvasStore(adapter);await store.start();
  const library=structuredClone(store.get().library),id=library.selectedId!,card=library.cards[id]!;
  library.resume={id:'pending:import',boardId:store.get().canvasId,baseId:id,conversationId:card.conversationId,wire:'不应发送',question:'不应发送',quotes:[],position:{x:0,y:0},size:{width:500,height:400},stage:'locate',createdAt:Date.now()};
  await store.importBackup(JSON.stringify(library));assert.equal(store.get().library.resume,undefined);assert.equal(store.get().pending,undefined);store.dispose();
});


test('official ordered and nested lists, emphasis, tables, code and math survive DOM collection',async()=>{
  const root=document.createElement('div');root.innerHTML=formatSample.answerHtml;
  const text=readMarkdown(root),roundtrip=document.createElement('div');roundtrip.innerHTML=marked.parse(text,{async:false}) as string;
  assert.equal(roundtrip.querySelectorAll(':scope>ol>li').length,2);assert.equal(roundtrip.querySelectorAll(':scope>ol>li>ul>li').length,4);
  assert.match(text,/\$.*\\frac/);const {renderMessage}=await import('../src/Message');const rendered=document.createElement('div');rendered.innerHTML=renderMessage(text);
  assert.ok(rendered.querySelector('math mfrac'));
  root.innerHTML='<ol start="3"><li><p><strong>标题</strong></p><ul><li>子项一</li><li>子项二</li></ul></li><li>下一项</li></ol><pre><code class="language-ts">const a = 1;\n  a++;</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
  roundtrip.innerHTML=marked.parse(readMarkdown(root),{async:false}) as string;assert.equal(roundtrip.querySelector('ol')?.getAttribute('start'),'3');assert.equal(roundtrip.querySelectorAll('ol>li').length,2);assert.equal(roundtrip.querySelectorAll('table tr').length,2);assert.equal(roundtrip.querySelector('pre code')?.textContent,'const a = 1;\n  a++;\n');
});

test('native thinking is collected separately and remains a selectable reference source',()=>{
  const {adapter}=fixture();const turn=adapter.read().turns[0]!;assert.match(turn.reasoning!,/我们需要回答中文/);assert.ok(!turn.answer.includes('我们需要回答中文'));assert.equal(turn.reasoningLabel,'已思考（用时 2 秒）');
  const library=mergeSnapshot(emptyLibrary(),adapter.read()),card=Object.values(library.cards)[0]!,quote=makeQuote(card,'reasoning','我们需要回答中文');assert.equal(quote.role,'reasoning');validateLibrary({...library,drafts:{[card.id]:{text:'说明',mode:'continue',quotes:[quote]}}});assert.ok(composePrompt({text:'解释',mode:'continue',quotes:[quote]}).includes('type="reasoning"'));
});

test('a native root whose temporary user and answer keys both change keeps one card',()=>{
  const temporary=snap('');temporary.turns[0]!.userKey='-1';delete temporary.turns[0]!.answerKey;
  let library=mergeSnapshot(emptyLibrary(),temporary);const old=Object.keys(library.cards)[0]!;library.cards[old]!.position={x:700,y:120};library.selectedId=old;library.cards[old]!.bookmarked=true;
  library=mergeSnapshot(library,snap('正式回答'));assert.equal(Object.keys(library.cards).length,1);const card=Object.values(library.cards)[0]!;assert.equal(card.position.x,700);assert.equal(library.selectedId,card.id);assert.ok(card.bookmarked);
  const repeated=snap('后续');repeated.turns.push({...repeated.turns[0]!,userKey:'3',answerKey:'4'});library=mergeSnapshot(library,repeated);assert.equal(Object.keys(library.cards).length,2,'real repeated questions must remain separate');
});

test('explicit board groups preserve native session names, history colors and move-out ownership',async()=>{
  localStorage.clear();const {adapter}=fixture();const store=new CanvasStore(adapter);await store.start();
  const title=store.get().library.conversations[cid]!.title,colors=Object.values(store.get().library.cards).map(c=>c.historyColor);
  store.moveSessionToNewBoard(cid,title);const board=store.get().library.boards![store.get().canvasId]!;assert.equal(board.title,'白板1');assert.equal(board.kind,'group');assert.deepEqual(board.conversationIds,[cid]);assert.equal(store.get().library.conversations[cid]!.title,title);
  const next=store.newBoard();assert.equal(store.get().library.boards![next]!.title,'白板2');store.moveSession(cid,next);assert.deepEqual(store.get().library.boards![board.id]!.conversationIds,[]);store.moveSession(cid);assert.equal(Object.values(store.get().library.boards!).find(b=>b.conversationIds.includes(cid))!.kind,'standalone');assert.deepEqual(Object.values(store.get().library.cards).map(c=>c.historyColor),colors);await store.flush();store.dispose();
});


test('recollection removes an already persisted temporary ghost beside a canonical root',()=>{
  const temporary=snap('');temporary.turns[0]!.userKey='-1';delete temporary.turns[0]!.answerKey;
  let library=mergeSnapshot(emptyLibrary(),temporary);const old=Object.keys(library.cards)[0]!,canonical=mergeSnapshot(emptyLibrary(),snap('正式回答'));
  library.cards={...library.cards,...canonical.cards};library.selectedId=old;
  library=mergeSnapshot(library,snap('正式回答'));assert.equal(Object.keys(library.cards).length,1);assert.equal(library.selectedId,'sample:answer:2');validateLibrary(library);
});

test('a native collapsed thinking panel never erases the already collected reasoning',()=>{
  const visible=snap();visible.turns[0]!.reasoning='已加载的思考正文';visible.turns[0]!.reasoningLabel='已思考';
  let library=mergeSnapshot(emptyLibrary(),visible);library=mergeSnapshot(library,snap());assert.equal(Object.values(library.cards)[0]!.reasoning,'已加载的思考正文');
});

test('positive provisional user identities and replaced assistant identities preserve one root',()=>{
  const first=snap('');first.turns[0]!.userKey='101';first.turns[0]!.answerKey='102';
  let library=mergeSnapshot(emptyLibrary(),first);const prior=Object.values(library.cards)[0]!;prior.bookmarked=true;prior.position={x:723,y:321};library.lockedId=prior.id;
  library=mergeSnapshot(library,snap('正式正文'));assert.equal(Object.keys(library.cards).length,1);const card=Object.values(library.cards)[0]!;assert.ok(card.bookmarked);assert.equal(card.position.x,723);assert.equal(library.lockedId,card.id);
  const replacement=snap('重新加载的同一回答');replacement.turns[0]!.answerKey='200';library=mergeSnapshot(library,replacement);assert.equal(Object.keys(library.cards).length,1);assert.equal(library.lockedId,'sample:answer:200');validateLibrary(library);
  const version=snap('另一回答版本');version.turns[0]!.answerVersion=2;library=mergeSnapshot(library,version);assert.equal(Object.keys(library.cards).length,2,'actual answer versions must remain separate');
});

test('structured reference wire preserves multiline excerpts and separates the user request',()=>{
  const library=mergeSnapshot(emptyLibrary(),snap('第一行\n\n第二行')),card=Object.values(library.cards)[0]!,q={...makeQuote(card,'assistant',card.answer),number:3};
  const wire=composePrompt({text:'解释这两段',mode:'continue',quotes:[q]});assert.deepEqual(parsePrompt(wire),{userMessage:'解释这两段',contexts:[{id:3,type:'answer',text:'第一行\n\n第二行'}]});assert.ok(wire.startsWith(DEFAULT_PREAMBLE));
});

test('entering a canvas refreshes its loaded native route once without repeating on state updates',async()=>{
  localStorage.clear();const {adapter}=fixture();let scans=0;adapter.scanCurrent=async()=>{scans++;return adapter.read();};
  const store=new CanvasStore(adapter);await store.start();store.setOpen(true);await new Promise(r=>setTimeout(r,10));assert.equal(scans,1);
  store.setOpen(true);store.setDraft({text:'保留草稿'});assert.equal(scans,1);store.setOpen(false);store.setOpen(true);await new Promise(r=>setTimeout(r,10));assert.equal(scans,2);assert.equal(store.draft().text,'保留草稿');store.dispose();
});

test('deleting only a folder detaches sessions while the explicit destructive mode calls native deletion',async()=>{
  localStorage.clear();const {adapter}=fixture();const deleted:string[]=[];adapter.deleteConversation=async id=>{deleted.push(id);};
  const store=new CanvasStore(adapter);await store.start();store.moveSessionToNewBoard(cid);const folder=store.get().canvasId;await store.deleteBoard(folder);
  assert.deepEqual(deleted,[]);assert.ok(!store.get().library.boards![folder]);assert.equal(Object.values(store.get().library.boards!).find(b=>b.conversationIds.includes(cid))!.kind,'standalone');assert.equal(store.get().library.conversations[cid]!.deleted,undefined);
  store.moveSessionToNewBoard(cid);const second=store.get().canvasId;await store.deleteBoard(second,true);assert.deepEqual(deleted,[cid]);assert.ok(!Object.values(store.get().library.boards!).some(b=>b.conversationIds.includes(cid)));assert.equal(store.get().library.conversations[cid]!.deleted,true);validateLibrary(store.get().library);store.dispose();
});

test('attachment queues stay with their input target and reach the original file input before submit',async()=>{
  localStorage.clear();const {adapter}=fixture();const store=new CanvasStore(adapter);await store.start();const leaf=Object.values(store.get().library.cards).at(-1)!;store.select(leaf.id);
  const file=new win.File(['fixture attachment'],'notes.txt',{type:'text/plain',lastModified:1}) as unknown as File;store.addFiles([file,file]);assert.equal(store.files().length,1);store.clearSelection(true);assert.equal(store.files().length,0);store.select(leaf.id);assert.equal(store.files().length,1);
  const input=document.querySelector<HTMLInputElement>('input[type=file]')!;let received:string[]=[];input.addEventListener('change',()=>{received=[...input.files??[]].map(f=>f.name);});store.setDraft({text:'读取附件'});await store.send();assert.deepEqual(received,['notes.txt']);assert.equal(store.get().pending,undefined);assert.equal(store.files(leaf.id).length,0);
  const card=store.get().library.cards[store.get().library.selectedId!]!;assert.deepEqual(card.attachments,[{name:'notes.txt',type:'text/plain',bytes:file.size}]);validateLibrary(store.get().library);store.dispose();
});

test('native member deletion waits for the human confirmation and distinguishes cancellation',async()=>{
  const {adapter}=fixture();let confirms=0;
  const prepare=()=>{document.querySelector('.ds-dropdown-menu')?.remove();const original=document.querySelector('a[href*="/chat/s/"]')!;const more=original.querySelector<HTMLElement>('button')!;
    more.onclick=e=>{e.preventDefault();e.stopPropagation();const menu=document.createElement('div');menu.className='ds-dropdown-menu';menu.setAttribute('role','menu');const option=document.createElement('div');option.className='ds-dropdown-menu-option';option.textContent='删除';option.onclick=()=>{menu.remove();const modal=document.createElement('div');modal.className='ds-modal';const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.textContent='删除后不可恢复';const cancel=document.createElement('button');cancel.textContent='取消';cancel.onclick=()=>modal.remove();const confirm=document.createElement('button');confirm.textContent='删除该对话';confirm.onclick=()=>{confirms++;original.remove();modal.remove();};dialog.append(cancel,confirm);modal.append(dialog);document.body.append(modal);};menu.append(option);document.body.append(menu);};
  };
  prepare();const cancelled=adapter.requestDeleteConversation(cid);await new Promise(r=>setTimeout(r,15));assert.equal(confirms,0);document.querySelector<HTMLButtonElement>('.ds-modal button')!.click();assert.equal(await cancelled,false);
  prepare();const deleted=adapter.requestDeleteConversation(cid);await new Promise(r=>setTimeout(r,15));assert.equal(confirms,0);document.querySelectorAll<HTMLButtonElement>('.ds-modal button')[1]!.click();assert.equal(await deleted,true);assert.equal(confirms,1);
});

test('switching folders during refresh serializes native navigation and collects only the latest folder',async()=>{
  localStorage.clear();const {adapter}=fixture();let release:()=>void=()=>{},scans=0,active=0,max=0;
  adapter.scanCurrent=async()=>{scans++;active++;max=Math.max(max,active);if(scans===1)await new Promise<void>(r=>release=r);active--;return adapter.read();};
  const store=new CanvasStore(adapter);await store.start();store.setOpen(true);await new Promise(r=>setTimeout(r,5));const board=store.newBoard();store.moveSession(cid,board);store.openBoard(board);release();await new Promise(r=>setTimeout(r,15));assert.equal(max,1);assert.equal(store.get().canvasId,board);assert.equal(store.get().syncing,false);assert.equal(scans,2);store.dispose();
});


test('optimistic and official copies in one DOM snapshot never become two historical turns',()=>{
  const {adapter}=fixture(),original=adapter.read(),first=original.turns[0]!;
  let library=mergeSnapshot(emptyLibrary(),{...original,turns:[{...first,userKey:'101',answerKey:undefined,answer:'',reasoning:undefined}],busy:true});
  const canonical=document.querySelector<HTMLElement>('[data-virtual-list-item-key="1"]')!,optimistic=canonical.cloneNode(true) as HTMLElement;optimistic.dataset.virtualListItemKey='101';canonical.before(optimistic);
  const reconciled=adapter.read();assert.equal(reconciled.turns.length,original.turns.length);assert.equal(reconciled.turns[0]!.userKey,'1');library=mergeSnapshot(library,reconciled);assert.equal(Object.keys(library.cards).length,original.turns.length);assert.equal(Object.values(library.cards).filter(c=>c.parentId===null).length,1);validateLibrary(library);
  optimistic.remove();const second=document.querySelector('[data-virtual-list-item-key="3"] .ds-collapsible-text')!;second.textContent=first.question;assert.equal(adapter.read().turns.length,original.turns.length,'real repeated questions with their own assistants stay distinct');
});

test('new-root submission does not adopt a stale notification from the previous native session',async()=>{
  localStorage.clear();const {adapter}=fixture();let capture:(s:Snapshot)=>void=()=>{};
  const store=new CanvasStore({read:()=>adapter.read(),observe:fn=>{capture=fn;return adapter.observe(fn);},locate:(...args)=>adapter.locate(...args),reveal:(...args)=>adapter.reveal(...args),send:(...args)=>adapter.send(...args),newConversation:async()=>{capture(adapter.read());await adapter.newConversation();}});
  await store.start();const folder=store.newBoard();store.setDraft({text:'独立新根'});await store.send();const members=store.get().library.boards![folder]!.conversationIds;assert.equal(members.length,1);assert.notEqual(members[0],cid);assert.equal(store.get().pending,undefined);store.dispose();
});

test('folder dialogs cancel on outside press and groups never mount into the collapsed native tool strip',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();store.moveSessionToNewBoard(cid);const id=store.get().canvasId;
  const container=document.createElement('div');container.dataset.suedama='test-ui';document.body.append(container);const root=createRoot(container);
  const Probe=()=>createElement(NativeBoardList,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));
  await new Promise(r=>setTimeout(r,25));flushSync(()=>root.render(createElement(Probe)));assert.ok(document.querySelector('.b8812f16 [data-suedama=groups]'));assert.ok(!document.querySelector('.e5bf614e [data-suedama=groups]'));
  const overlay=()=>document.querySelector<HTMLElement>('[data-suedama=overlay]')?.shadowRoot??container;
  flushSync(()=>document.querySelector<HTMLButtonElement>('[aria-label="白板1菜单"]')!.click());flushSync(()=>[...overlay().querySelectorAll('button')].find(e=>e.textContent==='删除白板')!.click());assert.ok(overlay().querySelector('[role=dialog]'));
  flushSync(()=>overlay().querySelector('.folder-dialog-backdrop')!.dispatchEvent(new win.PointerEvent('pointerdown',{bubbles:true}) as unknown as Event));assert.equal(overlay().querySelector('[role=dialog]'),null);assert.ok(store.get().library.boards![id]);
  flushSync(()=>document.querySelector<HTMLButtonElement>('[aria-label="白板1菜单"]')!.click());flushSync(()=>[...overlay().querySelectorAll('button')].find(e=>e.textContent==='重命名')!.click());assert.ok(overlay().querySelector('[aria-label="名称"]'));
  flushSync(()=>overlay().querySelector('.folder-dialog-backdrop')!.dispatchEvent(new win.PointerEvent('pointerdown',{bubbles:true}) as unknown as Event));assert.equal(overlay().querySelector('[aria-label="名称"]'),null);assert.equal(store.get().library.boards![id]!.title,'白板1');flushSync(()=>root.unmount());container.remove();store.dispose();
});


test('cancelled or failed answers keep a real boundary before a repeated question',()=>{
  const {adapter}=fixture(),first=adapter.read().turns[0]!;const failed=document.querySelector('[data-virtual-list-item-key="2"] .ds-message')!;failed.innerHTML='<div>生成失败，请重试</div>';document.querySelector('[data-virtual-list-item-key="3"] .ds-collapsible-text')!.textContent=first.question;
  const turns=adapter.read().turns;assert.equal(turns.length,3);assert.equal(turns[0]!.answerKey,'2');assert.match(turns[0]!.answer,/生成失败/);assert.equal(turns[1]!.question,first.question);
});

test('several overlapping pending copies reconcile before an assistant identity exists',()=>{
  const {adapter}=fixture(),original=adapter.read(),first=document.querySelector('[data-virtual-list-item-key="1"]')!;const one=first.cloneNode(true) as HTMLElement,two=first.cloneNode(true) as HTMLElement;one.dataset.virtualListItemKey='101';two.dataset.virtualListItemKey='102';first.before(one,two);document.querySelector('[data-virtual-list-item-key="2"]')!.remove();
  const pending=adapter.read();assert.equal(pending.turns.length,original.turns.length);assert.equal(pending.turns[0]!.userKey,'1');assert.equal(pending.turns[0]!.answerKey,undefined);
});

test('folder order survives serialization and newly created folders append after reordered folders',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const first=store.newBoard(),second=store.newBoard();store.reorderBoards(second,first);const third=store.newBoard();
  const library=validateLibrary(JSON.parse(JSON.stringify(store.get().library)));assert.deepEqual(Object.values(library.boards!).filter(b=>b.kind==='group').sort((a,b)=>(a.order??0)-(b.order??0)).map(b=>b.id),[second,first,third]);store.dispose();
});


test('a stale tab cannot resurrect a promoted loading card or regress its canonical identity',()=>{
  const temp=snap('');temp.turns[0]!.userKey='101';temp.turns[0]!.answerKey='102';
  const baseline=mergeSnapshot(emptyLibrary(),temp),old=Object.keys(baseline.cards)[0]!;
  const canonical=mergeSnapshot(baseline,snap('正式回答')),late=structuredClone(baseline);late.cards[old]!.position={x:999,y:999};
  const saved=mergeLocalChanges(late,baseline,canonical);assert.deepEqual(Object.keys(saved.cards),['sample:answer:2']);
  const staleSave=mergeLocalChanges(saved,baseline,late);assert.deepEqual(Object.keys(staleSave.cards),['sample:answer:2']);
  const observed=mergeSnapshot(staleSave,temp);assert.deepEqual(Object.keys(observed.cards),['sample:answer:2']);assert.equal(observed.cards['sample:answer:2']!.answer,'正式回答');validateLibrary(observed);
});

test('session placement reorders group members and detaches directly into ordinary order',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();
  const group=store.newBoard();for(const id of ['order-a','order-b','order-c'])store.moveSession(id,group,id);
  store.moveSession('order-c',group,undefined,{before:'order-a'});assert.deepEqual(store.get().library.boards![group]!.conversationIds,['order-c','order-a','order-b']);
  store.moveSession('order-c',undefined,undefined,{before:'outside',order:['outside']});assert.deepEqual(store.get().library.sessionOrder,['order-c','outside']);assert.ok(!store.get().library.boards![group]!.conversationIds.includes('order-c'));
  store.moveSession('outside',undefined,'outside',{before:'order-c',order:['order-c','outside']});assert.deepEqual(store.get().library.sessionOrder,['outside','order-c']);validateLibrary(store.get().library);store.dispose();
});

test('new folders inherit the current background and keep explicit per-folder overrides',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();
  store.appearance({image:'data:image/png;base64,AAAA',brightness:73,blur:4,dots:true,opacity:65});const first=store.get().canvasId,folder=store.newBoard();
  assert.equal(boardAppearance(store.get().library,folder).image,'data:image/png;base64,AAAA');assert.equal(boardAppearance(store.get().library,folder).opacity,65);
  store.appearance({brightness:50});assert.equal(boardAppearance(store.get().library,first).brightness,73);assert.equal(boardAppearance(store.get().library,folder).brightness,50);validateLibrary(store.get().library);store.dispose();
});


test('inline libraries migrate atomically and repeated backgrounds no longer consume quota repeatedly',async()=>{
  localStorage.clear();const key='storage-migration',library=mergeSnapshot(emptyLibrary(),snap());
  const image='data:image/png;base64,'+'A'.repeat(700000),appearance={image,brightness:100,blur:0,dots:true};library.defaultAppearance=appearance;library.boards={};
  for(let i=0;i<20;i++)library.boards['b'+i]={id:'b'+i,title:'白板'+i,kind:'group',conversationIds:i===0?['sample']:[],appearance};
  localStorage.setItem(key,JSON.stringify({[key]:library}));const storage=new LibraryStorage(key),loaded=await storage.load();assert.equal(loaded.defaultAppearance!.image,image);
  await storage.save(loaded);const raw=localStorage.getItem(key)!;assert.ok(raw.length<1000000,'shared 14 MB of backgrounds must be stored once');const restored=await new LibraryStorage(key).load();assert.deepEqual(restored.boards,loaded.boards);
  assert.deepEqual(validateLibrary(unpackLibrary(packLibrary(loaded))),validateLibrary(loaded));
  assert.throws(()=>unpackLibrary({format:'suedama.local.2',texts:[],data:{$suedamaText:9}}),/文本引用/);
});

test('clicking ordinary native sessions while canvas is open switches their independent canvas',async()=>{
  localStorage.clear();const {page,adapter}=fixture();page.sessions['other-session']={title:'另一份官方会话',versions:[[{u:'101',a:'102',q:'另一根线路',aText:'另一回答'}]],branch:1};page.render();
  const store=new CanvasStore(adapter);await store.start();store.moveSessionToNewBoard(cid);const group=store.get().canvasId;await store.refreshBoard();
  const container=document.createElement('div');container.dataset.suedama='test-ui';document.body.append(container);const root=createRoot(container);const Probe=()=>createElement(NativeBoardList,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,10));
  document.querySelector<HTMLAnchorElement>('a[href$="/other-session"]')!.click();await new Promise(r=>setTimeout(r,80));assert.ok(store.get().open);assert.equal(page.current,'other-session');
  const owner=store.get().library.boards![store.get().canvasId]!;assert.equal(owner.kind,'standalone');assert.deepEqual(owner.conversationIds,['other-session']);assert.notEqual(owner.id,group);assert.deepEqual(store.get().library.boards![group]!.conversationIds,[cid]);
  await store.openNativeSession(cid);assert.ok(store.get().open);assert.equal(store.get().canvasId,group);assert.equal(page.current,cid);flushSync(()=>root.unmount());container.remove();store.dispose();
});

test('archive settings group entries by canvas and open the actual native thread for readonly viewing',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();store.moveSessionToNewBoard(cid);await store.refreshBoard();const board=store.get().canvasId,card=Object.values(store.get().library.cards)[0]!;store.archive(card.id);const frozen=JSON.stringify(store.get().library);
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);const Probe=()=>createElement(ArchivePanel,{store,library:useSyncExternalStore(store.subscribe,store.get).library});flushSync(()=>root.render(createElement(Probe)));
  assert.equal(archiveGroups(store.get().library)[0]!.board.id,board);assert.equal(container.querySelectorAll('.archive-board').length,1);assert.equal(container.querySelector('summary strong')!.textContent,'白板1');
  flushSync(()=>[...container.querySelectorAll('button')].find(e=>e.textContent==='只读查看')!.click());await new Promise(r=>setTimeout(r,25));assert.ok(store.get().archiveReader);assert.equal(store.get().open,false);assert.equal(container.querySelector('.archive-reader'),null);assert.ok(document.querySelector('.fixture-native [data-virtual-list-item-key]'));assert.equal(JSON.stringify(store.get().library),frozen);
  store.closeArchiveReader();flushSync(()=>[...container.querySelectorAll('button')].find(e=>e.textContent==='取消归档')!.click());assert.equal(store.get().library.cards[card.id]!.archived,false);assert.equal(container.querySelectorAll('.archive-item').length,0);flushSync(()=>root.unmount());container.remove();store.dispose();
});


test('lasso preview selects on entry, removes on exit and preserves Shift additions',()=>{
  const cards=[{id:'a',position:{x:100,y:100},width:80,height:80},{id:'b',position:{x:300,y:100},width:80,height:80}],start={x:0,y:0};
  assert.deepEqual(lassoSelection(cards,start,{x:120,y:120}),['a']);assert.deepEqual(lassoSelection(cards,start,{x:90,y:90}),[]);assert.deepEqual(lassoSelection(cards,start,{x:320,y:130},['kept']),['kept','a','b']);
});


test('native archive reader keeps root context, hides mutation controls and restores the untouched draft',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();const cards=Object.values(store.get().library.cards),root=cards[0]!,entry=cards[1]!;
  store.archive(entry.id);const leaf=archiveLeaf(store.get().library,entry.id)!;assert.equal(leaf.route[0]!.userKey,root.route[0]!.userKey);assert.equal(leaf.route.length,3);
  const input=document.querySelector<HTMLTextAreaElement>('.fixture-composer textarea')!;input.value='保留官网原草稿';await store.openArchiveReader(entry.id);assert.equal(store.get().archiveReader?.id,entry.id);assert.equal(page.versions[page.getBranch()-1]!.length,3);
  const stop=installNativeReadonly(document,()=>store.get().library,()=>adapter.read());
  assert.equal(document.querySelector('[data-virtual-list-item-key="1"]')!.getAttribute('data-suedama-archive-state'),'context');assert.equal(document.querySelector('[data-virtual-list-item-key="3"]')!.getAttribute('data-suedama-archive-state'),'archived');assert.ok(document.querySelector('.fixture-composer')!.hasAttribute('data-suedama-readonly-composer'));
  document.querySelector<HTMLElement>('[data-virtual-list-item-key="3"] .d4910adc')!.click();assert.equal(document.querySelectorAll('textarea').length,1);assert.equal(input.value,'保留官网原草稿');
  const before=page.versions[page.getBranch()-1]!.length;await store.send();assert.equal(page.versions[page.getBranch()-1]!.length,before);
  stop();store.closeArchiveReader();assert.equal(document.documentElement.hasAttribute('data-suedama-archive-reading'),false);assert.equal(document.querySelector('[data-suedama-readonly-action]'),null);assert.equal(input.value,'保留官网原草稿');assert.equal(store.get().archives,true);store.dispose();
});

test('archive state follows the actual selected branch and virtualized leading answer',()=>{
  let library=mergeSnapshot(emptyLibrary(),snap());const branch={...snap(),turns:[...snap().turns,{userKey:'3',answerKey:'4',question:'归档的问题',answer:'已归档回答',userVersion:1,answerVersion:1}]};library=mergeSnapshot(library,branch);library.cards['sample:answer:4']!.archived=true;
  const states=archiveMessageStates(library,branch);assert.equal(states.get('1'),'context');assert.equal(states.get('2'),'context');assert.equal(states.get('3'),'archived');assert.equal(states.get('4'),'archived');
  const suffix=archiveMessageStates(library,{...branch,turns:[],atStart:false,leadingAnswerKey:'4'});assert.equal(suffix.get('4'),'archived');
});

test('readonly archive uses one continuous background through gaps, scrolling and virtualized answers',async()=>{
  const {adapter}=fixture();let snapshot=adapter.read();const library=mergeSnapshot(emptyLibrary(),snapshot);library.cards[turnId(cid,snapshot.turns[1]!)]!.archived=true;
  const host=document.querySelector<HTMLElement>('.fixture-native')!,rows=[...host.querySelectorAll<HTMLElement>('[data-virtual-list-item-key]')];let offset=0,height=900;
  host.style.position='relative';host.getBoundingClientRect=()=>({top:20,left:200,width:740,height:500,right:940,bottom:520,x:200,y:20,toJSON(){}});
  Object.defineProperty(host,'clientHeight',{configurable:true,get:()=>500});Object.defineProperty(host,'scrollHeight',{configurable:true,get:()=>height});Object.defineProperty(host,'scrollTop',{configurable:true,get:()=>offset});
  rows.forEach((row,index)=>row.getBoundingClientRect=()=>({top:20+index*120-offset,left:200,width:740,height:80,right:940,bottom:100+index*120-offset,x:200,y:20+index*120-offset,toJSON(){}}));
  rows[0]!.style.cssText='background:rgb(30, 31, 32);border-radius:3px';const original=getComputedStyle(rows[0]!).backgroundColor;
  const stop=installNativeReadonly(document,()=>library,()=>snapshot),sheet=()=>host.querySelector<HTMLElement>('[data-suedama=archive-backdrop]');
  assert.equal(sheet()!.style.top,'240px');assert.equal(sheet()!.style.height,'660px');assert.equal(host.querySelectorAll('[data-suedama=archive-backdrop]').length,1);assert.equal(getComputedStyle(rows[0]!).backgroundColor,original);assert.equal(getComputedStyle(rows[0]!).borderRadius,'3px');assert.equal(rows[2]!.style.background,'');assert.equal(sheet()!.getAttribute('aria-hidden'),'true');
  offset=300;height=1100;host.dispatchEvent(new win.Event('scroll') as unknown as Event);await new Promise(r=>setTimeout(r,25));assert.equal(sheet()!.style.top,'240px');assert.equal(sheet()!.style.height,'860px');
  height=780;host.dispatchEvent(new win.Event('scroll') as unknown as Event);await new Promise(r=>setTimeout(r,25));assert.equal(sheet()!.style.height,'540px','collapsing thought must shrink the sheet');
  rows.slice(0,3).forEach(row=>row.remove());snapshot={...snapshot,turns:snapshot.turns.slice(2),atStart:false,leadingAnswerKey:'4'};host.dispatchEvent(new win.Event('scroll') as unknown as Event);await new Promise(r=>setTimeout(r,25));assert.equal(sheet()!.style.top,'360px');assert.equal(rows[3]!.dataset.suedamaArchiveState,'archived');
  host.replaceChildren(...rows.slice(3));await new Promise(r=>setTimeout(r,25));assert.equal(host.querySelectorAll('[data-suedama=archive-backdrop]').length,1,'native list reconciliation can remove and remount the background');
  sheet()!.remove();await new Promise(r=>setTimeout(r,25));assert.equal(host.querySelectorAll('[data-suedama=archive-backdrop]').length,1,'removing only the extension sheet must also recover');
  stop();assert.equal(sheet(),null);assert.equal(host.hasAttribute('data-suedama-archive-host'),false);assert.equal(host.style.position,'relative');assert.equal(rows[0]!.style.background,'rgb(30, 31, 32)');
});

test('archive background fills the native reading viewport and leaves no sheet on an unarchived version',async()=>{
  const {adapter}=fixture(),snapshot=adapter.read(),library=mergeSnapshot(emptyLibrary(),snapshot),card=library.cards[turnId(cid,snapshot.turns[0]!)]!;card.archived=true;
  const messages=document.querySelector('.fixture-native')!,viewport=document.createElement('section');viewport.className='ds-virtual-list ds-scroll-area';viewport.style.position='static';messages.before(viewport);viewport.append(messages);
  viewport.getBoundingClientRect=()=>({top:60,left:284,width:996,height:600,right:1280,bottom:660,x:284,y:60,toJSON(){}});Object.defineProperty(viewport,'clientHeight',{configurable:true,value:600});Object.defineProperty(viewport,'scrollHeight',{configurable:true,value:1400});viewport.scrollTop=200;
  messages.querySelector<HTMLElement>('[data-virtual-list-item-key]')!.getBoundingClientRect=()=>({top:100,left:410,width:740,height:80,right:1150,bottom:180,x:410,y:100,toJSON(){}});
  const stop=installNativeReadonly(document,()=>library,()=>snapshot),sheet=viewport.querySelector<HTMLElement>(':scope>[data-suedama=archive-backdrop]')!;assert.ok(sheet);assert.equal(sheet.style.top,'240px');assert.equal(sheet.style.height,'1160px');assert.ok(viewport.hasAttribute('data-suedama-archive-position'));assert.equal(messages.hasAttribute('data-suedama-archive-host'),false);
  card.archived=false;viewport.dispatchEvent(new win.Event('scroll') as unknown as Event);await new Promise(r=>setTimeout(r,25));assert.equal(document.querySelector('[data-suedama=archive-backdrop]'),null);assert.equal(viewport.hasAttribute('data-suedama-archive-host'),false);stop();assert.equal(viewport.style.position,'static');
});

test('sidebar sections share the native scroll area; tools sit above it and submenu survives native popup closing',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const board=store.newBoard();await store.refreshBoard();
  const container=document.createElement('div');container.dataset.suedama='test-ui';document.body.append(container);const root=createRoot(container);const Probe=()=>createElement(NativeBoardList,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,25));flushSync(()=>root.render(createElement(Probe)));
  const owned=document.querySelector('[data-suedama=groups]')!,scroll=document.querySelector('[data-suedama-sidebar-scroll]')!;assert.ok(owned.querySelector('.folder-zone [data-suedama-board]'));const buffer=document.querySelector('[data-suedama=groups-toolbar] [data-suedama-new-board-drop]')!;assert.ok(buffer.querySelector('[aria-label="多选会话"]'));assert.ok(buffer.querySelector('[aria-label="新建文件夹"]'));assert.ok(buffer.querySelector('[aria-label="排序"]'));assert.equal(buffer.previousElementSibling?.getAttribute('aria-label'),'新建白板');assert.equal(owned.parentElement,scroll);assert.equal(document.querySelector('[data-suedama-native-list]')!.parentElement,scroll);
  flushSync(()=>document.querySelector<HTMLButtonElement>('a[href] [aria-label="会话菜单"]')!.click());await new Promise(r=>setTimeout(r,10));flushSync(()=>root.render(createElement(Probe)));
  const trigger=document.querySelector<HTMLElement>('[data-suedama=session-menu] .move-trigger')!;assert.ok(trigger);assert.equal(document.querySelector('[data-suedama=session-menu] select'),null);flushSync(()=>trigger.click());
  document.querySelector('.ds-dropdown-menu')!.remove();await new Promise(r=>setTimeout(r,15));const overlay=document.querySelector('[data-suedama=overlay]')!.shadowRoot!;assert.ok(overlay.querySelector('[aria-label="选择白板"]'));flushSync(()=>overlay.querySelector<HTMLButtonElement>('[role=menuitem]')!.click());assert.ok(store.get().library.boards![board]!.conversationIds.includes(cid));assert.equal(store.get().library.boards![board]!.kind,'group');flushSync(()=>root.unmount());container.remove();store.dispose();
});


test('a saved archive reader resumes the real route and returns to its owning canvas',async()=>{
  localStorage.clear();const {adapter}=fixture(),storage=new LibraryStorage('archive-resume'),store=new CanvasStore(adapter,storage);await store.start();store.moveSessionToNewBoard(cid);await store.refreshBoard();const card=Object.values(store.get().library.cards)[1]!,board=store.get().canvasId;store.archive(card.id);await store.flush();store.dispose();
  const restored=new CanvasStore(adapter,new LibraryStorage('archive-resume'));restored.prepareArchiveReader({id:card.id,boardId:board});await restored.start();assert.equal(restored.get().archiveReader?.id,card.id);assert.equal(restored.get().open,false);restored.closeArchiveReader();assert.equal(restored.get().canvasId,board);assert.equal(restored.get().library.activeBoardId,board);assert.equal(restored.get().archives,true);restored.dispose();
});

test('card navigation preserves scale and explicit focus places the card slightly lower',()=>{
  const bounds={width:1000,height:720},position={x:200,y:800},size={x:600,y:500};
  const pan=cardViewport(bounds,position,size,.43);assert.equal(pan.zoom,.43);assert.equal(pan.y+(position.y+size.y/2)*pan.zoom,290);assert.equal(pan.x+(position.x+size.x/2)*pan.zoom,500);
  const fit=cardViewport(bounds,position,size,.43,true);assert.equal(fit.zoom,.96);assert.equal(fit.y+(position.y+size.y/2)*fit.zoom,290);
});

test('continuations and new roots never request focus or change the saved canvas viewport',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const view={x:-310,y:175,zoom:.43};store.viewport(view,false);let focuses=0;const stop=store.onFocus(()=>focuses++);
  const leaf=store.get().library.conversations[cid]!.activeIds.at(-1)!;store.select(leaf);store.setDraft({text:'继续但保持视角'});await store.send();assert.equal(store.get().pending,undefined);assert.equal(focuses,0);assert.deepEqual(store.savedViewport(false),view);
  store.clearSelection(true);store.setDraft({text:'新根但保持视角'});await store.send();assert.equal(store.get().pending,undefined);assert.equal(focuses,0);assert.deepEqual(store.savedViewport(false),view);stop();store.dispose();
});

test('quote navigation preserves live scale even across canvases and only explicit focus requests fit',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const card=Object.values(store.get().library.cards)[0]!,quote=makeQuote(card,'assistant',card.answer),requests:{fit?:boolean;zoom?:number}[]=[];
  store.viewport({x:0,y:0,zoom:.8},false);const stopFocus=store.onFocus((_p,_s,options)=>requests.push(options)),stopView=store.onViewport(false,()=>({x:120,y:-40,zoom:.43}));store.jumpReference([quote]);await new Promise(r=>setTimeout(r,25));assert.deepEqual(requests.pop(),{zoom:.43});stopView();
  store.newBoard();const stopOther=store.onViewport(false,()=>({x:0,y:0,zoom:.67}));store.jumpReference([quote]);assert.equal(store.savedViewport(false)!.zoom,.67,'seed the destination before its canvas mounts');await new Promise(r=>setTimeout(r,25));assert.deepEqual(requests.pop(),{zoom:.67});store.focus(card.position,{x:card.width,y:card.height},{fit:true});assert.deepEqual(requests.pop(),{fit:true});stopOther();stopFocus();store.dispose();
});

test('organizing folders contain boards and independent sessions without merging their histories',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const cardCount=Object.keys(store.get().library.cards).length,board=store.newBoard();store.moveSession('independent-a',board,'白板内部会话');const folder=store.newFolder();store.renameFolder(folder,'资料');
  store.moveSidebarItem({kind:'board',id:board},folder);store.moveSidebarItem({kind:'session',id:cid},folder);
  let library=store.get().library;assert.equal(library.folders![folder]!.title,'资料');assert.deepEqual(library.folders![folder]!.items,[{kind:'board',id:board},{kind:'session',id:cid}]);assert.deepEqual(library.boards![board]!.conversationIds,['independent-a']);assert.equal(Object.values(library.boards!).find(b=>b.conversationIds.includes(cid))!.kind,'standalone');assert.equal(Object.keys(library.cards).length,cardCount);
  store.moveSidebarItem({kind:'session',id:'independent-a'},folder,{kind:'board',id:board});library=store.get().library;assert.deepEqual(library.boards![board]!.conversationIds,[]);assert.deepEqual(library.folders![folder]!.items.map(i=>i.id),['independent-a',board,cid]);assert.equal(Object.values(library.boards!).filter(b=>b.conversationIds.includes('independent-a')).length,1);
  store.moveSession(cid,board);assert.equal(folderForItem(store.get().library,{kind:'session',id:cid}),undefined);assert.deepEqual(store.get().library.boards![board]!.conversationIds,[cid]);validateLibrary(store.get().library);store.dispose();
});

test('deleting only an organizing folder releases its contents and preserves board members and geometry',async()=>{
  localStorage.clear();const {adapter}=fixture(),deleted:string[]=[];adapter.deleteConversation=async id=>{deleted.push(id);};const store=new CanvasStore(adapter);await store.start();store.moveSessionToNewBoard(cid);const board=store.get().canvasId,folder=store.newFolder(),cards=structuredClone(store.get().library.cards);store.moveSidebarItem({kind:'board',id:board},folder);store.moveSidebarItem({kind:'session',id:'other'},folder,undefined,'独立会话');await store.deleteFolder(folder);
  assert.deepEqual(deleted,[]);assert.equal(store.get().library.folders![folder],undefined);assert.deepEqual(store.get().library.cards,cards);assert.deepEqual(store.get().library.boards![board]!.conversationIds,[cid]);assert.equal(Object.values(store.get().library.boards!).find(b=>b.conversationIds.includes('other'))!.kind,'standalone');validateLibrary(store.get().library);store.dispose();
});

test('destructive folder deletion includes nested board sessions exactly once and stops on native failure',async()=>{
  localStorage.clear();const {adapter}=fixture(),deleted:string[]=[];adapter.deleteConversation=async id=>{deleted.push(id);};const store=new CanvasStore(adapter);await store.start();store.moveSessionToNewBoard(cid);const board=store.get().canvasId,folder=store.newFolder();store.moveSidebarItem({kind:'board',id:board},folder);store.moveSidebarItem({kind:'session',id:'other'},folder,undefined,'另一个');await store.deleteFolder(folder,true);
  assert.deepEqual(deleted,[cid,'other']);assert.equal(store.get().library.boards![board],undefined);assert.equal(store.get().library.folders![folder],undefined);assert.ok(store.get().library.conversations[cid]!.deleted);assert.ok(store.get().library.conversations.other!.deleted);
  const failed=store.newFolder();store.moveSidebarItem({kind:'session',id:'keep'},failed,undefined,'保留');adapter.deleteConversation=async()=>{throw new Error('native unavailable');};await assert.rejects(()=>store.deleteFolder(failed,true),/unavailable/);assert.equal(store.get().library.folders![failed]!.items[0]!.id,'keep');assert.equal(store.get().library.conversations.keep!.deleted,undefined);assert.equal(store.get().syncing,false);validateLibrary(store.get().library);store.dispose();
});

test('time sorting stays inside each parent and switching back restores all manual orders',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const a=store.newBoard(),b=store.newBoard();store.moveSession('old',a,'旧');store.moveSession('new',a,'新');store.reorderBoards(b,a);const folder=store.newFolder();store.moveSidebarItem({kind:'board',id:a},folder);store.moveSidebarItem({kind:'session',id:cid},folder);const manual=structuredClone(store.get().library.folders![folder]!.items),members=[...store.get().library.boards![a]!.conversationIds];
  store.setSidebarSort('time');const library=structuredClone(store.get().library);library.conversations.old!.updatedAt=1;library.conversations.new!.updatedAt=3;library.conversations[cid]!.updatedAt=2;library.boards![a]!.createdAt=0;
  assert.equal(sidebarSort(library),'time');assert.deepEqual(sortedItems(library,manual).map(i=>i.id),[a,cid]);assert.deepEqual(sortedItems(library,members.map(id=>({kind:'session' as const,id}))).map(i=>i.id),['new','old']);assert.deepEqual(library.folders![folder]!.items,manual);assert.deepEqual(library.boards![a]!.conversationIds,members);
  store.setSidebarSort('manual');assert.deepEqual(sortedItems(store.get().library,manual),manual);assert.deepEqual(store.get().library.boards![a]!.conversationIds,members);assert.ok(folderForItem(store.get().library,{kind:'board',id:a}));assert.equal(folderForItem(store.get().library,{kind:'session',id:'new'}),undefined);assert.equal(sortedFolders(store.get().library)[0]!.id,folder);validateLibrary(store.get().library);store.dispose();
});

test('folder changes merge across tabs and folder structure survives backup validation',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const id=store.newFolder();store.moveSidebarItem({kind:'session',id:cid},id);const before=structuredClone(store.get().library),latest=structuredClone(before),incoming=structuredClone(before);latest.folders![id]!.title='另一标签改名';incoming.folders![id]!.items=[];
  const merged=mergeLocalChanges(latest,before,incoming);assert.equal(merged.folders![id]!.title,'另一标签改名');assert.deepEqual(merged.folders![id]!.items,[]);assert.deepEqual(validateLibrary(unpackLibrary(packLibrary(merged))).folders,merged.folders);
  const malformed=structuredClone(before);malformed.folders![id]!.items.push({kind:'session',id:cid});assert.throws(()=>validateLibrary(malformed),/文件夹条目/);store.dispose();
});

test('sidebar section collapse and folder dialogs keep native rows in place and cancel outside',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const folder=store.newFolder();const container=document.createElement('div');document.body.append(container);const root=createRoot(container),Probe=()=>createElement(NativeBoardList,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,25));
  const native=document.querySelector('[data-suedama-native-list]')!,parent=native.parentElement;flushSync(()=>[...document.querySelectorAll<HTMLElement>('.sidebar-section-heading')].find(e=>e.textContent?.includes('最近'))!.click());assert.equal(store.get().library.sidebarSections!.recent,false);assert.equal(document.documentElement.dataset.suedamaRecent,'expanded');await new Promise(r=>setTimeout(r,5));assert.equal(document.documentElement.dataset.suedamaRecent,'collapsed');assert.equal(native.parentElement,parent);
  flushSync(()=>store.toggleSidebarSection('recent'));flushSync(()=>document.querySelector<HTMLButtonElement>('[aria-label="文件夹1菜单"]')!.click());const overlay=()=>document.querySelector('[data-suedama=overlay]')?.shadowRoot??container;flushSync(()=>[...overlay().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='删除文件夹')!.click());assert.ok(overlay().querySelector('[aria-label="删除文件夹"]'));flushSync(()=>overlay().querySelector('.folder-dialog-backdrop')!.dispatchEvent(new win.PointerEvent('pointerdown',{bubbles:true}) as unknown as Event));assert.ok(store.get().library.folders![folder]);assert.equal(overlay().querySelector('[role=dialog]'),null);flushSync(()=>root.unmount());container.remove();store.dispose();
});

test('sidebar edge scrolling continues while the pointer is held still and stops on release',async()=>{
  const {adapter}=fixture(),store=new CanvasStore(adapter);const scroll=document.querySelector<HTMLElement>('._6d215eb')!,owned=document.createElement('div'),toolbar=document.createElement('div');scroll.prepend(owned);scroll.getBoundingClientRect=()=>({top:100,left:0,width:280,height:200,bottom:300,right:280,x:0,y:100,toJSON(){}});
  let top=0;Object.defineProperty(scroll,'scrollTop',{configurable:true,get:()=>top,set:value=>{top=Math.max(0,value);}});const descriptor=Object.getOwnPropertyDescriptor(document,'elementFromPoint');Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>scroll});
  const stop=installSidebarDrag(document,store,owned,toolbar,()=>scroll,()=>{}),source=document.querySelector<HTMLAnchorElement>('a[href]')!;source.dispatchEvent(new win.PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:3,clientX:120,clientY:180}) as unknown as Event);source.dispatchEvent(new win.PointerEvent('pointermove',{bubbles:true,pointerId:3,clientX:120,clientY:298}) as unknown as Event);await new Promise(r=>setTimeout(r,50));const first=top;assert.ok(first>0);await new Promise(r=>setTimeout(r,50));assert.ok(top>first,'no additional pointermove is needed');source.dispatchEvent(new win.PointerEvent('pointerup',{bubbles:true,pointerId:3,clientX:120,clientY:298}) as unknown as Event);const released=top;await new Promise(r=>setTimeout(r,30));assert.equal(top,released);source.querySelector<HTMLButtonElement>('button')!.click();assert.ok(document.querySelector('.ds-dropdown-menu'),'a menu click immediately after dragging is not swallowed');stop();if(descriptor)Object.defineProperty(document,'elementFromPoint',descriptor);else delete (document as unknown as Record<string,unknown>).elementFromPoint;
  assert.ok(sidebarEdgeSpeed(101,100,300)<0);assert.equal(sidebarEdgeSpeed(200,100,300),0);assert.ok(sidebarEdgeSpeed(299,100,300)>0);store.dispose();
});

test('archived thinking drawers reveal the same background and restore native colors on exit',async()=>{
  const {adapter}=fixture(),snapshot=adapter.read(),library=mergeSnapshot(emptyLibrary(),snapshot),card=library.cards[turnId(cid,snapshot.turns[0]!)]!;card.archived=true;const summary=document.querySelector<HTMLElement>('.fixture-native summary')!,thought=document.querySelector<HTMLElement>('.ds-think-content')!;const colors=document.createElement('style');colors.textContent='.fixture-native details>summary{background-color:rgb(20, 21, 22)}.fixture-native .ds-think-content{background-color:rgb(25, 26, 27)}';document.body.append(colors);const stop=installNativeReadonly(document,()=>library,()=>snapshot);
  assert.ok(summary.hasAttribute('data-suedama-archive-thinking'));assert.equal(getComputedStyle(summary).backgroundColor,'transparent');assert.equal(getComputedStyle(thought).backgroundColor,'transparent');card.archived=false;document.dispatchEvent(new win.Event('scroll') as unknown as Event);await new Promise(r=>setTimeout(r,25));assert.equal(summary.hasAttribute('data-suedama-archive-thinking'),false);assert.equal(getComputedStyle(summary).backgroundColor,'rgb(20, 21, 22)');stop();assert.equal(getComputedStyle(thought).backgroundColor,'rgb(25, 26, 27)');colors.remove();
});

test('viewing a known branch does not change recent activity; a changed reply does',()=>{
  const {adapter,page}=fixture();let library=mergeSnapshot(emptyLibrary(),adapter.read());page.setBranch(2);library=mergeSnapshot(library,adapter.read());for(const card of Object.values(library.cards))card.updatedAt=500;library.conversations[cid]!.updatedAt=700;
  page.setBranch(1);library=mergeSnapshot(library,adapter.read());assert.equal(library.conversations[cid]!.updatedAt,700);const changed=adapter.read();changed.turns[0]!.answer+=' 新内容';library=mergeSnapshot(library,changed);assert.ok(library.conversations[cid]!.updatedAt>700);
});


test('grouped native sessions remain selectable after href is removed, with native selection state shared across all rows',async()=>{
  localStorage.clear();const {adapter,page}=fixture();page.sessions['folder-session']={title:page.sessions[cid]!.title,versions:[[]],branch:1};page.sessions['ordinary-session']={title:'原列表会话',versions:[[]],branch:1};page.render();
  const store=new CanvasStore(adapter);await store.start();store.moveSessionToNewBoard(cid);const board=store.get().canvasId,folder=store.newFolder();store.moveSidebarItem({kind:'board',id:board},folder);store.moveSidebarItem({kind:'session',id:'folder-session'},folder,undefined,page.sessions[cid]!.title);
  const container=document.createElement('div');container.dataset.suedama='test-ui';document.body.append(container);const root=createRoot(container),Probe=()=>createElement(NativeBoardList,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,25));
  flushSync(()=>document.querySelector<HTMLButtonElement>(`[data-suedama-folder="${folder}"]>.organizer-row>.folder-name`)!.click());flushSync(()=>document.querySelector<HTMLButtonElement>(`[data-suedama-board="${board}"]>.folder-row>.folder-name`)!.click());
  const native=[...document.querySelectorAll<HTMLAnchorElement>('[data-suedama-native-list] a')],byId=new Map(native.map(link=>[link.getAttribute('href')!.split('/').at(-1)!,link]));let opened=0;store.openNativeSession=async()=>{opened++;};
  flushSync(()=>document.querySelector<HTMLButtonElement>('[aria-label="多选会话"]')!.click());await new Promise(r=>setTimeout(r,20));
  assert.equal(native.every(link=>!link.hasAttribute('href')),true);assert.ok(document.documentElement.hasAttribute('data-suedama-selecting'));
  for(const id of [cid,'folder-session']){
    const row=document.querySelector<HTMLElement>(`[data-suedama-session="${id}"]`)!,check=row.querySelector<HTMLButtonElement>('[role=checkbox]')!;assert.ok(check);assert.equal(check.disabled,false);assert.equal(check.getAttribute('aria-checked'),'false');assert.equal(byId.get(id)!.style.display,'none');
    flushSync(()=>check.click());await new Promise(r=>setTimeout(r,15));assert.equal(byId.get(id)!.getAttribute('aria-pressed'),'true');assert.equal(row.querySelector('[role=checkbox]')!.getAttribute('aria-checked'),'true');
  }
  assert.ok(document.querySelector('.fixture-history')!.textContent!.includes('已选择 2 个对话'));assert.equal(opened,0);
  // Native selection changes also flow back to the grouped row, with duplicate titles kept distinct.
  flushSync(()=>byId.get(cid)!.click());await new Promise(r=>setTimeout(r,15));assert.equal(document.querySelector(`[data-suedama-session="${cid}"] [role=checkbox]`)!.getAttribute('aria-checked'),'false');assert.equal(document.querySelector('[data-suedama-session="folder-session"] [role=checkbox]')!.getAttribute('aria-checked'),'true');
  flushSync(()=>byId.get('ordinary-session')!.click());await new Promise(r=>setTimeout(r,15));assert.ok(document.querySelector('.fixture-history')!.textContent!.includes('已选择 2 个对话'));
  const proxy=document.querySelector(`[data-suedama-session="${cid}"]`)!;proxy.dispatchEvent(new win.PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:7,clientX:60,clientY:100}) as unknown as Event);proxy.dispatchEvent(new win.PointerEvent('pointermove',{bubbles:true,pointerId:7,clientX:180,clientY:240}) as unknown as Event);assert.equal(document.querySelector('[data-suedama=drag-preview]'),null);
  flushSync(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='关闭多选')!.click());await new Promise(r=>setTimeout(r,15));assert.equal(document.documentElement.hasAttribute('data-suedama-selecting'),false);assert.equal(document.querySelector('[data-suedama=groups] [role=checkbox]'),null);assert.ok(byId.get(cid)!.href.endsWith(cid));assert.equal(byId.get(cid)!.style.display,'none');
  flushSync(()=>document.querySelector<HTMLButtonElement>('[aria-label="多选会话"]')!.click());await new Promise(r=>setTimeout(r,15));assert.equal(document.querySelector('[data-suedama-session="folder-session"] [role=checkbox]')!.getAttribute('aria-checked'),'false');flushSync(()=>root.unmount());assert.equal(document.documentElement.hasAttribute('data-suedama-selecting'),false);assert.equal(byId.get(cid)!.style.display,'');container.remove();store.dispose();
});

test('organizing folders occupy the upper section and unfiled boards share the lower native session section',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const board=store.newBoard(),folder=store.newFolder();const container=document.createElement('div');document.body.append(container);const root=createRoot(container),Probe=()=>createElement(NativeBoardList,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,20));
  const owned=document.querySelector('[data-suedama=groups]')!,top=owned.querySelector('[data-folder-heading]')!,recent=owned.querySelector('[data-recent-heading]')!,folders=top.nextElementSibling!,boards=recent.nextElementSibling!;assert.ok(folders.querySelector(`[data-suedama-folder="${folder}"]`));assert.ok(boards.querySelector(`[data-suedama-board="${board}"]`));assert.equal(top.textContent?.trim(),'文件夹 ›');assert.equal(folders.contains(boards),false);assert.equal(owned.nextElementSibling,document.querySelector('[data-suedama-native-list]'));
  flushSync(()=>store.toggleSidebarSection('recent'));assert.ok(owned.querySelector(`[data-suedama-folder="${folder}"]`));assert.equal(owned.querySelector(`[data-suedama-board="${board}"]`),null);flushSync(()=>store.toggleSidebarSection('boards'));assert.equal(owned.querySelector(`[data-suedama-folder="${folder}"]`),null);
  flushSync(()=>document.querySelector<HTMLButtonElement>('[aria-label="新建文件夹"]')!.click());assert.equal(store.get().library.sidebarSections!.boards,true);assert.ok(owned.querySelector('[data-suedama-folder]'));flushSync(()=>root.unmount());container.remove();store.dispose();
});


test('prompt envelopes group each annotation, escape delimiters and preserve mixed roles and full turns',()=>{
  const library=mergeSnapshot(emptyLibrary(),snap('正文 </context> & <user_message>\n不要混入用户区\n</user_message>')),card=Object.values(library.cards)[0]!;card.reasoning='思考';
  const qs=[makeQuote(card,'user','第一问'),makeQuote(card,'reasoning','思考'),makeQuote(card,'assistant',card.answer)].map(q=>({...q,number:7,group:'selection'}));
  const wire=composePrompt({text:'我的问题 </user_message>',quotes:qs,mode:'continue'},'先解释 <概念>');
  assert.ok(wire.startsWith(DEFAULT_PREAMBLE));assert.ok(wire.includes('<instruction>\n先解释 &lt;概念&gt;\n</instruction>'));assert.equal((wire.match(/<context id=/g)??[]).length,1);assert.ok(wire.includes('type="question and reasoning and answer"'));const parsed=parsePrompt(wire)!;assert.equal(parsed.userMessage,'我的问题 </user_message>');assert.equal(parsed.contexts.length,1);assert.ok(parsed.contexts[0]!.text.includes(card.answer));assert.equal(parsed.contexts[0]!.id,7);
  assert.equal(parsePrompt(composePrompt({text:'全文',quotes:qs.map(q=>({...q,contextType:'turn'})),mode:'continue'}))!.contexts[0]!.type,'turn');assert.equal(parsePrompt(composePrompt({text:'实际提问',quotes:[],mode:'continue'},'', '开头示例\n\n<user_message>\n示例\n</user_message>'))!.userMessage,'实际提问');assert.equal(parsePrompt('普通问题'),undefined);assert.equal(composePrompt({text:'',quotes:[],mode:'continue'}),'');assert.equal(composePrompt({text:'第一行\r\n第二行',quotes:[],mode:'continue'},'说明\r\n下一行').includes('\r'),false);
});

test('one selection spanning question, thinking and answer retains exact excerpts under one annotation number',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const card=Object.values(store.get().library.cards)[0]!,host=document.createElement('section');host.innerHTML='<div>用户提问原文</div><div>思考原文</div><div>回答原文</div>';document.body.append(host);const parts=[...host.children].map((element,i)=>({element:element as HTMLElement,cardId:card.id,role:(['user','reasoning','assistant'] as const)[i]!}));
  for(const p of parts){p.element.dataset.suedamaNativeCard=p.cardId;p.element.dataset.suedamaNativePart=p.role;}const range=document.createRange();range.setStart(parts[0]!.element.firstChild!,2);range.setEnd(parts[2]!.element.firstChild!,2);const quotes=nativeSelection(document,store.get().library,range);assert.deepEqual(quotes.map(q=>q.role),['user','reasoning','assistant']);assert.ok(quotes[0]!.text.startsWith('提问原文'));assert.equal(quotes[2]!.text,'回答');for(const q of quotes)assert.equal(q.sourceText.slice(q.start,q.end),q.text);
  store.quoteMany(quotes,store.nativeDraftKey());const draft=store.draft(store.nativeDraftKey());assert.equal(new Set(draft.quotes.map(q=>q.number)).size,1);assert.equal(parsePrompt(composePrompt({...draft,text:'解释'}))!.contexts[0]!.type,'question and reasoning and answer');host.remove();store.dispose();
});

test('native sending wraps once, retains official raw history, hides the envelope and clears only its quote draft',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();const original=page.versions[0]!.length,source=Object.values(store.get().library.cards)[0]!;store.promptSettings({customPrompt:'回答时先给例子'});store.quote(makeQuote(source,'assistant','均值'),store.nativeDraftKey());
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container),Probe=()=>createElement(NativeConversation,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,15));
  const input=document.querySelector('textarea')!;input.value='只显示这个问题';input.dispatchEvent(new win.Event('input',{bubbles:true}) as unknown as Event);document.querySelector<HTMLElement>('.fixture-composer .ds-button--primary')!.click();await new Promise(r=>setTimeout(r,65));
  assert.equal(page.versions[0]!.length,original+1);const wire=page.versions[0]!.at(-1)!.q,parsed=parsePrompt(wire)!;assert.equal(parsed.userMessage,'只显示这个问题');assert.equal(parsed.contexts[0]!.type,'answer');assert.ok(wire.includes('<new_instruction>\n回答时先给例子\n</new_instruction>'));assert.equal((wire.match(/Extension context follows\./g)??[]).length,0);assert.equal(adapter.read().turns.at(-1)!.question,wire);
  const saved=store.get().library.cards[turnId(cid,adapter.read().turns.at(-1)!)]!;assert.equal(saved.prompt,'只显示这个问题');assert.equal(saved.annotations.length,1);assert.equal(store.draft(store.nativeDraftKey()).quotes.length,0);assert.equal(store.get().open,false);
  const hidden=[...document.querySelectorAll<HTMLElement>('[data-suedama-wire-hidden]')].find(e=>e.textContent===wire)!;assert.ok(hidden);assert.equal(getComputedStyle(hidden).display,'none');const visible=hidden.nextElementSibling!;assert.equal(visible.getAttribute('data-suedama'),'native-question');assert.ok(visible.textContent!.startsWith('只显示这个问题'));assert.equal(visible.textContent!.includes('Extension context'),false);assert.equal(visible.textContent!.includes('均值'),false);assert.equal(document.querySelector('.ds-assistant-message-main-content[data-suedama-wire-hidden]'),null);assert.equal(document.querySelector('.ds-think-content[data-suedama-wire-hidden]'),null);
  visible.remove();document.querySelector('[data-suedama=native-composer]')!.remove();await new Promise(r=>setTimeout(r,25));assert.equal(hidden.nextElementSibling,visible,'native reconciliation restores the same display host');assert.ok(document.querySelector('[data-suedama=native-composer]'));assert.equal(hidden.textContent,wire);
  flushSync(()=>root.unmount());assert.equal(hidden.hasAttribute('data-suedama-wire-hidden'),false);assert.equal(hidden.textContent,wire);assert.equal(document.querySelector('[data-suedama=native-question]'),null);container.remove();store.dispose();
});

test('the native display also hides previously saved compact references without altering adapter text',async()=>{
  localStorage.clear();const {adapter,page}=fixture();page.sessions[cid]!.versions[0]![0]!.q='旧问题\n\n〔1·回答〕旧引用';page.render();const store=new CanvasStore(adapter);await store.start();const turn=adapter.read().turns[0]!,card=store.get().library.cards[turnId(cid,turn)]!;card.prompt='旧问题';
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container),Probe=()=>createElement(NativeConversation,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,15));assert.ok(document.querySelector('[data-suedama-wire-hidden]'));assert.equal(document.querySelector('[data-suedama=native-question]')!.textContent,'旧问题');assert.equal(adapter.read().turns[0]!.question,turn.question);flushSync(()=>root.unmount());container.remove();store.dispose();
});

test('boards and ordinary sessions share a persistent sibling order without changing folder hierarchy',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const a=store.newBoard(),b=store.newBoard();store.moveSession('other',undefined,'普通会话');store.reorderRecent({kind:'board',id:a},{kind:'session',id:cid},[cid,'other']);store.reorderRecent({kind:'session',id:'other'},{kind:'board',id:a},[cid,'other']);
  const ids=()=>recentItems(store.get().library,[cid,'other']).map(i=>i.id);assert.ok(ids().indexOf('other')<ids().indexOf(a));assert.ok(ids().indexOf(a)<ids().indexOf(cid));const manual=structuredClone(store.get().library.recentOrder);store.setSidebarSort('time');assert.deepEqual(store.get().library.recentOrder,manual);store.setSidebarSort('manual');assert.ok(ids().indexOf('other')<ids().indexOf(a));
  const folder=store.newFolder();store.moveSidebarItem({kind:'board',id:b},folder);assert.equal(ids().includes(b),false);assert.deepEqual(store.get().library.folders![folder]!.items,[{kind:'board',id:b}]);const restored=validateLibrary(unpackLibrary(packLibrary(store.get().library)));assert.deepEqual(restored.recentOrder,store.get().library.recentOrder);assert.deepEqual(recentItems(restored,[cid,'other']).map(i=>i.id),ids());store.dispose();
});

test('board prompt settings survive local storage and reject malformed imported values',async()=>{
  localStorage.clear();const {adapter}=fixture(),storage=new LibraryStorage('prompt-settings'),store=new CanvasStore(adapter,storage);await store.start();const board=store.get().canvasId;store.promptSettings({customPrompt:'先给例子',promptPreamble:DEFAULT_PREAMBLE});await store.flush();store.dispose();const restored=new CanvasStore(adapter,new LibraryStorage('prompt-settings'));await restored.start();assert.equal(restored.get().library.boards![board]!.customPrompt,'先给例子');const bad=structuredClone(restored.get().library);(bad.boards![board] as unknown as {customPrompt:number}).customPrompt=4;assert.throws(()=>validateLibrary(bad),/提示词/);restored.dispose();
});


test('selection across a collapsed native thinking drawer excludes its invisible content',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const snapshot=adapter.read(),parts=nativeParts(document,store.get().library,snapshot),question=parts.find(p=>p.role==='user')!,answer=parts.find(p=>p.role==='assistant')!,range=document.createRange();range.setStart(question.element.firstChild!,0);range.setEnd(answer.element.querySelector('p')!.firstChild!,1);const selected=selectedParts(document,store.get().library,range,parts);assert.deepEqual(selected.map(q=>q.role),['user','assistant']);store.dispose();
});


test('native Enter sends one wrapped request while Shift+Enter and IME confirmation do not submit',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();const count=page.versions[0]!.length,container=document.createElement('div');document.body.append(container);const root=createRoot(container),Probe=()=>createElement(NativeConversation,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,10));const input=document.querySelector('textarea')!;input.value='键盘提问';input.dispatchEvent(new win.Event('input',{bubbles:true}) as unknown as Event);
  for(const options of [{shiftKey:true},{isComposing:true}])input.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,...options}) as unknown as Event);assert.equal(page.versions[0]!.length,count);input.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}) as unknown as Event);await new Promise(r=>setTimeout(r,50));assert.equal(page.versions[0]!.length,count+1);const wire=page.versions[0]!.at(-1)!.q;assert.equal(parsePrompt(wire)!.userMessage,'键盘提问');assert.equal((wire.match(/Extension context follows\./g)??[]).length,0);flushSync(()=>root.unmount());container.remove();store.dispose();
});

test('full-turn references contain only the visible question and answer while explicit reasoning remains selectable',()=>{
  const library=mergeSnapshot(emptyLibrary(),snap('Answer sentinel')),card=Object.values(library.cards)[0]!;card.reasoning='Reasoning must not enter a full-turn reference';
  const quotes=turnQuotes(card).map(q=>({...q,number:1,group:'full'}));assert.deepEqual(quotes.map(q=>q.role),['user','assistant']);
  const wire=composePrompt({text:'Explain',quotes,mode:'continue'}),parsed=parsePrompt(wire)!;
  assert.equal(parsed.contexts[0]!.type,'turn');assert.ok(parsed.contexts[0]!.text.includes(card.question));assert.ok(parsed.contexts[0]!.text.includes(card.answer));assert.equal(wire.includes(card.reasoning),false);
  const explicit=parsePrompt(composePrompt({text:'Explain',quotes:[makeQuote(card,'reasoning',card.reasoning)],mode:'continue'}))!;
  assert.equal(explicit.contexts[0]!.type,'reasoning');assert.equal(explicit.contexts[0]!.text,card.reasoning);
});

test('official Chinese variants use Chinese and other languages use English without translating interpolated user text',()=>{
  for(const lang of ['','zh','zh-CN','zh-TW','zh-HK'])assert.equal(localeFromLanguage(lang),'zh');
  for(const lang of ['en-US','ja','fr','de'])assert.equal(localeFromLanguage(lang),'en');
  assert.equal(translate('suedamA设置','en'),'suedamA settings');
  assert.equal(translate('删除“{0}”？','en',{'0':'我的中文文件夹'}),'Delete “我的中文文件夹”?');
  assert.equal(translate('移除注释 7','en'),'Remove reference 7');
});

test('live official language changes translate UI while retaining the open tab, prompt, draft and viewport',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const original=document.documentElement.lang;
  store.promptSettings({customPrompt:'保留中文 Prompt'});store.viewport({x:137,y:-82,zoom:.67},false);store.setDraft({text:'保留中文草稿'});
  const container=document.createElement('div');container.dataset.suedama='test-ui';document.body.append(container);const root=createRoot(container),Probe=()=>createElement(SettingsPanel,{store,state:useSyncExternalStore(store.subscribe,store.get),onClose:()=>{}});
  try{
    document.documentElement.lang='zh-CN';flushSync(()=>root.render(createElement(Probe)));container.querySelectorAll<HTMLButtonElement>('.settings-tabs button')[1]!.click();await new Promise(r=>setTimeout(r,15));
    const before=store.get().library;document.documentElement.lang='ja';await new Promise(r=>setTimeout(r,20));
    assert.equal(container.querySelector('[role=dialog]')!.getAttribute('aria-label'),'suedamA settings');assert.ok(container.textContent!.includes('Opening guidance'));
    assert.equal(container.querySelector<HTMLTextAreaElement>('[aria-label="Custom prompt"]')!.value,'保留中文 Prompt');assert.equal(store.get().library,before);
    assert.equal(store.draft().text,'保留中文草稿');assert.deepEqual(store.currentViewport(false),{x:137,y:-82,zoom:.67});
    document.documentElement.lang='zh-TW';await new Promise(r=>setTimeout(r,20));assert.equal(container.querySelector('[role=dialog]')!.getAttribute('aria-label'),'suedamA设置');assert.ok(container.textContent!.includes('开头引导'));
  }finally{flushSync(()=>root.unmount());container.remove();document.documentElement.lang=original;store.dispose();}
});

test('sidebar controls survive native reconciliation and draft-only updates do not rescan native rows',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const container=document.createElement('div');container.dataset.suedama='test-ui';document.body.append(container);const root=createRoot(container),Probe=()=>createElement(NativeBoardList,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,25));
  const originalQuery=document.querySelectorAll.bind(document);let sidebarScans=0;document.querySelectorAll=((selector:string)=>{if(selector.includes('[tabindex="0"]'))sidebarScans++;return originalQuery(selector);}) as typeof document.querySelectorAll;
  try{
    for(let i=0;i<15;i++)store.setDraft({text:'typing '+i});await new Promise(r=>setTimeout(r,25));assert.equal(sidebarScans,0);
    const owned=document.querySelector('[data-suedama=groups]')!,toolbar=document.querySelector('[data-suedama=groups-toolbar]')!;owned.remove();toolbar.remove();await new Promise(r=>setTimeout(r,30));assert.ok(owned.isConnected);assert.ok(toolbar.isConnected);assert.ok(sidebarScans>0);
  }finally{document.querySelectorAll=originalQuery;flushSync(()=>root.unmount());container.remove();store.dispose();}
});

test('non-English native labels retain the two toggle identities and their original actions',async()=>{
  const {adapter}=fixture(),toggles=[...document.querySelectorAll<HTMLElement>('.ds-toggle-button')];toggles[0]!.lastChild!.textContent='深く考える';toggles[1]!.lastChild!.textContent='検索';
  const before=adapter.read().controls!;assert.ok(before.some(c=>c.id==='thinking'));assert.ok(before.some(c=>c.id==='search'));
  const thinking=toggles[0]!.getAttribute('aria-pressed'),search=toggles[1]!.getAttribute('aria-pressed');adapter.nativeAction('search');assert.equal(toggles[1]!.getAttribute('aria-pressed'),String(search!=='true'));assert.equal(toggles[0]!.getAttribute('aria-pressed'),thinking);
});

test('native sidebar visibility reads the latest store even before React commits its new props',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();
  const container=document.createElement('div');container.dataset.suedama='test-ui';document.body.append(container);const root=createRoot(container);
  // Hold React props at the old snapshot to reproduce a delayed commit; native presentation has its own subscription.
  flushSync(()=>root.render(createElement(NativeBoardList,{store,state:store.get()})));await new Promise(r=>setTimeout(r,20));
  try{
    const link=document.querySelector<HTMLAnchorElement>('.fixture-session-list a')!;
    for(let i=0;i<4;i++){store.toggleSidebarSection('recent');await new Promise(r=>setTimeout(r,5));assert.equal(document.documentElement.dataset.suedamaRecent,i%2?'expanded':'collapsed');assert.equal(link.style.display,i%2?'':'none');}
    const board=store.newBoard();store.moveSession(cid,board);await new Promise(r=>setTimeout(r,10));assert.equal(link.style.display,'none');
    store.moveSession(cid);await new Promise(r=>setTimeout(r,10));assert.equal(link.style.display,'');
  }finally{flushSync(()=>root.unmount());container.remove();store.dispose();}
});

test('annotation previews cap whiteboard composer width and preserve card scale and native width',async()=>{
  fixture();const library=mergeSnapshot(emptyLibrary(),snap()),card=Object.values(library.cards)[0]!,quote=makeQuote(card,'assistant',card.answer);
  const host=document.createElement('div');host.dataset.suedama='test-ui';document.body.append(host);const shadow=host.attachShadow({mode:'open'}),container=document.createElement('div');shadow.append(container);const root=createRoot(container);
  const rect=(x:number,y:number,width:number,height:number)=>({x,y,left:x,top:y,width,height,right:x+width,bottom:y+height,toJSON(){}});
  const show=async(kind:string,width:number,offsetWidth?:number)=>{
    flushSync(()=>root.render(createElement('section',{key:kind,className:kind},createElement(AnnotationChip,{quotes:[quote],number:1,onOpen:()=>{}}))));
    const section=container.querySelector('section')!,chip=section.querySelector<HTMLElement>('.annotation-chip')!;section.getBoundingClientRect=()=>rect(40,500,width,100);chip.getBoundingClientRect=()=>rect(60,510,100,30);if(offsetWidth)Object.defineProperty(section,'offsetWidth',{value:offsetWidth});
    chip.querySelector('button')!.focus();await new Promise(r=>setTimeout(r,270));return shadow.querySelector<HTMLElement>('.annotation-hover')!;
  };
  try{
    const input=await show('composer',900);assert.ok(input);assert.equal(input.style.width,'420px');assert.equal(input.style.left,'60px');
    const inCard=await show('card',300,600);assert.equal(inCard.style.width,'300px');assert.equal(inCard.style.fontSize,'7px');
    const native=await show('native-quote-draft',900);assert.equal(native.style.width,'100px');
  }finally{flushSync(()=>root.unmount());host.remove();}
});

test('the native collector ignores extension portal mutations but still captures real native changes',async()=>{
  const {adapter}=fixture();const read=adapter.read.bind(adapter);let scans=0,captures=0;adapter.read=()=>{scans++;return read();};const stop=adapter.observe(()=>captures++);scans=0;captures=0;
  try{
    const portal=document.createElement('div');portal.dataset.suedama='performance-test';document.body.append(portal);
    for(let i=0;i<100;i++)portal.textContent='extension render '+i;
    await new Promise(r=>setTimeout(r,160));assert.equal(scans,0);assert.equal(captures,0);
    document.querySelector('.ds-assistant-message-main-content p')!.textContent+=' native streaming update';
    await new Promise(r=>setTimeout(r,160));assert.equal(scans,1);assert.equal(captures,1);portal.remove();
  }finally{stop();}
});

test('native reference clicks stay in the native thread, avoid needless branch scans and preserve drafts and canvas views',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const source=Object.values(store.get().library.cards)[0]!,quote=makeQuote(source,'assistant','均值');
  store.viewport({x:90,y:180,zoom:.43},false);store.quote(quote,store.nativeDraftKey());const input=document.querySelector('textarea')!;input.value='保留流式草稿';
  const views=structuredClone(store.get().library.views);let reveals=0,focuses=0;adapter.locate=async()=>{reveals++;};const stopFocus=store.onFocus(()=>focuses++);
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container),Probe=()=>createElement(NativeConversation,{store,state:useSyncExternalStore(store.subscribe,store.get)});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,15));
  try{
    const composer=document.querySelector('[data-suedama=native-composer]')!.shadowRoot!;composer.querySelector<HTMLButtonElement>('.annotation-chip button')!.click();await new Promise(r=>setTimeout(r,25));
    assert.equal(store.get().open,false);assert.equal(store.get().reference?.surface,'native');assert.equal(reveals,0);assert.equal(focuses,0);assert.equal(input.value,'保留流式草稿');assert.deepEqual(store.get().library.views,views);
    const blocks=[...document.querySelectorAll('[data-suedama-reference-block]')];assert.ok(blocks.length>0);assert.ok(blocks.some(e=>e.textContent==='均值'));assert.equal(document.querySelector('[data-suedama-reference-block] textarea'),null);
    const draft=composer.querySelector('.native-quote-draft')!;assert.equal(getComputedStyle(draft).paddingLeft,'20px');
  }finally{flushSync(()=>root.unmount());container.remove();stopFocus();store.dispose();}
  assert.equal(document.querySelector('[data-suedama-reference-block]'),null);
});

test('native reference navigation restores the source version without opening or zooming the canvas',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();const source=Object.values(store.get().library.cards)[1]!,quote=makeQuote(source,'assistant',source.answer);page.setBranch(2);await store.sync();const views=structuredClone(store.get().library.views);
  await store.jumpNativeReference([quote]);assert.equal(page.getBranch(),1);assert.equal(store.get().open,false);assert.equal(store.get().reference?.surface,'native');assert.equal(store.get().reference?.quotes[0]!.sourceId,source.id);assert.deepEqual(store.get().library.views,views);store.dispose();
});

test('native paragraph highlights recover after message replacement, expand referenced thinking and clean up',async()=>{
  const {adapter}=fixture(),snapshot=adapter.read(),library=mergeSnapshot(emptyLibrary(),snapshot),card=Object.values(library.cards)[0]!;
  const part=document.querySelector<HTMLElement>('.ds-assistant-message-main-content')!,p=part.querySelector('p')!,projected=projectText(part),start=projected.sourceText.indexOf('均值');
  const quote=makeQuote(card,'assistant','均值',start,projected.sourceText);assert.deepEqual(nativeReferenceBlocks(part,quote),[p]);
  const stop=installNativeReference(document,[quote],()=>library,()=>snapshot);await new Promise(r=>setTimeout(r,20));assert.ok(p.hasAttribute('data-suedama-reference-block'));
  const replacement=p.cloneNode(true) as HTMLElement;replacement.removeAttribute('data-suedama-reference-block');p.replaceWith(replacement);await new Promise(r=>setTimeout(r,20));assert.ok(replacement.hasAttribute('data-suedama-reference-block'));assert.equal(p.hasAttribute('data-suedama-reference-block'),false);stop();assert.equal(replacement.hasAttribute('data-suedama-reference-block'),false);
  const thinking=makeQuote(card,'reasoning',card.reasoning!);const stopThought=installNativeReference(document,[thinking],()=>library,()=>snapshot);await new Promise(r=>setTimeout(r,20));assert.equal(document.querySelector('details')!.open,true);assert.ok(document.querySelector('.ds-think-content [data-suedama-reference-block]'));stopThought();assert.equal(document.querySelector('[data-suedama-reference-block]'),null);
});

test('native reference navigation can return to another loaded chat without opening its canvas',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();const source=Object.values(store.get().library.cards)[0]!,quote=makeQuote(source,'assistant','均值');
  page.sessions['another-loaded']={title:'另一个会话',versions:[[{u:'101',a:'102',q:'另一个问题',aText:'另一个回答'}]],branch:1};page.render();await store.openNativeSession('another-loaded');assert.equal(store.get().current.conversationId,'another-loaded');const views=structuredClone(store.get().library.views);
  await store.jumpNativeReference([quote]);assert.equal(store.get().current.conversationId,cid);assert.equal(store.get().open,false);assert.equal(store.get().reference?.surface,'native');assert.ok(store.get().library.boards![store.get().canvasId]!.conversationIds.includes(cid));assert.deepEqual(store.get().library.views,views);store.dispose();
});

test('an unloaded native reference source stops with a notice instead of leaving the thread or reloading',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const source=Object.values(store.get().library.cards)[0]!,quote=makeQuote(source,'assistant','均值');
  // Keep the saved source, but model a different current route whose native sidebar has not loaded it.
  const read=adapter.read.bind(adapter);adapter.read=()=>({...read(),conversationId:'another-route'});document.querySelector('.fixture-session-list a')!.remove();
  await store.jumpNativeReference([quote]);assert.equal(store.get().open,false);assert.equal(store.get().reference,undefined);assert.match(store.get().notice,/来源会话尚未载入官网侧栏/);store.dispose();
});

test('only roots receive configured instructions; continuation references and user messages remain intact',()=>{
  const card=Object.values(mergeSnapshot(emptyLibrary(),snap()).cards)[0]!,quote=makeQuote(card,'assistant','原始回答');const draft={text:'后续提问',quotes:[quote],mode:'continue' as const};
  const root=composePrompt(draft,'ROOT INSTRUCTION','ROOT GUIDANCE',true),continuation=composePrompt(draft,'ROOT INSTRUCTION','ROOT GUIDANCE',false);
  assert.ok(root.startsWith('ROOT GUIDANCE'));assert.ok(root.includes('<instruction>\nROOT INSTRUCTION\n</instruction>'));assert.equal(continuation.includes('ROOT INSTRUCTION'),false);assert.equal(continuation.includes('ROOT GUIDANCE'),false);assert.equal(continuation.includes('<instruction>'),false);
  assert.deepEqual(parsePrompt(continuation),parsePrompt(root));assert.equal(composePrompt({...draft,quotes:[]},'I','P',false),'<user_message>\n后续提问\n</user_message>');
});

test('an empty native viewport cannot reinject root instructions into an existing or virtualized conversation',()=>{
  const library=mergeSnapshot(emptyLibrary(),snap()),empty={conversationId:'new',title:'new',busy:false,turns:[],atStart:true};
  assert.equal(nativeRootTurn(empty,library),true);assert.equal(nativeRootTurn({...empty,conversationId:''},library),true);assert.equal(nativeRootTurn({...empty,conversationId:'sample'},library),false);
  assert.equal(nativeRootTurn({...empty,atStart:false},library),false);assert.equal(nativeRootTurn({...empty,leadingAnswerKey:'2'},library),false);assert.equal(nativeRootTurn(snap(),library),false);
});

test('whiteboard roots freeze settings and changed instructions update each historical branch',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();store.newBoard();await store.refreshBoard();store.promptSettings({promptPreamble:'GUIDANCE A',customPrompt:'INSTRUCTION A'});store.setDraft({text:'第一条根问题'});
  const sending=store.send();store.promptSettings({promptPreamble:'GUIDANCE B',customPrompt:'INSTRUCTION B'});await sending;
  const rootSession=page.current,first=adapter.read().turns[0]!,rootId=turnId(rootSession,first);assert.ok(first.question.startsWith('GUIDANCE A'));assert.ok(first.question.includes('INSTRUCTION A'));assert.equal(first.question.includes('INSTRUCTION B'),false);
  const source=store.get().library.cards[rootId]!;store.quote(makeQuote(source,'assistant','均值'));store.setDraft({text:'根后的提问'});await store.send();const follow=adapter.read().turns[1]!.question;assert.equal(follow.includes('GUIDANCE B'),false);assert.ok(follow.includes('<new_instruction>\nINSTRUCTION B\n</new_instruction>'));assert.equal(parsePrompt(follow)!.contexts[0]!.text,'均值');
  store.select(rootId);store.setDraft({text:'从根分叉，但不是新根'});await store.send();assert.equal(page.versions.length,2);assert.ok(adapter.read().turns[1]!.question.includes('<new_instruction>\nINSTRUCTION B'));assert.equal(adapter.read().turns[0]!.question,first.question);
  store.clearSelection(true);store.setDraft({text:'第二条独立根问题'});await store.send();assert.notEqual(page.current,rootSession);const second=adapter.read().turns[0]!.question;assert.ok(second.startsWith('GUIDANCE B'));assert.ok(second.includes('INSTRUCTION B'));assert.equal(second.includes('INSTRUCTION A'),false);store.dispose();
});

test('native chat roots use their owning board settings and later sends carry an applied update',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();const board=store.newBoard();await store.refreshBoard();store.promptSettings({promptPreamble:'NATIVE GUIDANCE A',customPrompt:'NATIVE INSTRUCTION A'});
  page.sessions['empty-owned']={title:'空会话',versions:[[]],branch:1};page.render();store.moveSession('empty-owned',board);store.setOpen(false);await store.openNativeSession('empty-owned');await store.sendNative('原版首轮');
  const first=page.versions[0]![0]!.q;assert.ok(first.startsWith('NATIVE GUIDANCE A'));assert.ok(first.includes('NATIVE INSTRUCTION A'));
  store.promptSettings({promptPreamble:'NATIVE GUIDANCE B',customPrompt:'NATIVE INSTRUCTION B'});await store.sendNative('原版后续轮');const second=page.versions[0]![1]!.q;assert.equal(second.includes('NATIVE GUIDANCE B'),false);assert.ok(second.includes('<new_instruction>\nNATIVE INSTRUCTION B\n</new_instruction>'));assert.equal(parsePrompt(second)!.userMessage,'原版后续轮');assert.equal(page.versions[0]![0]!.q,first);store.dispose();
});

test('instruction updates use new_instruction including explicit clearing and preserve current references',()=>{
  const card=Object.values(mergeSnapshot(emptyLibrary(),snap()).cards)[0]!,draft={text:'当前问题',quotes:[makeQuote(card,'assistant','原始回答')],mode:'continue' as const};
  const update=composePrompt(draft,'新规则 <示例>','新引导','update');assert.ok(update.startsWith('<new_instruction>'));assert.equal(update.includes('新引导'),false);assert.ok(update.includes('<new_instruction>\n新规则 &lt;示例&gt;\n</new_instruction>'));assert.equal(update.includes('\n<instruction>\n'),false);assert.equal(parsePrompt(update)!.userMessage,'当前问题');assert.equal(parsePrompt(update)!.contexts[0]!.text,'原始回答');
  const cleared=composePrompt(draft,'','','update');assert.ok(cleared.includes('<new_instruction>\n\n</new_instruction>'));assert.ok(composePrompt(draft,'新规则','新引导',true).includes('\n<instruction>\n新规则\n</instruction>'));
});

test('applying identical prompt text is a no-op and a shared global value follows board switching',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();const a=store.get().canvasId;
  assert.equal(store.promptSettings({customPrompt:'Global A'},a,'global'),true);const version=store.get().library.globalCustomPrompt!.version,revision=store.get().library.revision;
  assert.equal(store.promptSettings({customPrompt:'Global A'},a,'global'),false);assert.equal(store.promptSettings({customPrompt:'Global A\r\n'},a,'global'),false);assert.equal(store.get().library.revision,revision);assert.equal(store.get().library.globalCustomPrompt!.version,version);
  const b=store.newBoard();assert.equal(effectivePrompt(store.get().library,store.get().library.boards![b]).instruction,'Global A');assert.equal(store.get().library.boards![b]!.customPrompt,undefined);store.openBoard(a);assert.equal(effectivePrompt(store.get().library,store.get().library.boards![a]).instruction,'Global A');store.dispose();
});

test('a global update reaches each existing native conversation once and new roots use the latest instruction',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();store.promptSettings({customPrompt:'GLOBAL A'},store.get().canvasId,'global');await store.sendNative('普通会话首次收到更新');assert.ok(page.versions[0]!.at(-1)!.q.includes('<new_instruction>\nGLOBAL A\n</new_instruction>'));await store.sendNative('普通会话随后不重复');assert.equal(page.versions[0]!.at(-1)!.q.includes('\n<new_instruction>\n'),false);
  store.newBoard();await store.refreshBoard();store.clearSelection(true);store.setDraft({text:'新根使用全局 A'});await store.send();const secondId=page.current,rootA=page.versions[0]![0]!.q;assert.ok(rootA.includes('\n<instruction>\nGLOBAL A\n</instruction>'));assert.equal(rootA.includes('\n<new_instruction>\n'),false);store.setOpen(false);
  store.promptSettings({customPrompt:'GLOBAL B'},store.get().canvasId,'global');await store.sendNative('第二个会话更新 B');assert.ok(page.versions[0]!.at(-1)!.q.includes('<new_instruction>\nGLOBAL B'));await store.sendNative('第二个会话不再重复 B');assert.equal(page.versions[0]!.at(-1)!.q.includes('\n<new_instruction>\n'),false);
  await store.openNativeSession(cid);await store.sendNative('第一个会话独立更新 B');assert.ok(page.versions[0]!.at(-1)!.q.includes('<new_instruction>\nGLOBAL B'));await store.sendNative('第一个会话随后不重复 B');assert.equal(page.versions[0]!.at(-1)!.q.includes('\n<new_instruction>\n'),false);assert.notEqual(page.current,secondId);
  store.setOpen(true);await store.refreshBoard();store.clearSelection(true);store.setDraft({text:'新根直接使用全局 B'});await store.send();assert.ok(page.versions[0]![0]!.q.includes('\n<instruction>\nGLOBAL B\n</instruction>'));assert.equal(page.versions[0]![0]!.q.includes('\n<new_instruction>\n'),false);store.dispose();
});

test('whiteboard overrides shield global changes, clearing sends an update, and inheritance resumes the shared value',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();const board=store.get().canvasId;store.promptSettings({customPrompt:'GLOBAL A'},board,'global');store.promptSettings({customPrompt:'LOCAL'},board);await store.sendNative('本白板采用覆盖');assert.ok(page.versions[0]!.at(-1)!.q.includes('<new_instruction>\nLOCAL'));
  store.promptSettings({customPrompt:'GLOBAL B'},board,'global');await store.sendNative('全局改变不影响覆盖');assert.equal(page.versions[0]!.at(-1)!.q.includes('\n<new_instruction>\n'),false);
  store.promptSettings({customPrompt:''},board);await store.sendNative('明确清空本白板');assert.ok(page.versions[0]!.at(-1)!.q.includes('<new_instruction>\n\n</new_instruction>'));store.promptSettings({customPrompt:'GLOBAL C'},board,'global');await store.sendNative('空覆盖仍屏蔽全局');assert.equal(page.versions[0]!.at(-1)!.q.includes('\n<new_instruction>\n'),false);
  assert.equal(store.inheritGlobalPrompt(board),true);assert.equal(store.get().library.boards![board]!.customPrompt,undefined);await store.sendNative('重新继承全局 C');assert.ok(page.versions[0]!.at(-1)!.q.includes('<new_instruction>\nGLOBAL C'));await store.sendNative('继承后不重复');assert.equal(page.versions[0]!.at(-1)!.q.includes('\n<new_instruction>\n'),false);store.dispose();
});

test('failed submissions do not consume a prompt update and accepted state survives backup and reload',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),storage=new LibraryStorage('prompt-receipt'),store=new CanvasStore(adapter,storage);await store.start();store.promptSettings({customPrompt:'RETRY'},store.get().canvasId,'global');const submit=adapter.submitNative.bind(adapter),wires:string[]=[];adapter.submitNative=async wire=>{wires.push(wire);throw new Error('测试失败');};
  await store.sendNative('第一次失败');await store.sendNative('第二次失败');assert.equal(wires.length,2);assert.ok(wires.every(wire=>wire.includes('<new_instruction>\nRETRY')));adapter.submitNative=submit;await store.sendNative('终于接收');const saved=validateLibrary(unpackLibrary(packLibrary(store.get().library)));assert.equal(saved.globalCustomPrompt!.text,'RETRY');assert.ok(saved.cards[turnId(cid,adapter.read().turns.at(-1)!)]!.promptState);await store.flush();store.dispose();
  const restored=new CanvasStore(adapter,new LibraryStorage('prompt-receipt'));await restored.start();await restored.sendNative('重载后不重复');assert.equal(page.versions[0]!.at(-1)!.q.includes('\n<new_instruction>\n'),false);const bad=structuredClone(saved);(bad.globalCustomPrompt as unknown as {version:number}).version=3;assert.throws(()=>validateLibrary(bad),/全局提示词/);restored.dispose();
});

test('shared global storage changes synchronize immediately without overwriting unsaved local settings',async()=>{
  localStorage.clear();const {adapter}=fixture(),key='shared-global',storage=new LibraryStorage(key),store=new CanvasStore(adapter,storage);await store.start();await store.flush();const before=localStorage.getItem(key)!;
  const incoming=structuredClone(store.get().library);incoming.globalCustomPrompt={text:'来自另一标签页',version:'external-1'};const after=JSON.stringify({[key]:packLibrary(incoming)});localStorage.setItem(key,after);window.dispatchEvent(new win.StorageEvent('storage',{key,oldValue:before,newValue:after}) as unknown as Event);assert.equal(store.get().library.globalCustomPrompt!.text,'来自另一标签页');
  store.promptSettings({customPrompt:'本标签待保存'},store.get().canvasId,'global');const newer={...incoming,globalCustomPrompt:{text:'另一个更改',version:'external-2'}};window.dispatchEvent(new win.StorageEvent('storage',{key,oldValue:after,newValue:JSON.stringify({[key]:packLibrary(newer)})}) as unknown as Event);assert.equal(store.get().library.globalCustomPrompt!.text,'本标签待保存');
  const merged=mergeLocalChanges(newer,incoming,{...incoming,drafts:{...incoming.drafts}});assert.equal(merged.globalCustomPrompt!.version,'external-2');store.dispose();
});

test('prompt settings share one global editor across boards and Apply stays disabled with no changes',async()=>{
  localStorage.clear();const {adapter}=fixture(),store=new CanvasStore(adapter);await store.start();store.promptSettings({customPrompt:'共享全局'},store.get().canvasId,'global');let cancelled=false;const container=document.createElement('div');document.body.append(container);const root=createRoot(container),Probe=()=>createElement(PromptSettings,{store,state:useSyncExternalStore(store.subscribe,store.get),onCancel:()=>{cancelled=true;}});flushSync(()=>root.render(createElement(Probe)));await new Promise(r=>setTimeout(r,10));
  try{const apply=()=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(e=>e.textContent==='应用')!;assert.equal(apply().disabled,true);assert.equal(container.querySelector<HTMLTextAreaElement>('[aria-label="自定义 Prompt"]')!.value,'共享全局');flushSync(()=>store.promptSettings({customPrompt:'同步的新值'},store.get().canvasId,'global'));await new Promise(r=>setTimeout(r,10));assert.equal(container.querySelector<HTMLTextAreaElement>('[aria-label="自定义 Prompt"]')!.value,'同步的新值');assert.equal(apply().disabled,true);container.querySelectorAll<HTMLButtonElement>('button')[1]!.click();assert.equal(cancelled,true);}finally{flushSync(()=>root.unmount());container.remove();store.dispose();}
});

test('opening guidance upgrades past defaults and describes the latest replacement instructions',()=>{
  const board={id:'b',title:'b',conversationIds:[]};
  assert.equal(openingGuidance({...board,promptPreamble:LEGACY_PREAMBLE}),DEFAULT_PREAMBLE);
  assert.equal(openingGuidance({...board,promptPreamble:PREVIOUS_PREAMBLE}),DEFAULT_PREAMBLE);
  assert.equal(openingGuidance({...board,promptPreamble:'My own guidance'}),'My own guidance');
  assert.equal(openingGuidance({...board,promptPreamble:''}),'');
  assert.match(DEFAULT_PREAMBLE,/<new_instruction> contains the latest additional instructions, replacing earlier ones, if any/);
});

test('opening-only Apply affects future roots without emitting an instruction update on either surface',async()=>{
  localStorage.clear();const {adapter,page}=fixture(),store=new CanvasStore(adapter);await store.start();
  try{
    store.newBoard();await store.refreshBoard();store.promptSettings({promptPreamble:'GUIDE ONE',customPrompt:'KEEP RULE'});store.setDraft({text:'根问题'});await store.send();
    const first=adapter.read().turns[0]!.question;assert.ok(first.startsWith('GUIDE ONE'));
    store.promptSettings({promptPreamble:'GUIDE TWO'});store.setDraft({text:'白板继续'});await store.send();
    const next=adapter.read().turns.at(-1)!.question;assert.equal(next.includes('GUIDE'),false);assert.equal(next.includes('<new_instruction>'),false);
    store.setOpen(false);store.promptSettings({promptPreamble:'GUIDE THREE'});await store.sendNative('原版继续');
    const native=page.versions[0]!.at(-1)!.q;assert.equal(native.includes('GUIDE'),false);assert.equal(native.includes('<new_instruction>'),false);
    store.setOpen(true);await store.refreshBoard();store.clearSelection(true);store.setDraft({text:'新根问题'});await store.send();
    assert.ok(adapter.read().turns[0]!.question.startsWith('GUIDE THREE'));assert.equal(Object.values(store.get().library.cards).filter(c=>c.question===first).length,1);
  }finally{store.dispose();}
});

test('legacy opening receipt versions do not cause a spurious update, while custom prompt revisions do',()=>{
  const library=mergeSnapshot(emptyLibrary(),snap()),base=Object.values(library.cards)[0]!,board={id:'b',title:'b',conversationIds:['sample'],promptPreamble:'changed guide',promptPreambleVersion:'new guide',customPrompt:'RULE',customPromptVersion:'rule-1'};
  base.promptState=JSON.stringify(['old guide','','board','rule-1']);
  assert.equal(promptSendMode(library,effectivePrompt(library,board),base,false),false);
  assert.equal(promptSendMode(library,effectivePrompt(library,{...board,customPromptVersion:'rule-2'}),base,false),'update');
  assert.equal(promptSendMode(library,effectivePrompt(library,board),base,true),true);
  assert.equal(promptSendMode(library,effectivePrompt(library,{id:'b',title:'b',conversationIds:[],promptPreambleVersion:'guide only'}),undefined,false),false);
});

test('one-pass archive masks retain fork and nested restoration semantics independent of map order',()=>{
  const {page,adapter}=fixture();let library=mergeSnapshot(emptyLibrary(),adapter.read());page.setBranch(2);library=mergeSnapshot(library,adapter.read());
  const all=Object.values(library.cards);all[1]!.archived=true;all[2]!.archived=true;
  for(const cards of [library.cards,Object.fromEntries(Object.entries(library.cards).reverse())])assert.deepEqual([...archivedCards(cards)].sort(),Object.values(cards).filter(c=>isArchived(c,cards)).map(c=>c.id).sort());
  all[1]!.archived=false;
  assert.deepEqual([...archivedCards(library.cards)].sort(),all.filter(c=>isArchived(c,library.cards)).map(c=>c.id).sort());
});

test('deep archive resolution and global preview are stack-safe and visit parent links linearly',()=>{
  const cards=cardChain(12000);let reads=0;
  for(const card of Object.values(cards)){const parent=card.parentId;Object.defineProperty(card,'parentId',{get:()=>{reads++;return parent;},configurable:true});}
  const masked=archivedCards(Object.fromEntries(Object.entries(cards).reverse()));assert.equal(masked.size,6000);assert.ok(reads<=24000,`parent reads: ${reads}`);
  const positions=previewLayout(Object.values(cards));assert.equal(positions.size,12000);assert.deepEqual(positions.get('card-11999'),{x:0,y:11999*168});
});

test('native chrome observers skip streaming text but retain images, modals and sidebar transitions',()=>{
  document.body.innerHTML='<div class="ds-message"><div class="ds-markdown"><p>before</p></div></div><aside class="b8812f16"></aside><div data-suedama="test"></div>';
  const observer=new MutationObserver(()=>{});observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
  try{
    const paragraph=document.querySelector('p')!;paragraph.firstChild!.textContent='tokens';assert.ok(observer.takeRecords().every(r=>!isChromeMutation(r)));
    paragraph.textContent='more tokens';assert.ok(observer.takeRecords().every(r=>!isChromeMutation(r)));
    const image=document.createElement('img');paragraph.append(image);assert.ok(observer.takeRecords().some(isChromeMutation));
    image.style.position='fixed';assert.ok(observer.takeRecords().some(isChromeMutation));
    const modal=document.createElement('div');modal.setAttribute('role','dialog');paragraph.append(modal);assert.ok(observer.takeRecords().some(isChromeMutation));
    modal.remove();assert.ok(observer.takeRecords().some(isChromeMutation));
    document.querySelector('aside')!.classList.add('collapsed');assert.ok(observer.takeRecords().some(isChromeMutation));
    document.querySelector('[data-suedama]')!.textContent='owned';assert.ok(observer.takeRecords().every(r=>!isChromeMutation(r)));
  }finally{observer.disconnect();document.body.replaceChildren();}
});
