import {t,translate} from './i18n';
import {nativeRootTurn,effectivePrompt,promptSendMode,normalizePrompt,openingGuidance} from './prompt';
import {unpackLibrary} from './storage-codec';
import {LibraryStorage} from './storage';
import {composePrompt, emptyDraft, emptyLibrary, mergeSnapshot, turnId, sameStep, validateLibrary, defaultCardSize, nextCardPosition, type Card, type Draft, type Library, type Point, type Quote, type Snapshot, type Viewport,type Appearance,type NativeControl,type FilePreview} from './model';
import type {SiteAdapter} from './adapter';
import {isArchived,recolorLine,archiveLeaf} from './topology';
import {migrateBoards,boardForConversation,attachConversation,belongsToBoard,nextBoardTitle,boardAppearance} from './boards';
import {PageNavigation} from './adapter';
import {cleanFolders,withoutFolderItem,itemKey,folderForItem,recentItems} from './sidebar';
import type {SidebarItem} from './model';
export type Pending = {id: string; baseId: string; boardId:string;conversationId?:string;originConversationId?:string; question: string; wire: string; stage: string; position: Point; size: {width:number;height:number}; mode: Draft['mode']; files?:File[];filePreviews?:FilePreview[]; error?: string; archived?: boolean; quotes: Quote[]; before: Set<string>;promptState?:string};
export type State = {archiveReader?:{id:string;boardId:string};library: Library; ready: boolean; files:Record<string,File[]>;open: boolean; preview: boolean; bookmarks: boolean; previewBookmarks:boolean; archives: boolean; syncing:boolean; canvasId:string; selectedIds:string[]; canUndo:boolean; canRedo:boolean; current: Snapshot; pending?: Pending; reference?:{id:string;quotes:Quote[];surface?:'native'}; notice: string; savingError: string};
async function previewFile(file:File):Promise<FilePreview>{
  const metadata={name:file.name,type:file.type,bytes:file.size};if(!/^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(file.type))return metadata;
  try{
    if(typeof createImageBitmap==='function'){
      const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d');if(!context)return metadata;context.drawImage(bitmap,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/webp',.8);return image.length<=1_400_000?{...metadata,image}:metadata;}finally{bitmap.close();}
    }
    if(file.size<1_000_000){const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});return {...metadata,image};}
  }catch{/* A failed thumbnail must not prevent the original file from uploading. */}
  return metadata;
}
export class CanvasStore {
  private state: State = {library: emptyLibrary(), ready: false, files:{},open: false, preview: false, bookmarks: false, previewBookmarks:false, archives:false, syncing:false, canvasId:'',selectedIds:[],canUndo:false,canRedo:false,current:{conversationId:'',title:'',turns:[],busy:false},notice:'',savingError:''};
  private history:{before:Record<string,Partial<Card>>;after:Record<string,Partial<Card>>}[]=[];
  private future:typeof this.history=[];
  private listeners = new Set<()=>void>();
  private focusListeners=new Set<(position:Point,size:Point,options:{fit?:boolean;zoom?:number})=>void>();
  onFocus=(fn:(position:Point,size:Point,options:{fit?:boolean;zoom?:number})=>void)=>{this.focusListeners.add(fn);return ()=>{this.focusListeners.delete(fn);};};
  focus=(position:Point,size:Point={x:480,y:380},options:{fit?:boolean;zoom?:number}={})=>this.focusListeners.forEach(fn=>fn(position,size,options));
  private viewportReader?:{canvasId:string;preview:boolean;read:()=>Viewport};
  onViewport=(preview:boolean,read:()=>Viewport)=>{const reader={canvasId:this.state.canvasId,preview,read};this.viewportReader=reader;return()=>{if(this.viewportReader===reader)this.viewportReader=undefined;};};
  currentViewport=(preview=this.state.preview):Viewport=>{const reader=this.viewportReader;if(reader?.canvasId===this.state.canvasId&&reader.preview===preview)return reader.read();return this.savedViewport(preview)??{x:0,y:0,zoom:reader?.canvasId===this.state.canvasId?reader.read().zoom:1};};
  private saveTimer?: ReturnType<typeof setTimeout>;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private stop?: ()=>void;
  private stopGlobalPrompt?:()=>void;
  private nativeSubmission?:{wire:string;question:string;quotes:Quote[];draftId:string;before:Set<string>;promptState:string};
  private seenCapture=false;
  private sessionSwitch=0;
  private refreshRun=0;private refreshQueued=false;private refreshTask?:Promise<void>;
  constructor(readonly adapter:SiteAdapter,private storage=new LibraryStorage(),initialOpen=false){this.state.open=initialOpen;}
  get = ()=>this.state;
  subscribe = (fn: ()=>void)=>{this.listeners.add(fn); return ()=>this.listeners.delete(fn);};
  private publish(patch: Partial<State>) {this.state={...this.state,...patch}; this.listeners.forEach(fn=>fn());}
  private update(library: Library) {
    this.publish({library:cleanFolders({...library,revision:library.revision+1})});
    if(this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer=setTimeout(()=>void this.flush(),350);
  }
  async start() {
    try {
      const library=cleanFolders(migrateBoards(await this.storage.load())),resume=library.resume;
      const pending:Pending|undefined=resume?{...resume,mode:'continue',stage:'正在恢复定位',before:new Set(Object.keys(library.cards)),...(resume.fileCount?{error:'页面重载后请重新选择附件；问题和引用已保留。'}:resume.stage==='submitting'?{error:'页面在提交期间重载，请先回官网核对是否已发送。'}:Date.now()-resume.createdAt>300000?{error:'上次发送准备已过期，草稿已保留，请重新确认。'}:{})}:undefined;
      this.publish({library,ready:true,canvasId:library.activeBoardId!,pending,open:!!resume||this.state.open});
      this.stopGlobalPrompt=this.storage.watchGlobalPrompt((before,after)=>{const current=this.state.library;if(JSON.stringify(current.globalCustomPrompt)===JSON.stringify(before))this.publish({library:{...current,globalCustomPrompt:after}});});
      this.stop=this.adapter.observe(snapshot=>this.capture(snapshot));
      if(this.state.archiveReader){const id=this.state.archiveReader.id;if(library.cards[id])await this.openArchiveReader(id);else this.publish({archiveReader:undefined});}
      else if(pending && !pending.error)await this.executePending();else if(this.state.open)void this.refreshBoard();
    } catch(e) {this.publish({savingError:`本地资料读取失败，已停止自动保存：${errorText(e)}`});}
  }
  dispose(){this.stop?.();this.stopGlobalPrompt?.(); if(this.saveTimer) clearTimeout(this.saveTimer);if(this.noticeTimer)clearTimeout(this.noticeTimer); void this.flush();}
  async flush() {
    if(!this.state.ready) return;
    if(this.saveTimer) clearTimeout(this.saveTimer);
    const candidate=this.state.library;
    try {const saved=await this.storage.save(candidate);if(this.state.library===candidate && JSON.stringify(saved)!==JSON.stringify(candidate))this.publish({library:saved});if(this.state.savingError) this.publish({savingError:''});}
    catch(e){this.publish({savingError:`本地保存失败，请导出备份：${errorText(e)}`});}
  }
  private capture(snapshot: Snapshot) {
    const reading=this.state.archiveReader;if(reading&&!this.state.syncing&&snapshot.conversationId!==this.state.library.cards[reading.id]?.conversationId)this.publish({archiveReader:undefined});
    let library=mergeSnapshot(this.state.library,snapshot);
    const initial=!this.seenCapture;this.seenCapture=true;
    let canvasId=this.state.canvasId || library.activeBoardId!;
    const changedSession=!!snapshot.conversationId && snapshot.conversationId!==this.state.current.conversationId;
    const externalSwitch=changedSession&&!initial&&!this.state.pending&&!this.state.syncing;
    if(snapshot.conversationId&&library.conversations[snapshot.conversationId]){
      const owner=boardForConversation(library,snapshot.conversationId);
      if(this.state.pending && (!this.state.pending.conversationId?snapshot.conversationId!==this.state.pending.originConversationId:this.state.pending.conversationId===snapshot.conversationId)){
        canvasId=this.state.pending.boardId;
        const freshRoot=!owner&&!this.state.pending.conversationId,board=library.boards?.[canvasId];
        library=attachConversation(library,canvasId,snapshot.conversationId,snapshot.title);
        if(freshRoot&&board?.conversationIds.length){const used=new Set(Object.values(library.cards).filter(c=>!c.parentId&&board.conversationIds.includes(c.conversationId)).map(c=>c.historyColor));let color=0;while(used.has(color)&&color<8)color++;library={...library,cards:Object.fromEntries(Object.entries(library.cards).map(([id,c])=>[id,c.conversationId===snapshot.conversationId?{...c,historyColor:color}:c]))};}
      }else if(owner){if(initial&&!library.selectionCleared || externalSwitch)canvasId=owner.id;}
      else{
        const empty=library.boards?.[canvasId]?.conversationIds.length===0;
        if(!empty){canvasId=`canvas:${snapshot.conversationId}`;library={...library,boards:{...library.boards,[canvasId]:{id:canvasId,title:snapshot.title,conversationIds:[],kind:'standalone'}}};}
        library=attachConversation(library,canvasId,snapshot.conversationId,snapshot.title);
      }
    }
    if(library.activeBoardId!==canvasId)library={...library,activeBoardId:canvasId};
    const invalid=library.selectedId && (!library.cards[library.selectedId] || !belongsToBoard(library.cards[library.selectedId]!,library.boards?.[canvasId]));
    if(invalid || !library.selectionCleared && !library.selectedId && initial || externalSwitch){
      const selectedId=[...snapshot.turns].reverse().map(t=>turnId(snapshot.conversationId,t)).find(id=>library.cards[id] && !isArchived(library.cards[id]!,library.cards));
      if(selectedId!==library.selectedId)library={...library,selectedId};
      if(externalSwitch || invalid)library={...library,lockedId:undefined};
    }
    let pending=this.state.pending;let files=this.state.files;
    if(pending && !pending.error && (pending.stage==='等待模型回复'||pending.stage==='即将发送') && (!pending.conversationId?snapshot.conversationId!==pending.originConversationId:snapshot.conversationId===pending.conversationId)) {
      const activePending=pending;
      const accepted=snapshot.turns.find(t=>t.question===activePending.wire.trim() && !activePending.before.has(turnId(snapshot.conversationId,t)));
      const id=accepted && turnId(snapshot.conversationId,accepted);
      if(id && library.cards[id]) {
        const card=library.cards[id]!;
        const drafts={...library.drafts}; delete drafts[pending.baseId];
        const follow=library.selectedId===pending.baseId || pending.baseId.startsWith('root:');
        library={...library,resume:undefined,cards:{...library.cards,[id]:{...card,...pending.size,position:pending!.position,prompt:pending!.question,annotations:pending!.quotes,attachments:pending!.filePreviews,archived:pending!.archived ?? card.archived,promptState:pending.promptState}},drafts,selectedId:follow?id:library.selectedId,lockedId:library.lockedId===pending.baseId?id:library.lockedId,selectionCleared:follow?false:library.selectionCleared};
        files={...files};delete files[pending.baseId];pending=undefined;
      }
    }
    const native=this.nativeSubmission;
    if(native){const accepted=snapshot.turns.find(t=>t.question===native.wire&&!native.before.has(turnId(snapshot.conversationId,t))),id=accepted&&turnId(snapshot.conversationId,accepted);if(id&&library.cards[id]){const drafts={...library.drafts};delete drafts[native.draftId];library={...library,cards:{...library.cards,[id]:{...library.cards[id]!,prompt:native.question,annotations:native.quotes,promptState:native.promptState}},drafts};this.nativeSubmission=undefined;}}
    const changed=library!==this.state.library;
    this.publish({library,files,current:snapshot,pending,canvasId,selectedIds:library.selectedId!==this.state.library.selectedId || initial || externalSwitch ? (library.selectedId?[library.selectedId]:[]) : this.state.selectedIds});
    if(changed){if(this.saveTimer)clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>void this.flush(),350);}
    if(this.refreshQueued&&!snapshot.busy&&!pending){this.refreshQueued=false;queueMicrotask(()=>void this.refreshBoard());}
  }
  toggle=()=>this.state.archiveReader?this.closeArchiveReader():this.setOpen(!this.state.open);
  setOpen=(open:boolean)=>{const entered=open&&!this.state.open;if(!open){this.refreshRun++;this.refreshQueued=false;}this.publish({open,...(open?{archiveReader:undefined}:{}),...(!open?{syncing:false}:{})});if(entered)void this.refreshBoard();};
  togglePreview=()=>this.publish({preview:!this.state.preview,reference:undefined});
  toggleBookmarks=()=>this.publish({bookmarks:!this.state.bookmarks});
  togglePreviewBookmarks=()=>this.publish({previewBookmarks:!this.state.previewBookmarks});
  toggleArchives=()=>this.publish({archives:!this.state.archives,reference:undefined});
  returnToCanvas=()=>this.publish({archives:false,preview:false,reference:undefined});
  openBoard=(id:string)=>{
    if(!this.state.library.boards?.[id])return;
    this.refreshRun++;this.publish({archiveReader:undefined,canvasId:id,open:true,preview:false,archives:false,selectedIds:[],reference:undefined,syncing:false});
    this.update({...this.state.library,activeBoardId:id,selectedId:undefined,lockedId:undefined,selectionCleared:true});void this.refreshBoard();
  };
  newBoard=()=>{const id='canvas:'+crypto.randomUUID();this.update({...this.state.library,boards:{...this.state.library.boards,[id]:{id,title:nextBoardTitle(this.state.library),conversationIds:[],kind:'group',createdAt:Date.now(),appearance:boardAppearance(this.state.library,this.state.canvasId),order:Math.max(0,...Object.values(this.state.library.boards??{}).map(b=>b.order??0))+1}}});this.openBoard(id);return id;};
  moveSession=(cid:string,target?:string,title?:string,placement?:{before?:string;order?:string[]})=>{
    let library=this.state.library;const previousOwner=boardForConversation(library,cid)?.id,previousFolder=folderForItem(library,{kind:'session',id:cid});
    if(!library.conversations[cid])library={...library,conversations:{...library.conversations,[cid]:{id:cid,title:title??'DeepSeek 对话',activeIds:[],updatedAt:Date.now()}}};
    let id=target;
    if(!id){id='session:'+cid;library={...library,boards:{...library.boards,[id]:{id,title:library.conversations[cid]!.title,conversationIds:[],kind:'standalone'}}};}
    if(!library.boards?.[id])return;
    library=attachConversation(library,id,cid,library.conversations[cid]!.title);
    if(placement){const owner=library.boards![id]!,rest=[...(target?owner.conversationIds:placement.order??library.sessionOrder??Object.keys(library.conversations))].filter(x=>x!==cid),index=placement.before?rest.indexOf(placement.before):-1;rest.splice(index<0?rest.length:index,0,cid);library=target?{...library,boards:{...library.boards,[id]:{...owner,conversationIds:rest}}}:{...library,sessionOrder:rest};}
    if(!this.state.open&&this.state.current.conversationId===cid){this.publish({canvasId:id,selectedIds:[],reference:undefined});library={...library,activeBoardId:id,selectedId:undefined,lockedId:undefined,selectionCleared:true};}
    this.update({...withoutFolderItem(library,{kind:'session',id:cid}),...(placement?{sidebarSort:'manual' as const}:{})});this.notice(!target&&previousFolder?'已移出文件夹。':placement&&previousOwner===id?'已调整会话位置。':target?'已移入白板。':'已移出白板，保留原官方会话。');
  };
  moveSessionToNewBoard=(cid:string,title?:string)=>{const id=this.newBoard();this.moveSession(cid,id,title);return id;};
  reorderBoards=(id:string,before?:string)=>{const groups=Object.values(this.state.library.boards??{}).filter(b=>b.kind==='group').sort((a,b)=>(a.order??0)-(b.order??0)),source=groups.find(b=>b.id===id);if(!source||before===id)return;const rest=groups.filter(b=>b.id!==id),index=before?rest.findIndex(b=>b.id===before):-1;rest.splice(index<0?rest.length:index,0,source);const boards={...this.state.library.boards};rest.forEach((b,i)=>boards[b.id]={...b,order:i});this.update({...withoutFolderItem(this.state.library,{kind:'board',id}),boards,sidebarSort:'manual'});};
  reorderRecent=(item:SidebarItem,before?:SidebarItem,nativeIds:string[]=[])=>{
    if(before&&itemKey(before)===itemKey(item))return;
    let library=this.state.library;if(item.kind==='session'&&boardForConversation(library,item.id)?.kind==='group')this.moveSession(item.id);else if(folderForItem(library,item))this.moveSidebarItem(item);
    library=this.state.library;const rest=recentItems({...library,sidebarSort:'manual'},nativeIds).filter(i=>itemKey(i)!==itemKey(item)),index=before?rest.findIndex(i=>itemKey(i)===itemKey(before)):-1;rest.splice(index<0?rest.length:index,0,item);
    this.update({...library,recentOrder:rest,sessionOrder:rest.filter(i=>i.kind==='session').map(i=>i.id),sidebarSort:'manual'});
  };
  promptSettings=(patch:{customPrompt?:string;promptPreamble?:string;inheritGlobal?:boolean},id=this.state.canvasId,scope:'board'|'global'='board')=>{
    let library=this.state.library;const board=library.boards?.[id];let next=board,changed=false;
    if(board&&patch.promptPreamble!==undefined&&normalizePrompt(patch.promptPreamble)!==normalizePrompt(openingGuidance(board))){next={...board,promptPreamble:normalizePrompt(patch.promptPreamble),promptPreambleVersion:crypto.randomUUID()};changed=true;}
    if(scope==='board'&&patch.inheritGlobal&&next?.customPrompt!==undefined){const {customPrompt,customPromptVersion,...rest}=next;next={...rest,promptScopeVersion:crypto.randomUUID()};changed=true;}
    else if(patch.customPrompt!==undefined){const text=normalizePrompt(patch.customPrompt),before=scope==='global'?library.globalCustomPrompt?.text??'':board?.customPrompt??library.globalCustomPrompt?.text??'';
      if(text!==normalizePrompt(before)){if(scope==='global')library={...library,globalCustomPrompt:{text,version:crypto.randomUUID()}};else if(next)next={...next,customPrompt:text,customPromptVersion:crypto.randomUUID()};changed=scope==='global'||!!next||changed;}
    }
    if(!changed)return false;if(next&&next!==board)library={...library,boards:{...library.boards,[id]:next}};this.update(library);return true;
  };
  inheritGlobalPrompt=(id=this.state.canvasId)=>this.promptSettings({inheritGlobal:true},id);
  setSidebarSort=(sidebarSort:'time'|'manual')=>this.update({...this.state.library,sidebarSort});
  toggleSidebarSection=(section:'boards'|'recent')=>{const sections={boards:true,recent:true,...this.state.library.sidebarSections};this.update({...this.state.library,sidebarSections:{...sections,[section]:!sections[section]}});};
  newFolder=()=>{let n=1;const folders=this.state.library.folders??{},used=new Set(Object.values(folders).map(f=>f.title));while(used.has(translate('文件夹{0}','zh',{'0':n}))||used.has(translate('文件夹{0}','en',{'0':n})))n++;const id='folder:'+crypto.randomUUID();this.update({...this.state.library,folders:{...folders,[id]:{id,title:t('文件夹{0}',{'0':n}),items:[],order:Math.min(0,...Object.values(folders).map(f=>f.order))-1,createdAt:Date.now()}}});return id;};
  renameFolder=(id:string,title:string)=>{const folder=this.state.library.folders?.[id];if(folder&&title.trim())this.update({...this.state.library,folders:{...this.state.library.folders,[id]:{...folder,title:title.trim()}}});};
  moveSidebarItem=(item:SidebarItem,folderId?:string,before?:SidebarItem,title?:string)=>{
    if(folderId&&!this.state.library.folders?.[folderId]||before&&itemKey(before)===itemKey(item))return;
    let library=this.state.library;
    if(item.kind==='session'){
      if(!library.conversations[item.id])library={...library,conversations:{...library.conversations,[item.id]:{id:item.id,title:title??'DeepSeek 对话',activeIds:[],updatedAt:Date.now()}}};
      library=migrateBoards(library);const owner=boardForConversation(library,item.id);
      if(owner?.kind==='group'){const id='session:'+item.id;library={...library,boards:{...library.boards,[id]:{id,title:library.conversations[item.id]!.title,kind:'standalone',conversationIds:[]}}};library=attachConversation(library,id,item.id,library.conversations[item.id]!.title);}
    }else if(library.boards?.[item.id]?.kind!=='group')return;
    library=withoutFolderItem(library,item);
    if(folderId){const folder=library.folders![folderId]!,items=[...folder.items],index=before?items.findIndex(i=>itemKey(i)===itemKey(before)):-1;items.splice(index<0?items.length:index,0,item);library={...library,folders:{...library.folders,[folderId]:{...folder,items}}};}
    this.update({...library,sidebarSort:'manual'});
  };
  reorderFolders=(id:string,before?:string)=>{const folders=Object.values(this.state.library.folders??{}).sort((a,b)=>a.order-b.order),source=folders.find(f=>f.id===id);if(!source||id===before)return;const rest=folders.filter(f=>f.id!==id),index=before?rest.findIndex(f=>f.id===before):-1;rest.splice(index<0?rest.length:index,0,source);this.update({...this.state.library,sidebarSort:'manual',folders:Object.fromEntries(rest.map((f,order)=>[f.id,{...f,order}]))});};
  deleteFolder=async(id:string,includeContents=false)=>{
    const folder=this.state.library.folders?.[id];if(!folder)return;
    if(includeContents){this.refreshRun++;this.publish({syncing:true});try{await this.refreshTask;if(!this.adapter.deleteConversation)throw new Error('官网会话删除适配不可用。');const ids=new Set(folder.items.flatMap(item=>item.kind==='session'?[item.id]:this.state.library.boards?.[item.id]?.conversationIds??[]));for(const cid of ids){await this.adapter.deleteConversation(cid);this.forgetSession(cid);}
      const boards={...this.state.library.boards};for(const item of folder.items)if(item.kind==='board')delete boards[item.id];const library=migrateBoards({...this.state.library,boards});this.update(library);if(!boards[this.state.canvasId])this.publish({canvasId:library.activeBoardId!,open:false,selectedIds:[],reference:undefined});
    }finally{this.publish({syncing:false});}}
    const folders={...this.state.library.folders};delete folders[id];this.update({...this.state.library,folders});await this.flush();
  };
  renameBoard=(title:string,id=this.state.canvasId)=>{const b=this.state.library.boards?.[id];if(b&&title.trim())this.update({...this.state.library,boards:{...this.state.library.boards,[id]:{...b,title:title.trim()}}});};
  appearance=(patch:Partial<Appearance>,id=this.state.canvasId)=>{const b=this.state.library.boards?.[id];if(b){const appearance={...boardAppearance(this.state.library,id),...patch};this.update({...this.state.library,defaultAppearance:appearance,boards:{...this.state.library.boards,[id]:{...b,appearance}}});}};
  navigation=async(action:'expand'|'search'|'account')=>{try{await this.adapter.navigation?.(action);}catch(e){this.notice(errorText(e));}};
  newChat=async()=>{if(this.state.open){this.clearSelection(true);this.returnToCanvas();}else try{await this.adapter.newConversation?.();}catch(e){this.notice(errorText(e));}};
  files=(id=this.draftKey())=>id?this.state.files[id]??[]:[];
  addFiles=(incoming:File[],id=this.draftKey())=>{
    if(!id||this.state.pending&&!this.state.pending.error)return;const files=[...this.files(id)];
    for(const file of incoming){if(files.length>=100){this.notice('每份草稿最多保留 100 个附件。');break;}if(!files.some(f=>f.name===file.name&&f.size===file.size&&f.lastModified===file.lastModified))files.push(file);}
    this.publish({files:{...this.state.files,[id]:files}});
  };
  removeFile=(index:number,id=this.draftKey())=>{if(id)this.publish({files:{...this.state.files,[id]:this.files(id).filter((_,i)=>i!==index)}});};
  refreshBoard=async()=>{
    const run=++this.refreshRun,prior=this.refreshTask;
    const work=(async()=>{await prior?.catch(()=>{});if(run===this.refreshRun)await this.collectBoard(run);})();this.refreshTask=work;
    try{await work;}finally{if(this.refreshTask===work)this.refreshTask=undefined;}
  };
  private collectBoard=async(run:number)=>{
    const {canvasId,current,pending}=this.state,board=this.state.library.boards?.[canvasId];if(!this.state.ready||!board||!this.adapter.scanCurrent||this.state.syncing)return;
    if(current.busy||pending&&!pending.error){this.refreshQueued=true;return;}
    if(current.files?.length)return;
    const ids=board.conversationIds.filter(id=>!this.state.library.conversations[id]?.deleted);if(!ids.length)return;
    this.publish({syncing:true});let failed=0;
    try{for(const id of ids){if(run!==this.refreshRun||!this.state.open)break;try{if(this.adapter.read().conversationId!==id)await this.adapter.openConversation?.(id,true);if(this.adapter.read().conversationId!==id)continue;const snapshot=await this.adapter.scanCurrent();if(run===this.refreshRun)this.capture(snapshot);}catch{failed++;}}
      if(run===this.refreshRun&&current.conversationId&&this.adapter.read().conversationId!==current.conversationId)try{await this.adapter.openConversation?.(current.conversationId,true);}catch{}
    }finally{if(run===this.refreshRun){this.publish({syncing:false});if(failed)this.notice('部分会话尚未由官网加载，已保留快照；可进入该会话后重试刷新。');}}
  };
  openNativeSession=async(id:string,title?:string)=>{
    if(this.state.pending&&!this.state.pending.error){this.notice('正在发送，请稍后切换会话。');return;}
    if(this.state.archiveReader)this.publish({archiveReader:undefined});
    const keepCanvas=this.state.open,request=++this.sessionSwitch;this.refreshRun++;
    try{
      await this.refreshTask;if(request!==this.sessionSwitch)return;
      if(this.adapter.read().busy)throw new Error('官网正在生成，请先完成或停止后再切换会话。');
      if(keepCanvas){
        let library=this.state.library;if(!library.conversations[id])library={...library,conversations:{...library.conversations,[id]:{id,title:title??'DeepSeek 对话',activeIds:[],updatedAt:Date.now()}}};
        library=migrateBoards(library);const owner=boardForConversation(library,id)!;
        const selectedId=[...library.conversations[id]!.activeIds].reverse().find(key=>library.cards[key]&&!isArchived(library.cards[key]!,library.cards));
        this.publish({canvasId:owner.id,selectedIds:selectedId?[selectedId]:[],syncing:true,preview:false,archives:false,reference:undefined});
        this.update({...library,activeBoardId:owner.id,selectedId,lockedId:undefined,selectionCleared:!selectedId});
      }else this.publish({syncing:true});
      await this.adapter.openConversation?.(id);if(request!==this.sessionSwitch)return;
      this.capture(this.adapter.read());this.publish({syncing:false});
      if(keepCanvas){
        const selectedId=this.state.library.conversations[id]?.activeIds.at(-1),card=selectedId&&this.state.library.cards[selectedId];
        if(card&&!isArchived(card,this.state.library.cards)){this.select(card.id);requestAnimationFrame(()=>{if(request===this.sessionSwitch)this.focus(card.position,{x:card.width,y:card.height});});}
        void this.refreshBoard();
      }
    }catch(e){if(request!==this.sessionSwitch)return;this.publish({syncing:false});if(e instanceof PageNavigation){await this.flush();return;}this.notice(errorText(e));}
  };
  prepareArchiveReader=(reader:{id:string;boardId:string})=>this.publish({archiveReader:reader,open:false});
  openArchiveReader=async(id:string)=>{
    const leaf=archiveLeaf(this.state.library,id),board=leaf&&boardForConversation(this.state.library,leaf.conversationId);if(!leaf||!board)return;
    if(this.state.pending&&!this.state.pending.error||this.adapter.read().busy){this.notice('请先完成当前发送或生成，再查看归档。');return;}
    const request=++this.sessionSwitch;this.refreshRun++;
    try{await this.refreshTask;if(request!==this.sessionSwitch)return;this.publish({archiveReader:{id,boardId:board.id},open:false,archives:false,syncing:true,preview:false,reference:undefined});
      await this.adapter.reveal(leaf.conversationId,leaf.route);if(request!==this.sessionSwitch)return;this.capture(this.adapter.read());this.publish({syncing:false});
    }catch(e){if(request!==this.sessionSwitch)return;this.publish({syncing:false});if(e instanceof PageNavigation){await this.flush();return;}this.closeArchiveReader();this.notice(errorText(e));}
  };
  closeArchiveReader=()=>{const reader=this.state.archiveReader;if(!reader)return;this.sessionSwitch++;const library=this.state.library,selected=library.cards[library.selectedId??''],selectedId=selected&&belongsToBoard(selected,library.boards?.[reader.boardId])&&!isArchived(selected,library.cards)?selected.id:undefined;this.publish({archiveReader:undefined,open:true,archives:true,preview:false,syncing:false,canvasId:reader.boardId,selectedIds:selectedId?[selectedId]:[],reference:undefined});this.update({...library,activeBoardId:reader.boardId,selectedId,lockedId:undefined,selectionCleared:!selectedId});};
  manageSession=async(id:string,action:'pin'|'share'|'multi'|'delete')=>{try{if(action==='multi')this.setOpen(false);if(action==='delete'&&this.adapter.requestDeleteConversation){if(await this.adapter.requestDeleteConversation(id))this.forgetSession(id);}else await this.adapter.sessionAction?.(id,action);}catch(e){this.notice(errorText(e));}};
  private forgetSession=(id:string)=>{const library=this.state.library,c=library.conversations[id];if(!c)return;this.update({...library,conversations:{...library.conversations,[id]:{...c,deleted:true}},cards:Object.fromEntries(Object.entries(library.cards).map(([key,c])=>[key,c.conversationId===id?{...c,archived:true}:c])),boards:Object.fromEntries(Object.entries(library.boards??{}).map(([key,b])=>[key,{...b,conversationIds:b.conversationIds.filter(cid=>cid!==id)}])),selectedId:library.cards[library.selectedId??'']?.conversationId===id?undefined:library.selectedId,lockedId:library.cards[library.lockedId??'']?.conversationId===id?undefined:library.lockedId});this.publish({selectedIds:this.state.selectedIds.filter(key=>library.cards[key]?.conversationId!==id)});};
  renameSession=async(id:string,title:string)=>{if(!title.trim())return;await this.adapter.renameConversation?.(id,title.trim());const c=this.state.library.conversations[id];if(c)this.update({...this.state.library,conversations:{...this.state.library.conversations,[id]:{...c,title:title.trim()}}});};
  deleteBoard=async(id:string,includeSessions=false)=>{
    const board=this.state.library.boards?.[id];if(!board)return;this.refreshRun++;this.publish({syncing:true});
    try{
      if(includeSessions){await this.refreshTask;if(!this.adapter.deleteConversation)throw new Error('官网会话删除适配不可用。');for(const cid of board.conversationIds){await this.adapter.deleteConversation(cid);this.forgetSession(cid);}}
      else for(const cid of board.conversationIds)this.moveSession(cid);
      const boards={...this.state.library.boards};delete boards[id];const library=migrateBoards({...this.state.library,boards,activeBoardId:undefined,selectedId:undefined,lockedId:undefined,selectionCleared:true});
      this.update(library);this.publish({canvasId:library.activeBoardId!,selectedIds:[],reference:undefined,open:false});await this.flush();
    }finally{this.publish({syncing:false});}
  };
  nativeAction=async(id:NativeControl['id'])=>{
    try{
      if(id==='attach'){
        const card=this.state.library.cards[this.anchorId()??''];
        if(card){await this.adapter.openConversation?.(card.conversationId);}
        else await this.adapter.newConversation?.();
      }
      this.adapter.nativeAction?.(id);
    }catch(e){if(e instanceof PageNavigation){await this.flush();return;}this.notice(errorText(e));}
  };
  sync=async()=>{
    if(this.state.syncing || this.state.pending && !this.state.pending.error)return;
    if(!this.adapter.scanCurrent)return;
    this.publish({syncing:true});
    try{const snapshot=await this.adapter.scanCurrent();this.capture(snapshot);this.notice(`已收集当前线路的 ${snapshot.turns.length} 轮对话。`);}
    catch(e){this.notice(errorText(e));}finally{this.publish({syncing:false});}
  };
  notice=(text: string)=>{
    if(this.noticeTimer) clearTimeout(this.noticeTimer);
    this.publish({notice:text});
    if(text) this.noticeTimer=setTimeout(()=>this.publish({notice:''}),6500);
  };
  anchorId=()=>this.state.library.lockedId ?? (this.state.selectedIds.length>1?undefined:this.state.library.selectedId);
  draftKey=()=>this.anchorId()??(this.state.selectedIds.length>1?undefined:`root:${this.state.canvasId}`);
  select=(id?: string,additive=false)=>{
    if(id===this.state.pending?.id && id){this.publish({selectedIds:[id]});return;}
    const selectedIds=additive && id ? this.state.selectedIds.includes(id)?this.state.selectedIds.filter(key=>key!==id):[...this.state.selectedIds,id] : id?[id]:[];
    const board=id&&this.state.library.cards[id]?boardForConversation(this.state.library,this.state.library.cards[id]!.conversationId):undefined;
    const different=board&&board.id!==this.state.canvasId;
    this.publish({selectedIds,reference:undefined,...(different?{canvasId:board.id}:{})});
    const lockedId=different?undefined:this.state.library.lockedId;
    this.update({...this.state.library,selectedId:selectedIds.at(-1),lockedId,selectionCleared:!selectedIds.length,...(different?{activeBoardId:board.id}:{})});
  };
  selectMany=(ids:string[])=>{this.publish({selectedIds:ids});this.update({...this.state.library,selectedId:ids.at(-1)});};
  clearSelection=(unlock=false)=>{this.publish({selectedIds:[],reference:undefined});this.update({...this.state.library,selectedId:undefined,lockedId:unlock?undefined:this.state.library.lockedId,selectionCleared:true});};
  secondarySelect=(id:string)=>this.lock(id,true);
  jumpReference=(quotes:Quote[])=>{
    const card=this.state.library.cards[quotes[0]?.sourceId??''];if(!card)return;
    const zoom=this.currentViewport().zoom;
    const board=boardForConversation(this.state.library,card.conversationId);if(board && board.id!==this.state.canvasId)this.openBoard(board.id);else if(!this.state.open)this.setOpen(true);
    // Seed the destination before it mounts, including jumps out of preview or another board.
    // Otherwise its saved zoom would flash first, then animate to the departure scale.
    this.viewport({...this.currentViewport(false),zoom},false);
    this.publish({preview:false,archives:isArchived(card,this.state.library.cards),reference:{id:crypto.randomUUID(),quotes}});
    requestAnimationFrame(()=>this.focus(card.position,{x:card.width,y:card.height},{zoom}));
  };
  jumpNativeReference=async(quotes:Quote[])=>{
    const card=this.state.library.cards[quotes[0]?.sourceId??''];if(!card||this.state.open)return;
    if(this.state.pending&&!this.state.pending.error){this.notice('正在发送，请稍后再切换网页分支。');return;}
    const request=++this.sessionSwitch;
    try{
      this.publish({reference:undefined});
      const snapshot=this.adapter.read(),step=card.route.at(-1);
      if(snapshot.conversationId!==card.conversationId||!step||!snapshot.turns.some(turn=>sameStep(turn,step))){
        // Do not fall back to a page reload that would discard this local highlight intent.
        if(snapshot.conversationId!==card.conversationId&&this.adapter.openConversation)try{await this.adapter.openConversation(card.conversationId,true);}catch(e){if(errorText(e).includes('已跳过自动刷新'))throw new Error('来源会话尚未载入官网侧栏，请先打开该会话后再定位引用。');throw e;}
        if(request!==this.sessionSwitch||this.state.open)return;
        this.publish({syncing:true});await this.adapter.locate(card.conversationId,card.route);
        if(request!==this.sessionSwitch||this.state.open)return;this.capture(this.adapter.read());
        const owner=boardForConversation(this.state.library,card.conversationId);if(owner&&owner.id!==this.state.canvasId)this.select(card.id);
      }
      if(request===this.sessionSwitch&&!this.state.open)this.publish({syncing:false,reference:{id:crypto.randomUUID(),quotes,surface:'native'}});
    }catch(e){if(request!==this.sessionSwitch)return;if(e instanceof PageNavigation){await this.flush();return;}this.notice(errorText(e));}
    finally{if(request===this.sessionSwitch)this.publish({syncing:false});}
  };
  lock=(id:string,force=false)=>{this.select(id);this.update({...this.state.library,lockedId:force?id:this.state.library.lockedId===id?undefined:id});};
  private commitCards(cards:Record<string,Card>){
    const before:Record<string,Partial<Card>>={},after:typeof before={};
    for(const [id,card] of Object.entries(cards)){
      const old=this.state.library.cards[id];if(!old || old===card)continue;
      for(const field of ['position','width','height','historyColor','archived','bookmarked'] as const)if(JSON.stringify(old[field])!==JSON.stringify(card[field])){
        before[id]={...before[id],[field]:old[field]};after[id]={...after[id],[field]:card[field]};
      }
    }
    if(!Object.keys(after).length)return;
    this.history.push({before,after});if(this.history.length>80)this.history.shift();this.future=[];
    this.publish({canUndo:true,canRedo:false});this.update({...this.state.library,cards});
  }
  replay=(direction:'undo'|'redo')=>{
    const from=direction==='undo'?this.history:this.future,to=direction==='undo'?this.future:this.history;
    const entry=from.pop();if(!entry)return;to.push(entry);
    const cards={...this.state.library.cards};for(const [id,patch]of Object.entries(entry[direction==='undo'?'before':'after']))if(cards[id])cards[id]={...cards[id]!,...patch};
    this.publish({canUndo:!!this.history.length,canRedo:!!this.future.length});this.update({...this.state.library,cards});
  };
  colorLine=(id:string,color:number)=>this.commitCards(recolorLine(this.state.library.cards,id,color));
  archive=(id:string)=>{
    const card=this.state.library.cards[id];if(!card)return;
    this.patchCard(id,{archived:!card.archived});
    const {library}=this.state;
    if(library.selectedId && isArchived(library.cards[library.selectedId]!,library.cards))this.select();
    if(library.lockedId && isArchived(library.cards[library.lockedId]!,library.cards))this.update({...this.state.library,lockedId:undefined});
  };
  patchCard=(id: string,patch: Partial<Card>)=>{
    const card=this.state.library.cards[id];
    if(card){
      const cards={...this.state.library.cards,[id]:{...card,...patch,updatedAt:Date.now()}};
      this.commitCards(cards);
    }
  };
  move=(moves: {id: string; position: Point}[])=>{
    const waiting=moves.find(move=>move.id===this.state.pending?.id);
    if(waiting && this.state.pending)this.publish({pending:{...this.state.pending,position:waiting.position}});
    const cards={...this.state.library.cards};
    for(const move of moves) if(cards[move.id]) cards[move.id]={...cards[move.id]!,position:move.position};
    this.commitCards(cards);
  };
  savedViewport=(preview:boolean)=>this.state.library.views?.[this.state.canvasId]?.[preview?'preview':'canvas'] ?? (!this.state.library.views?this.state.library[preview?'previewViewport':'viewport']:undefined);
  viewport=(viewport: Viewport,preview: boolean)=>{
    const {library,canvasId}=this.state;
    this.update({...library,views:{...library.views,[canvasId]:{...library.views?.[canvasId],[preview?'preview':'canvas']:viewport}},[preview?'previewViewport':'viewport']:viewport});
  };
  draft(id=this.draftKey()) {return id ? this.state.library.drafts[id] ?? emptyDraft() : emptyDraft();}
  setDraft=(patch: Partial<Draft>,id=this.draftKey())=>{
    if(id) this.update({...this.state.library,drafts:{...this.state.library.drafts,[id]:{...this.draft(id),...patch}}});
  };
  quote=(quote: Quote,id=this.draftKey())=>this.quoteMany([quote],id);
  quoteMany=(quotes:Quote[],id=this.draftKey())=>{
    if(!id || !this.state.library.cards[id]&&!id.startsWith('root:')&&!id.startsWith('native:')) {this.notice('请先确定接收引用的问题。'); return;}
    const draft=this.draft(id);
    const unique=quotes.filter(quote=>!draft.quotes.some(q=>q.sourceId===quote.sourceId && q.role===quote.role && q.start===quote.start && q.text===quote.text));if(!unique.length)return;
    const number=Math.max(draft.nextQuote??1,...draft.quotes.map(q=>(q.number??0)+1));const group=crypto.randomUUID();
    this.setDraft({quotes:[...draft.quotes,...unique.map(q=>({...q,number,group}))],nextQuote:number+1},id);
    this.notice('已加入当前问题的注释。');
  };
  nativeDraftKey=()=>`native:${this.state.current.conversationId||'new'}`;
  async sendNative(text:string){
    if(this.nativeSubmission||this.state.current.busy||this.state.archiveReader)return;
    const snapshot=this.adapter.read(),draftId=`native:${snapshot.conversationId||'new'}`,draft=this.draft(draftId),library=this.state.library,settings=effectivePrompt(library,boardForConversation(library,snapshot.conversationId)),last=snapshot.turns.at(-1),base=last?library.cards[turnId(snapshot.conversationId,last)]??Object.values(library.cards).find(card=>card.conversationId===snapshot.conversationId&&card.route.at(-1)&&sameStep(card.route.at(-1)!,last)):undefined;
    const question=text.trim()||'请查看附件。',wire=composePrompt({...draft,text:question},settings.instruction,settings.preamble,promptSendMode(library,settings,base,nativeRootTurn(snapshot,library)));
    this.nativeSubmission={wire,question,quotes:structuredClone(draft.quotes),draftId,before:new Set(Object.keys(library.cards)),promptState:settings.state};
    try{if(!this.adapter.submitNative)throw new Error('官网发送适配不可用。');await this.adapter.submitNative(wire);this.capture(this.adapter.read());}
    catch(e){this.nativeSubmission=undefined;this.notice(errorText(e));}
  }
  locate=async(id: string)=>{
    if(this.state.pending && !this.state.pending.error){this.notice('正在发送，请稍后再切换网页分支。');return;}
    const card=this.state.library.cards[id]; if(!card) return;
    try {await this.adapter.reveal(card.conversationId,card.route); this.setOpen(false);}
    catch(e){this.notice(errorText(e));}
  };
  returnNative=async()=>{
    this.refreshRun++;await this.refreshTask;this.publish({syncing:false});
    const card=this.state.library.cards[this.anchorId()??''];
    if(card)return this.locate(card.id);
    try{await this.adapter.newConversation?.();this.setOpen(false);}catch(e){if(e instanceof PageNavigation){await this.flush();return;}this.notice(errorText(e));}
  };
  async send() {
    if(this.state.archiveReader){this.notice('归档内容只读，返回白板后再提问。');return;}
    if(this.state.syncing || this.state.current.busy){this.notice('网页正在处理，请稍后发送。');return;}
    const id=this.draftKey();
    const card=id ? this.state.library.cards[id] : undefined;
    if(!id) {this.notice('请先选择一张 card，或在空白处取消选中后新建根线路。');return;}
    if(this.state.pending && !this.state.pending.error) return;
    const draft=this.draft(id);
    if(!draft.text.trim()&&!this.files(id).length&&!this.state.current.files?.length) return;
    const currentBoard=this.state.library.boards?.[this.state.canvasId];
    if(!card&&currentBoard?.kind==='standalone'&&currentBoard.conversationIds.length)this.update({...this.state.library,boards:{...this.state.library.boards,[currentBoard.id]:{...currentBoard,kind:'group',title:nextBoardTitle(this.state.library)}}});
    const files=this.files(id);
    const settings=effectivePrompt(this.state.library,this.state.library.boards?.[this.state.canvasId]);
    const wire=composePrompt({...draft,text:draft.text.trim()||'请查看附件。'},settings.instruction,settings.preamble,promptSendMode(this.state.library,settings,card,!card));
    const size=defaultCardSize();
    const boardCards=Object.values(this.state.library.cards).filter(c=>belongsToBoard(c,this.state.library.boards?.[this.state.canvasId]));
    const position=card?nextCardPosition(this.state.library.cards,card.conversationId,card.id,size):{x:boardCards.length?Math.max(...boardCards.map(c=>c.position.x+c.width))+92:0,y:60};
    const pending: Pending={id:`pending:${crypto.randomUUID()}`,baseId:id,boardId:this.state.canvasId,conversationId:card?.conversationId,originConversationId:this.state.current.conversationId,question:draft.text,wire,mode:'continue',size,stage:'正在定位分支',quotes:structuredClone(draft.quotes),files,before:new Set([...Object.keys(this.state.library.cards),...this.state.current.turns.map(t=>turnId(this.state.current.conversationId,t))]),position,promptState:settings.state};
    this.publish({pending});
    this.update({...this.state.library,resume:{id:pending.id,boardId:pending.boardId,baseId:id,conversationId:pending.conversationId,originConversationId:pending.originConversationId,question:pending.question,wire,quotes:pending.quotes,position,size,stage:'locate',fileCount:files.length||this.state.current.files?.length||0,createdAt:Date.now(),promptState:settings.state}});
    await this.flush();
    await this.executePending();
  }
  private async executePending(){
    const pending=this.state.pending;if(!pending || pending.error)return;
    const card=this.state.library.cards[pending.baseId];
    try {
      if(!card){if(!this.adapter.newConversation)throw new Error('当前网页适配器不支持新建根线路。');await this.adapter.newConversation();}
      if(pending.files?.length)pending.filePreviews=await Promise.all(pending.files.map(previewFile));
      await this.adapter.send(card?.conversationId??'',card?.route??[],pending.wire,'continue',async stage=>{
      if(this.state.pending?.id===pending.id){
        this.publish({pending:{...this.state.pending,stage}});
        if(stage==='即将发送' && this.state.library.resume){this.update({...this.state.library,resume:{...this.state.library.resume,stage:'submitting'}});await this.flush();}
      }
    },pending.files); this.capture(this.adapter.read());}
    catch(e){if(e instanceof PageNavigation){await this.flush();return;}if(this.state.pending?.id===pending.id) this.publish({pending:{...this.state.pending,error:errorText(e),stage:'发送未完成'}}); else this.notice(errorText(e));}
  }
  dismissPending=()=>{if(this.state.pending && !this.state.pending.error){this.notice('仍在确认发送结果，请先回到网页核对。');return;}this.publish({pending:undefined});this.update({...this.state.library,resume:undefined});};
  archivePending=()=>this.state.pending && this.publish({pending:{...this.state.pending,archived:!this.state.pending.archived}});
  async importBackup(text: string) {
    const imported=validateLibrary(unpackLibrary(JSON.parse(text)));
    const current=this.state.library;
    // Merge instead of replacing: importing an older export cannot delete newer local cards/drafts.
    const cards={...imported.cards,...current.cards};
    const library=migrateBoards({...imported,...current,resume:current.resume,cards,boards:{...imported.boards,...current.boards},conversations:{...imported.conversations,...current.conversations},drafts:{...imported.drafts,...current.drafts}});
    this.update(library); await this.flush(); this.notice('已合并导入备份。');
  }
}
export function errorText(error: unknown) {return error instanceof Error ? error.message : String(error);}
