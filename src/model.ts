import {parsePrompt} from './prompt';
export {composePrompt} from './prompt';
export type Role = 'user' | 'assistant' | 'reasoning';
export type Point = {x: number; y: number};
export type Viewport = Point & {zoom: number};
export type RouteStep = {userKey: string; answerKey?: string; userVersion: number; answerVersion: number; root?: boolean;signature?:string};
export type NativeTurn = RouteStep & {question: string; answer: string; reasoning?:string;reasoningLabel?:string};
export type NativeControl={id:'thinking'|'search'|'attach'|'send';label:string;svg:string;active:boolean;disabled:boolean;style:Record<string,string>};
export type Snapshot = {conversationId: string; title: string; turns: NativeTurn[]; busy: boolean; atStart?: boolean; leadingAnswerKey?: string;controls?:NativeControl[];files?:string[]};
export type Quote = {id: string; sourceId: string; role: Role; text: string; sourceText: string; start: number; end: number; number?: number; group?: string; contextType?:'answer'|'reasoning'|'question'|'turn'};
export type FilePreview={name:string;type:string;image?:string;bytes?:number};
export type Draft = {text: string; quotes: Quote[]; mode: 'continue' | 'edit'; nextQuote?: number};
export type Card = {
  id: string; conversationId: string; parentId: string | null; route: RouteStep[];
  question: string; answer: string; reasoning?:string;reasoningLabel?:string; prompt?: string; title?: string; position: Point; width: number; height: number;
  /** color is retained only to read first-prototype backups. Rendering uses the history line. */
  color: number; historyColor: number; lineId?: string; bookmarked: boolean; archived: boolean; updatedAt: number;
  annotations: Quote[]; attachments?:FilePreview[];promptState?:string;
};
export type Conversation = {id: string; title: string; activeIds: string[]; updatedAt: number;deleted?:boolean};
export type Appearance={image?:string;brightness:number;blur:number;dots:boolean;opacity?:number};
export type GlobalCustomPrompt={text:string;version:string};
export type CanvasBoard={id:string;title:string;conversationIds:string[];kind?:'standalone'|'group';order?:number;createdAt?:number;appearance?:Appearance;customPrompt?:string;promptPreamble?:string;customPromptVersion?:string;promptPreambleVersion?:string;promptScopeVersion?:string};
export type SidebarItem={kind:'board'|'session';id:string};
export type SidebarFolder={id:string;title:string;items:SidebarItem[];order:number;createdAt:number};
export type ResumeSend={boardId:string;baseId:string;conversationId?:string;originConversationId?:string;wire:string;question:string;quotes:Quote[];position:Point;size:{width:number;height:number};stage:'locate'|'submitting';fileCount?:number;id:string;createdAt:number;promptState?:string};
export type Library = {
  schema: 1; cards: Record<string, Card>; conversations: Record<string, Conversation>;
  cardAliases?:Record<string,string>;sessionOrder?:string[];recentOrder?:SidebarItem[];folders?:Record<string,SidebarFolder>;sidebarSort?:'time'|'manual';sidebarSections?:{boards:boolean;recent:boolean};defaultAppearance?:Appearance;boards?:Record<string,CanvasBoard>;activeBoardId?:string;resume?:ResumeSend;
  drafts: Record<string, Draft>; viewport?: Viewport; previewViewport?: Viewport;
  globalCustomPrompt?:GlobalCustomPrompt;
  selectedId?: string; lockedId?: string; selectionCleared?:boolean; views?:Record<string,{canvas?:Viewport;preview?:Viewport}>; revision: number;
};
// One palette per real history segment; normal and selected are two states of that palette.
export const HISTORY_COLORS = ['#D67B7B','#D5966E','#C8AC62','#8FB06E','#6AB2B0','#759AC1','#7D79BC','#9E76B7','#C57599'];
export const SELECTED_COLORS = ['#D85C5C','#D9834B','#C9A43E','#7DAA4F','#4BADAA','#5689BF','#625CB8','#8F59B2','#C45787'];
export const emptyLibrary = (): Library => ({schema: 1, cards: {}, conversations: {}, drafts: {}, revision: 0});
// Native virtual-list user keys can be negative until reload. Positive answer keys survive it.
export const turnId = (conversationId: string, turn: RouteStep) => `${conversationId}:${turn.answerKey && !turn.answerKey.startsWith('-') ? 'answer:'+turn.answerKey : 'user:'+turn.userKey}`;
export const emptyDraft = (): Draft => ({text: '', quotes: [], mode: 'continue'});
export const defaultCardSize = (bounds={width:typeof innerWidth==='number'?innerWidth:1040,height:typeof innerHeight==='number'?innerHeight:800}) => ({width:Math.max(280,Math.min(1100,bounds.width-160)*.75),height:Math.max(280,Math.min(1000,bounds.height-200))});
export const displayQuestion = (card:Card) => card.prompt ?? parsePrompt(card.question)?.userMessage ?? (card.annotations.length && card.question.startsWith('以下是我提供的引用材料：') ? card.question.split('\n\n我的问题：\n').at(-1)! : card.question);
export function turnSignature(question:string,answer:string){let hash=2166136261;for(const c of question+'\u0000'+answer)hash=Math.imul(hash^c.charCodeAt(0),16777619);return 'h'+(hash>>>0).toString(16).padStart(8,'0');}
export const sameStep = (a: RouteStep, b: RouteStep) => (b.answerKey ? a.answerKey === b.answerKey : a.userKey === b.userKey) && (!b.signature || b.signature===(a.signature??('question' in a?turnSignature(String(a.question),String((a as NativeTurn).answer)):undefined)));
export function nextCardPosition(cards:Record<string,Card>,conversationId:string,parentId:string|null,size:{width:number;height:number},ignore:string[]=[]):Point {
  const list=Object.values(cards).filter(c=>c.conversationId===conversationId && !ignore.includes(c.id));
  const parent=parentId?cards[parentId]:undefined;
  const siblings=list.filter(c=>c.parentId===parentId);
  let x=siblings.length?Math.max(...siblings.map(c=>c.position.x+c.width))+92:parent?.position.x??0;
  const y=parent?parent.position.y+parent.height+92:60;
  for(let i=0;i<=list.length;i++){
    const overlap=list.find(c=>x<c.position.x+c.width+60 && x+size.width+60>c.position.x && y<c.position.y+c.height+60 && y+size.height+60>c.position.y);
    if(!overlap)break;x=overlap.position.x+overlap.width+92;
  }
  return {x,y};
}

/** Version metadata, not discovery order, identifies an official history fork. */
export function historyLine(card:Card,cards:Record<string,Card>):string {
  if(card.lineId)return card.lineId;
  const parent=card.parentId ? cards[card.parentId] : undefined;
  const step=card.route.at(-1);
  return parent && step?.userVersion===1 && step.answerVersion===1 ? historyLine(parent,cards) : card.id;
}

/** Promotion records survive stale writes from another tab. A reused native temporary
 * key is left alone when its current question/parent belongs to a different turn. */
export function reconcileCardAliases(library:Library):Library{
  const aliases={...library.cardAliases};if(!Object.keys(aliases).length)return library;
  const raw=(id:string):string=>{const seen=new Set<string>();while(aliases[id]){if(seen.has(id))throw new Error('备份卡片替换关系循环。');seen.add(id);id=aliases[id]!;}return id;};
  for(const [from,to]of Object.entries(aliases)){if(typeof to!=='string')throw new Error('备份卡片替换关系无效。');raw(from);}
  const active={...aliases};for(const [from,to]of Object.entries(aliases)){const old=library.cards[from],target=library.cards[raw(to)];if(old&&target&&(old.question!==target.question||old.conversationId!==target.conversationId||old.route.at(-1)?.userVersion!==target.route.at(-1)?.userVersion||old.route.at(-1)?.answerVersion!==target.route.at(-1)?.answerVersion||raw(old.parentId??'')!==raw(target.parentId??'')))delete active[from];}
  const resolve=(id:string):string=>{const seen=new Set<string>();while(active[id]){if(seen.has(id))throw new Error('备份卡片替换关系循环。');seen.add(id);id=active[id]!;}return id;};
  const quote=(q:Quote):Quote=>active[q.sourceId]?{...q,sourceId:resolve(q.sourceId)}:q;
  const cards={...library.cards};for(const from of Object.keys(active)){const to=resolve(from);if(!cards[to])throw new Error('备份卡片替换目标不存在。');if(from!==to)delete cards[from];}
  for(const [id,c]of Object.entries(cards))cards[id]={...c,route:c.route.map(step=>{const source=turnId(c.conversationId,step),target=active[source]?cards[resolve(source)]?.route.at(-1):undefined;return target?{...step,userKey:target.userKey,answerKey:target.answerKey}:step;}),parentId:c.parentId?resolve(c.parentId):null,lineId:c.lineId?resolve(c.lineId):undefined,annotations:c.annotations.map(quote)};
  const drafts:Record<string,Draft>={};for(const [id,d]of Object.entries(library.drafts)){const to=resolve(id);if(!drafts[to]||id===to)drafts[to]={...d,quotes:d.quotes.map(quote)};}
  return {...library,cards,drafts,cardAliases:aliases,selectedId:library.selectedId?resolve(library.selectedId):undefined,lockedId:library.lockedId?resolve(library.lockedId):undefined,conversations:Object.fromEntries(Object.entries(library.conversations).map(([id,c])=>[id,{...c,activeIds:[...new Set(c.activeIds.map(resolve))]}]))};
}

export function mergeSnapshot(library: Library, snapshot: Snapshot): Library {
  if (!snapshot.conversationId || !snapshot.turns.length) return library;
  const cards = {...library.cards};
  const defaultSize=defaultCardSize();
  const previous = library.conversations[snapshot.conversationId];
  const activeIds: string[] = [];
  let parentId: string | null = null;
  let route: RouteStep[] = [];
  let changed = previous?.title !== snapshot.title;
  const promoted = new Map<string,string>();
  for (const [index, incomingTurn] of snapshot.turns.entries()) {
    // Ignore a late observer notification for a key already replaced by its official identity.
    let turn=incomingTurn,alias=library.cardAliases?.[turnId(snapshot.conversationId,turn)];const seen=new Set<string>();
    while(alias&&library.cardAliases?.[alias]&&!seen.has(alias)){seen.add(alias);alias=library.cardAliases[alias];}
    const canonical=alias?cards[alias]:undefined,step=canonical?.route.at(-1);
    if(canonical&&step&&canonical.question===turn.question&&step.userVersion===turn.userVersion&&step.answerVersion===turn.answerVersion)turn={...turn,...step,answer:canonical.answer||turn.answer};
    const id = turnId(snapshot.conversationId, turn);
    const pendingId = `${snapshot.conversationId}:user:${turn.userKey}`;
    const sameUser=Object.values(cards).find(c=>c.conversationId===snapshot.conversationId&&c.question===turn.question&&c.route.at(-1)?.userKey===turn.userKey&&c.route.at(-1)?.userVersion===turn.userVersion&&c.route.at(-1)?.answerVersion===turn.answerVersion);
    const transient=Object.values(cards).filter(c=>c.conversationId===snapshot.conversationId&&c.parentId===parentId&&c.question===turn.question&&(!c.answer.trim()||!c.route.at(-1)?.answerKey||c.route.at(-1)!.answerKey!.startsWith('-'))&&c.route.at(-1)?.userVersion===turn.userVersion&&c.route.at(-1)?.answerVersion===turn.answerVersion);
    const existing = cards[id] ?? cards[pendingId] ?? sameUser ?? (transient.length===1?transient[0]:undefined);
    if (!index && snapshot.atStart===false) {
      // A virtualized suffix can start with the preceding assistant message.
      const preceding=snapshot.leadingAnswerKey ? Object.values(cards).find(c=>c.conversationId===snapshot.conversationId && c.route.at(-1)?.answerKey===snapshot.leadingAnswerKey) : undefined;
      parentId = preceding?.id ?? existing?.parentId ?? null;
      route = parentId ? cards[parentId]?.route ?? [] : [];
    }
    route = [...route, {userKey: turn.userKey, answerKey: turn.answerKey, userVersion: turn.userVersion, answerVersion: turn.answerVersion,signature:turnSignature(turn.question,turn.answer),...(!route.length ? {root:snapshot.atStart!==false} : {})}];
    const siblings = Object.values(cards).filter(c => c.conversationId === snapshot.conversationId && c.parentId === parentId && c.id !== id && c.id !== pendingId);
    const parent: Card | undefined = parentId ? cards[parentId] : undefined;
    const repairing=existing?.route[0]?.root===false && route[0]?.root===true;
    const variant=turn.userVersion>1 || turn.answerVersion>1;
    const lineId = (!repairing ? existing?.lineId : undefined) ?? (parent && !variant ? historyLine(parent,cards) : id);
    const lineMember=Object.values(cards).find(c=>c.id!==pendingId && historyLine(c,cards)===lineId);
    const historyColor = lineMember?.historyColor ?? (!repairing ? existing?.historyColor : undefined) ?? (parent ? (parent.historyColor+(variant?1+siblings.filter(c=>historyLine(c,cards)!==historyLine(parent,cards)).length:0))%HISTORY_COLORS.length : siblings.length%HISTORY_COLORS.length);
    const repairedPartial=existing?.route[0]?.root===false && route[0]?.root===true;
    const position = (repairedPartial ? undefined : existing?.position) ?? nextCardPosition(cards,snapshot.conversationId,parentId,defaultSize,[id,pendingId]);
    if (!existing || existing.question !== turn.question || existing.answer !== turn.answer || turn.reasoning!==undefined&&existing.reasoning!==turn.reasoning || turn.reasoningLabel!==undefined&&existing.reasoningLabel!==turn.reasoningLabel || JSON.stringify(existing.route) !== JSON.stringify(route)) {
      cards[id] = {...existing, id, conversationId: snapshot.conversationId, parentId,
        route, question: turn.question, prompt:parsePrompt(turn.question)?.userMessage??(existing?.question===turn.question?existing?.prompt:undefined), answer: turn.answer, reasoning:turn.reasoning??existing?.reasoning,reasoningLabel:turn.reasoningLabel??existing?.reasoningLabel, position,
        width: existing?.width ?? defaultSize.width, height: existing?.height ?? defaultSize.height,
        color: existing?.color ?? 0, lineId, historyColor: Math.max(0, historyColor), bookmarked: existing?.bookmarked ?? false,
        archived: existing?.archived ?? false, annotations: existing?.annotations ?? [], updatedAt: Date.now()};
      changed = true;
    }
    for(const ghost of [existing,...transient])if(ghost&&ghost.id!==id&&cards[ghost.id]){delete cards[ghost.id];promoted.set(ghost.id,id);changed=true;}
    activeIds.push(id);
    parentId = id;
  }
  if (JSON.stringify(previous?.activeIds) !== JSON.stringify(activeIds)) changed = true;
  if (!changed) return library;
  const drafts={...library.drafts};
  for(const [from,to] of promoted) {if(drafts[from]) {drafts[to]=drafts[from]!; delete drafts[from];}}
  const remap=(q:Quote):Quote=>promoted.has(q.sourceId)?{...q,sourceId:promoted.get(q.sourceId)!}:q;
  if(promoted.size){
    for(const [id,card] of Object.entries(cards))if(card.lineId && promoted.has(card.lineId))cards[id]={...card,lineId:promoted.get(card.lineId)};
    for(const [id,card] of Object.entries(cards))if(promoted.has(card.parentId??'') || card.annotations.some(q=>promoted.has(q.sourceId)))cards[id]={...card,parentId:promoted.get(card.parentId??'')??card.parentId,annotations:card.annotations.map(remap)};
    for(const [id,draft] of Object.entries(drafts))if(draft.quotes.some(q=>promoted.has(q.sourceId)))drafts[id]={...draft,quotes:draft.quotes.map(remap)};
  }
  const conversations={...library.conversations};
  if(promoted.size)for(const [id,c]of Object.entries(conversations))conversations[id]={...c,activeIds:c.activeIds.map(id=>promoted.get(id)??id)};
  // Viewing a previously collected branch must not promote it in "recently updated" order.
  const updatedAt=Math.max(previous?.updatedAt??0,...activeIds.map(id=>cards[id]!.updatedAt));
  return reconcileCardAliases({...library,cardAliases:{...library.cardAliases,...Object.fromEntries(promoted)}, cards, drafts, selectedId: library.selectedId ? promoted.get(library.selectedId) ?? library.selectedId : undefined, lockedId:library.lockedId?promoted.get(library.lockedId)??library.lockedId:undefined, conversations: {...conversations, [snapshot.conversationId]: {id: snapshot.conversationId, title: snapshot.title, activeIds, updatedAt}}, revision: library.revision + 1});
}

/** Selection offsets always refer to the immutable text retained in the annotation. */
export function makeQuote(card: Card, role: Role, selected: string, start?: number, sourceText?: string): Quote {
  const source = sourceText ?? (role === 'user' ? card.question : role==='reasoning'?card.reasoning??'':card.answer);
  const index = start ?? source.indexOf(selected);
  if (!selected.trim() || index < 0 || source.slice(index, index + selected.length) !== selected) throw new Error('选中文字与保存的原文不一致，请重新划选。');
  return {id: crypto.randomUUID(), sourceId: card.id, role, text: selected, sourceText: source, start: index, end: index + selected.length};
}
/** Full-turn references intentionally include the question and answer only. */
export const turnQuotes=(card:Card):Quote[]=>[makeQuote(card,'user',displayQuestion(card),undefined,displayQuestion(card)),makeQuote(card,'assistant',card.answer)].map(q=>({...q,contextType:'turn'}));
export const roleLabel=(role:Role)=>role==='user'?'用户提问':role==='reasoning'?'思考':'回答';

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const validRoute = (x: unknown): x is RouteStep[] => Array.isArray(x) && x.length > 0 && x.length < 10000 && x.every(s => object(s) && typeof s.userKey === 'string' && /^-?\w[\w.-]*$/.test(s.userKey) && (s.answerKey === undefined || typeof s.answerKey === 'string' && /^-?\w[\w.-]*$/.test(s.answerKey)) && Number.isInteger(s.userVersion) && Number(s.userVersion)>0 && Number.isInteger(s.answerVersion) && Number(s.answerVersion)>0);
export function validateLibrary(value:unknown):Library{
  if(object(value)&&value.cardAliases!==undefined){if(!object(value.cardAliases)||!object(value.cards)||!object(value.conversations)||!object(value.drafts))throw new Error('备份卡片替换关系无效。');value=reconcileCardAliases(value as unknown as Library);}
  return validateLibraryData(value);
}
function validateLibraryData(value: unknown): Library {
  if (!object(value) || value.schema !== 1 || !object(value.cards) || !object(value.conversations) || !object(value.drafts)) throw new Error('不是受支持的 suedamA 备份。');
  if(value.globalCustomPrompt!==undefined&&(!object(value.globalCustomPrompt)||typeof value.globalCustomPrompt.text!=='string'||typeof value.globalCustomPrompt.version!=='string'))throw new Error('备份全局提示词无效。');
  if(value.sessionOrder!==undefined&&(!Array.isArray(value.sessionOrder)||value.sessionOrder.some(id=>typeof id!=='string')||new Set(value.sessionOrder).size!==value.sessionOrder.length))throw new Error('备份会话排序无效。');
  if(value.recentOrder!==undefined&&(!Array.isArray(value.recentOrder)||value.recentOrder.some(i=>!object(i)||!['board','session'].includes(String(i.kind))||typeof i.id!=='string')||new Set(value.recentOrder.map(i=>i.kind+':'+i.id)).size!==value.recentOrder.length))throw new Error('备份最近排序无效。');
  if(value.sidebarSort!==undefined&&!['time','manual'].includes(String(value.sidebarSort)))throw new Error('备份侧栏排序无效。');
  if(value.sidebarSections!==undefined&&(!object(value.sidebarSections)||typeof value.sidebarSections.boards!=='boolean'||typeof value.sidebarSections.recent!=='boolean'))throw new Error('备份侧栏分区无效。');
  if(value.folders!==undefined){
    if(!object(value.folders)||Object.keys(value.folders).length>2000)throw new Error('备份整理文件夹无效。');
    const owned=new Set<string>();
    for(const [id,f]of Object.entries(value.folders)){
      if(!object(f)||f.id!==id||typeof f.title!=='string'||!finite(f.order)||!finite(f.createdAt)||!Array.isArray(f.items))throw new Error('备份整理文件夹无效。');
      for(const item of f.items){if(!object(item)||!['board','session'].includes(String(item.kind))||typeof item.id!=='string'||owned.has(item.kind+':'+item.id))throw new Error('备份整理文件夹条目无效。');owned.add(item.kind+':'+item.id);}
    }
  }
  if(value.defaultAppearance!==undefined){const a=value.defaultAppearance;if(!object(a)||!finite(a.brightness)||Number(a.brightness)<0||Number(a.brightness)>150||!finite(a.blur)||Number(a.blur)<0||Number(a.blur)>30||typeof a.dots!=='boolean'||a.opacity!==undefined&&(!finite(a.opacity)||Number(a.opacity)<0||Number(a.opacity)>100)||a.image!==undefined&&(typeof a.image!=='string'||!a.image.startsWith('data:image/')||a.image.length>8_500_000))throw new Error('备份默认外观无效。');}
  if (Object.keys(value.cards).length > 20000) throw new Error('备份卡片过多。');
  for (const [id,c] of Object.entries(value.cards)) {
    if (!object(c) || c.id !== id || typeof c.conversationId !== 'string' || !/^[\w-]+$/.test(c.conversationId) || (c.parentId !== null && typeof c.parentId !== 'string') || !validRoute(c.route) || typeof c.question !== 'string' || typeof c.answer !== 'string' || !object(c.position) || !finite(c.position.x) || !finite(c.position.y) || !finite(c.width) || !finite(c.height) || Number(c.width)<48 || Number(c.width)>2000 || Number(c.height)<48 || Number(c.height)>3000 || !Number.isInteger(c.color) || Number(c.color)<0 || Number(c.color)>=9 || !Number.isInteger(c.historyColor) || Number(c.historyColor)<0 || Number(c.historyColor)>=HISTORY_COLORS.length || typeof c.bookmarked !== 'boolean' || typeof c.archived !== 'boolean' || !Array.isArray(c.annotations)) throw new Error('备份包含无效卡片。');
  }
  for (const [id,conversation] of Object.entries(value.conversations)) {
    if(object(conversation)&&conversation.deleted!==undefined&&typeof conversation.deleted!=='boolean')throw new Error('备份会话状态无效。');
    if (!object(conversation) || conversation.id !== id || typeof conversation.title !== 'string' || !Array.isArray(conversation.activeIds) || conversation.activeIds.some(id=>typeof id !== 'string' || !Object.hasOwn(value.cards as object,id))) throw new Error('备份包含无效会话。');
  }
  const cards = value.cards as Record<string, Card>;
  if(value.selectedId!==undefined && typeof value.selectedId!=='string')throw new Error('备份选中状态无效。');
  if(value.lockedId!==undefined && typeof value.lockedId!=='string')throw new Error('备份锁定状态无效。');
  if(value.activeBoardId!==undefined&&typeof value.activeBoardId!=='string')throw new Error('备份白板状态无效。');
  if(value.selectionCleared!==undefined && typeof value.selectionCleared!=='boolean')throw new Error('备份选中状态无效。');
  for (const card of Object.values(cards)) {
    if(card.promptState!==undefined&&typeof card.promptState!=='string')throw new Error('备份提示词应用状态无效。');
    if(card.attachments!==undefined&&(!Array.isArray(card.attachments)||card.attachments.length>100||card.attachments.some(f=>!object(f)||typeof f.name!=='string'||typeof f.type!=='string'||f.bytes!==undefined&&(!finite(f.bytes)||Number(f.bytes)<0)||f.image!==undefined&&(typeof f.image!=='string'||!/^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,/i.test(f.image)||f.image.length>1_400_000))))throw new Error('备份附件预览无效。');
    if(card.reasoning!==undefined&&typeof card.reasoning!=='string'||card.reasoningLabel!==undefined&&typeof card.reasoningLabel!=='string')throw new Error('备份思考内容无效。');
    if(card.lineId!==undefined && typeof card.lineId!=='string')throw new Error('备份历史线无效。');
    if(card.title!==undefined && typeof card.title!=='string' || card.prompt!==undefined && typeof card.prompt!=='string' || !finite(card.updatedAt))throw new Error('备份卡片说明无效。');
    const seen = new Set<string>([card.id]);
    let parentId = card.parentId;
    while (parentId) {
      if (seen.has(parentId) || !Object.hasOwn(cards,parentId)) throw new Error('备份的历史连接无效。');
      seen.add(parentId); parentId = cards[parentId]!.parentId;
    }
  }
  const validQuote = (q: unknown) => object(q) && typeof q.id === 'string' && typeof q.sourceId === 'string' && Object.hasOwn(cards,q.sourceId) && (q.role === 'user' || q.role === 'assistant' || q.role==='reasoning') && (q.number===undefined||Number.isInteger(q.number)&&Number(q.number)>0) && (q.group===undefined||typeof q.group==='string') && (q.contextType===undefined||['answer','reasoning','question','turn'].includes(String(q.contextType))) && typeof q.text === 'string' && typeof q.sourceText === 'string' && Number.isInteger(q.start) && Number(q.start)>=0 && Number.isInteger(q.end) && q.end === Number(q.start)+q.text.length && q.sourceText.slice(Number(q.start),Number(q.end))===q.text;
  for (const card of Object.values(cards)) if (!card.annotations.every(validQuote)) throw new Error('备份引用无效。');
  for (const draft of Object.values(value.drafts)) if (!object(draft) || typeof draft.text !== 'string' || !Array.isArray(draft.quotes) || !draft.quotes.every(validQuote) || draft.nextQuote!==undefined&&(!Number.isInteger(draft.nextQuote)||Number(draft.nextQuote)<1) || !['edit','continue'].includes(String(draft.mode))) throw new Error('备份草稿无效。');
  if(value.boards!==undefined){
    if(!object(value.boards))throw new Error('备份白板无效。');
    const owned=new Set<string>();
    for(const [id,b]of Object.entries(value.boards)){
      if(object(b)&&b.order!==undefined&&!finite(b.order))throw new Error('备份白板排序无效。');
      if(object(b)&&b.createdAt!==undefined&&!finite(b.createdAt))throw new Error('备份白板创建时间无效。');
      if(!object(b)||b.id!==id||typeof b.title!=='string'||b.kind!==undefined&&!['standalone','group'].includes(String(b.kind))||!Array.isArray(b.conversationIds)||b.conversationIds.some(cid=>typeof cid!=='string'||!Object.hasOwn(value.conversations as object,cid)||owned.has(cid)))throw new Error('备份白板会话归属无效。');
      for(const cid of b.conversationIds)owned.add(cid as string);
      if(b.customPrompt!==undefined&&typeof b.customPrompt!=='string'||b.promptPreamble!==undefined&&typeof b.promptPreamble!=='string')throw new Error('备份白板提示词无效。');
      if(['customPromptVersion','promptPreambleVersion','promptScopeVersion'].some(key=>b[key]!==undefined&&typeof b[key]!=='string'))throw new Error('备份白板提示词无效。');
      if(b.appearance!==undefined){const a=b.appearance;if(!object(a)||!finite(a.brightness)||Number(a.brightness)<0||Number(a.brightness)>150||!finite(a.blur)||Number(a.blur)<0||Number(a.blur)>30||typeof a.dots!=='boolean'||a.opacity!==undefined&&(!finite(a.opacity)||Number(a.opacity)<0||Number(a.opacity)>100)||a.image!==undefined&&(typeof a.image!=='string'||!a.image.startsWith('data:image/')||a.image.length>8_500_000))throw new Error('备份白板外观无效。');}
    }
  }
  if(value.resume!==undefined){
    const r=value.resume;
    if(object(r)&&r.promptState!==undefined&&typeof r.promptState!=='string')throw new Error('备份提示词应用状态无效。');
    if(object(r)&&r.originConversationId!==undefined&&typeof r.originConversationId!=='string')throw new Error('未完成的来源会话记录无效。');
    if(object(r)&&r.fileCount!==undefined&&(!Number.isInteger(r.fileCount)||Number(r.fileCount)<0||Number(r.fileCount)>100))throw new Error('未完成的附件记录无效。');
    if(!object(r)||typeof r.id!=='string'||typeof r.boardId!=='string'||!object(value.boards)||!Object.hasOwn(value.boards,r.boardId)||typeof r.baseId!=='string'||typeof r.wire!=='string'||typeof r.question!=='string'||!Array.isArray(r.quotes)||!r.quotes.every(validQuote)||!['locate','submitting'].includes(String(r.stage))||!finite(r.createdAt)||!object(r.position)||!finite(r.position.x)||!finite(r.position.y)||!object(r.size)||!finite(r.size.width)||!finite(r.size.height)||r.conversationId!==undefined&&(typeof r.conversationId!=='string'||!Object.hasOwn(value.conversations,r.conversationId)))throw new Error('未完成的提交记录无效。');
  }
  const normalized=Object.fromEntries(Object.values(cards).map(card=>[card.id,{...card,lineId:historyLine(card,cards)}]));
  const colors=new Map<string,number>();
  for(const card of Object.values(normalized)){const line=card.lineId; if(!colors.has(line))colors.set(line,card.historyColor);card.historyColor=colors.get(line)!;}
  for (const key of ['viewport','previewViewport']) {
    const v = value[key]; if (v !== undefined && (!object(v) || !finite(v.x) || !finite(v.y) || !finite(v.zoom) || Number(v.zoom)<.01 || Number(v.zoom)>3)) throw new Error('备份视口无效。');
  }
  if(value.views!==undefined){
    if(!object(value.views))throw new Error('备份白板视口无效。');
    for(const view of Object.values(value.views)){
      if(!object(view))throw new Error('备份白板视口无效。');
      for(const key of ['canvas','preview']){const v=view[key];if(v!==undefined && (!object(v)||!finite(v.x)||!finite(v.y)||!finite(v.zoom)||Number(v.zoom)<.01||Number(v.zoom)>3))throw new Error('备份白板视口无效。');}
    }
  }
  // Reconstruct maps to avoid trusting imported object prototypes.
  return {...emptyLibrary(), ...value, cards: normalized, conversations: Object.fromEntries(Object.entries(value.conversations)), drafts: Object.fromEntries(Object.entries(value.drafts))} as Library;
}
