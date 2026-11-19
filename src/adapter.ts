import {readMarkdown} from './markdown';
import {isOwnedMutation} from './dom-observers';
import {HistoryClient} from './history-client';
import {NativeNavigationClient,type NativeLocator,type NativeIdentity} from './native-navigation';
import type {HistoryGraph,HistoryMessage} from './history-data';
import {sameStep,turnId,reasoningTitle, type NativeTurn, type RouteStep, type Snapshot,type NativeControl} from './model';
export type SubmitStage=(label:string)=>void|Promise<void>;
export class PageNavigation extends Error {}
const nativeLink=(doc:Document,id:string)=>[...doc.querySelectorAll<HTMLAnchorElement>('a[href]')].find(a=>!a.closest('[data-suedama]')&&a.getAttribute('href')?.endsWith('/chat/s/'+id));

const MESSAGE = '.ds-message';
const disabled = (e: Element) => e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled') || e.classList.contains('ds-button--disabled');
type Message = {key: string; shell: HTMLElement; body: Element; role: 'user'|'assistant'; text: string};
type Pair = {turn: NativeTurn; user: Message; answer?: Message};
const messageTextCache=new WeakMap<Element,{html:string;text:string}>();
function answerText(body:Element){const html=body.innerHTML;const cached=messageTextCache.get(body);if(cached?.html===html)return cached.text;const text=readMarkdown(body);messageTextCache.set(body,{html,text});return text;}

function versionControl(shell: Element) {
  const counter = [...shell.querySelectorAll('div,span')].find(el => !el.children.length && /^\s*\d+\s*\/\s*\d+\s*$/.test(el.textContent ?? '') && el.parentElement?.querySelectorAll('button,[role="button"]').length===2);
  const numbers = counter?.textContent?.match(/\d+/g)?.map(Number);
  const buttons = counter?.parentElement?.querySelectorAll<HTMLElement>('[role="button"],button');
  return {index: numbers?.[0] ?? 1, total: numbers?.[1] ?? 1, previous: buttons?.[0], next: buttons?.[1]};
}
function readPairs(doc: Document): Pair[] {
  const messages: Message[] = [];
  for (const root of doc.querySelectorAll<HTMLElement>(MESSAGE)) {
    const answer = root.querySelector('.ds-assistant-message-main-content');
    const question = root.querySelector('.ds-collapsible-text');
    const thinking=root.querySelector('.ds-think-content .ds-markdown')??root.querySelector('.ds-think-content');
    const shell = root.closest<HTMLElement>('[data-virtual-list-item-key]');
    const key = shell?.getAttribute('data-virtual-list-item-key');
    const failed=!answer&&!question&&!thinking&&/已停止|已取消|出错|失败|stopped|cancelled|failed|error/i.test(root.textContent??'');
    if (!shell || !key || (!answer && !question && !thinking && !failed)) continue;
    const body = answer ?? thinking ?? question ?? root;
    messages.push({key, shell, body, role: answer||thinking||failed ? 'assistant' : 'user', text: answer||failed ? answerText(body):thinking?'': (body.textContent ?? '').replace(/\r\n/g,'\n').trim()});
  }
  const pairs: Pair[] = [];
  for (const message of messages) {
    if (message.role === 'user') pairs.push({user: message, turn: {userKey: message.key, userVersion: versionControl(message.shell).index, answerVersion: 1, question: message.text, answer: ''}});
    else {
      const pair = pairs.at(-1);
      if (pair && !pair.answer) {
        pair.answer = message;
        pair.turn.answer = message.text;
        pair.turn.answerKey = message.key;
        pair.turn.answerVersion = versionControl(message.shell).index;
        const thinking=message.shell.querySelector('.ds-think-content .ds-markdown')??message.shell.querySelector('.ds-think-content');
        if(thinking){pair.turn.reasoning=answerText(thinking);pair.turn.reasoningLabel=reasoningTitle(message.shell.querySelector('._5255ff8')?.textContent??undefined);}
      }
    }
  }
  // During optimistic reconciliation the same user message can briefly occur twice:
  // the old copy has no assistant at all. The native UI allows only one pending
  // user message; stopped/error responses above retain their own assistant identity.
  // Do not turn that DOM overlap into a historical parent/child relation.
  const reconciled:Pair[]=[];for(const pair of pairs){while(reconciled.length){const prior=reconciled.at(-1)!;if(prior.answer||prior.turn.question!==pair.turn.question||prior.turn.userVersion!==pair.turn.userVersion)break;reconciled.pop();}reconciled.push(pair);}return reconciled;
}
function setTextarea(input: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView!.HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('网页输入框不可用。');
  setter.call(input,text);
  input.dispatchEvent(new Event('input', {bubbles:true}));
  input.dispatchEvent(new Event('change', {bubbles:true}));
}
async function until<T>(read: ()=>T|undefined|false, message: string, timeout = 12000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = read(); if (value) return value;
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  throw new Error(message);
}
export interface SiteAdapter {
  read(): Snapshot;
  observe(callback: (snapshot: Snapshot)=>void): ()=>void;
  locate(conversationId: string, route: RouteStep[]): Promise<void>;
  send(conversationId: string, route: RouteStep[], text: string, mode: 'continue'|'edit', stage: SubmitStage,files?:File[]): Promise<void>;
  reveal(conversationId: string, route: RouteStep[]): Promise<void>;
  scanCurrent?(): Promise<Snapshot>;
  scanBranches?(capture:(snapshot:Snapshot)=>void,shouldContinue?:()=>boolean,reuse?:boolean):Promise<{branches:number;turns:number}>;
  openConversation?(id:string,softOnly?:boolean):Promise<void>;
  sessionAction?(id:string,action:'rename'|'pin'|'share'|'multi'|'delete'):Promise<void>;
  renameConversation?(id:string,title:string):Promise<void>;
  deleteConversation?(id:string):Promise<void>;
  requestDeleteConversation?(id:string):Promise<boolean>;
  navigationInProgress?():boolean;
  submissionInProgress?():boolean;
  submitNative?(text:string):Promise<void>;
  navigation?(action:'expand'|'search'|'account'):void|Promise<void>;
  newConversation?():Promise<void>;
  history?(id:string,force?:boolean,signal?:AbortSignal):Promise<HistoryGraph|undefined>;
  observeHistory?(callback:(graph:HistoryGraph)=>void):()=>void;
  cancelNavigation?():void;
  dispose?():void;
  nativeAction?(id:NativeControl['id']):void;
}

export class DeepSeekAdapter implements SiteAdapter {
  private operating = false;
  submissionInProgress=()=>this.operating;
  private scanning = false;
  private branchScanning=false;
  private navigating=false;
  navigationInProgress=()=>this.navigating;
  private notify?: (snapshot:Snapshot)=>void;
  private scanned?: {snapshot:Snapshot; positions:number[];versions:{user:number;answer:number}[]};
  private branchCache=new Map<string,{turns:Map<string,{turn:NativeTurn;versions:{user:number;answer:number}}>;stats:{branches:number;turns:number}}>();
  private files:string[]=[];
  private historyClient?:HistoryClient;
  private nativeLocator?:NativeLocator;
  private nativeIdentity?:{conversationId:string;byKey:Map<string,NativeIdentity>;byId:Map<string,NativeIdentity>};
  private epoch=0;
  private temporaryScope=crypto.randomUUID();
  private historyDom=new Map<string,{observedAt:number;html:string}>();
  private historyDomSession='';
  private graphDepth=0;
  private frozenGraphs=new Map<string,HistoryGraph|undefined>();
  private pendingHistory=new Map<string,HistoryGraph>();
  private historyListeners=new Set<(graph:HistoryGraph)=>void>();
  private historyIndexes=new WeakMap<HistoryGraph,{answers:Map<string,HistoryMessage>;users:Map<string,HistoryMessage>}>();
  private async withGraph<T>(work:()=>Promise<T>):Promise<T>{this.graphDepth++;try{return await work();}finally{if(!--this.graphDepth){this.frozenGraphs.clear();const pending=[...this.pendingHistory.values()];this.pendingHistory.clear();for(const graph of pending)for(const listener of this.historyListeners)listener(graph);}}}
  private graph(id:string){if(!this.graphDepth)return this.historyClient?.peek(id);if(!this.frozenGraphs.has(id))this.frozenGraphs.set(id,this.historyClient?.peek(id));return this.frozenGraphs.get(id);}
  constructor(private doc: Document = document, private getUrl: ()=>string = ()=>location.href,private navigate=(url:string)=>this.doc.defaultView!.location.assign(url),nativeLocator?:NativeLocator) {
    if(doc.defaultView?.location.origin==='https://chat.deepseek.com'){this.historyClient=new HistoryClient(doc.defaultView);this.nativeLocator=new NativeNavigationClient(doc.defaultView);}
    if(nativeLocator)this.nativeLocator=nativeLocator;
  }
  history=async(id:string,force=false,signal?:AbortSignal)=>this.historyClient?.get(id,force,signal);
  observeHistory=(callback:(graph:HistoryGraph)=>void)=>{
    this.historyListeners.add(callback);const stop=this.historyClient?.subscribe(graph=>{if(this.graphDepth)this.pendingHistory.set(graph.conversationId,graph);else callback(graph);});
    return()=>{stop?.();this.historyListeners.delete(callback);};
  };
  cancelNavigation=()=>{this.epoch++;this.nativeLocator?.cancel();};
  dispose=()=>{this.cancelNavigation();this.historyClient?.dispose();this.nativeLocator?.dispose();};
  private formalStep(cid:string,step:RouteStep):RouteStep{
    const native=this.nativeIdentity?.conversationId===cid?this.nativeIdentity.byId.get(step.answerKey??''):undefined;
    const answer=this.historyIndex(this.historyClient?.peek(cid))?.answers.get(step.answerKey??''),parent=native?.parentId??answer?.parentId;
    return parent?{...step,userKey:parent,identity:'server'}:step;
  }
  private historyIndex(graph:HistoryGraph|undefined){
    if(!graph)return;let index=this.historyIndexes.get(graph);
    if(!index){index={answers:new Map(graph.messages.filter(m=>m.role==='ASSISTANT').map(m=>[m.id,m])),users:new Map(graph.messages.filter(m=>m.role==='USER').map(m=>[m.id,m]))};this.historyIndexes.set(graph,index);}return index;
  }
  private pairs(){
    const pairs=readPairs(this.doc),cid=new URL(this.getUrl()).pathname.match(/\/chat\/s\/([\w-]+)/)?.[1]??'',graph=this.graph(cid);
    if(this.historyDomSession!==cid){this.historyDom.clear();this.historyDomSession=cid;}
    const index=this.historyIndex(graph);
    const answers=index?.answers??new Map<string,HistoryMessage>();
    const key=(value:string)=>value.startsWith('-')?`-${this.temporaryScope}.${value.slice(1)}`:value;
    const users=index?.users??new Map<string,HistoryMessage>();
    return pairs.map(pair=>{
      const identities=this.nativeIdentity?.conversationId===cid?this.nativeIdentity.byKey:undefined,nativeUser=identities?.get(pair.user.key),nativeAnswer=pair.answer?identities?.get(pair.answer.key):undefined;
      const known=nativeUser?.role==='USER'&&(!pair.answer||nativeAnswer?.role==='ASSISTANT'&&nativeAnswer.parentId===nativeUser.id);
      const answer=answers.get(pair.turn.answerKey??''),user=answer?.parentId?users.get(answer.parentId):undefined;
      const html=pair.answer?.body.innerHTML??'',prior=this.historyDom.get(cid+':'+answer?.id);
      if(answer&&graph?.fresh){if(this.historyClient?.peek(cid)===graph&&prior?.observedAt===graph.observedAt&&prior.html!==html)this.historyClient?.invalidate(cid);this.historyDom.set(cid+':'+answer.id,{observedAt:graph.observedAt,html});}
      const canonical=!!answer&&!!user&&this.historyClient?.peek(cid)===graph&&graph?.fresh&&answer.status==='FINISHED';
      return {...pair,turn:{...pair.turn,userKey:user?.id??(known?nativeUser.id:key(pair.turn.userKey)),answerKey:known&&nativeAnswer?nativeAnswer.id:pair.turn.answerKey?key(pair.turn.answerKey):undefined,...(user&&answer||known?{identity:'server' as const}:{}),...(canonical?{question:user.question,answer:answer.answer,reasoning:answer.reasoning||undefined}:{} )}};
    });
  }
  private controls(){
    const box=this.doc.querySelector('textarea')?.parentElement?.parentElement;
    const toggles=[...box?.querySelectorAll<HTMLElement>('.ds-toggle-button')??[]];
    const file=box?.querySelector<HTMLInputElement>('input[type=file]');
    // These two native toggles keep their order in other official interface languages.
    return {thinking:toggles.find(e=>/深度思考|DeepThink|Thinking/i.test(e.textContent??''))??(toggles.length===2?toggles[0]:undefined),search:toggles.find(e=>/搜索|Search/i.test(e.textContent??''))??(toggles.length===2?toggles[1]:undefined),attach:file?.parentElement?.querySelector<HTMLElement>('[role=button]')??box?.querySelector<HTMLElement>('.f02f0e25'),send:box?.querySelector<HTMLElement>('.ds-button--primary.ds-button--circle')};
  }
  private readControls():NativeControl[]{
    return Object.entries(this.controls()).flatMap(([id,element])=>{
      if(!element)return [];
      const css=this.doc.defaultView!.getComputedStyle(element),svg=element.querySelector('svg')?.cloneNode(true) as SVGElement|undefined;
      for(const node of svg?.querySelectorAll<SVGElement>('[style]')??[]){if(node.style.display==='none')node.remove();else node.removeAttribute('style');}
      svg?.removeAttribute('style');for(const node of svg?.querySelectorAll('[fill],[stroke]')??[])for(const attr of ['fill','stroke'])if(node.hasAttribute(attr)&&!['none','transparent'].includes(node.getAttribute(attr)!))node.setAttribute(attr,'currentColor');
      const style=Object.fromEntries(['color','backgroundColor','border','borderRadius','height','fontSize','padding'].map(key=>[key,css[key as keyof CSSStyleDeclaration] as string]));
      if(!(parseFloat(style.height!)>=28&&parseFloat(style.height!)<=52))style.height='34px';
      return [{id:id as NativeControl['id'],label:element.textContent?.trim() || (id==='attach'?'添加附件':'发送'),svg:svg?.outerHTML??'',active:element.getAttribute('aria-pressed')==='true',disabled:disabled(element),style}];
    });
  }
  nativeAction(id:NativeControl['id']){const button=this.controls()[id];if(!button || disabled(button))throw new Error('官网按键暂时不可用。');button.click();this.notify?.(this.read());}
  async sessionAction(id:string,action:'rename'|'pin'|'share'|'multi'|'delete'){
    if(this.read().busy)throw new Error('官网正在生成，请稍后管理会话。');
    const link=nativeLink(this.doc,id),button=link?.querySelector<HTMLElement>('button,[role=button]');if(!button)throw new Error('官网尚未加载该会话菜单。');button.click();
    const menu=await until(()=>this.doc.querySelector<HTMLElement>('.ds-dropdown-menu[role=menu]')??undefined,'官网会话菜单未打开。');
    const labels={rename:/^(重命名|Rename)$/i,pin:/^(置顶|取消置顶|Pin|Unpin)$/i,share:/^(分享|Share)$/i,multi:/^(多选|Select multiple)$/i,delete:/^(删除|Delete)$/i};
    const option=[...menu.querySelectorAll<HTMLElement>('.ds-dropdown-menu-option')].find(e=>labels[action].test(e.textContent?.trim()??''));if(!option)throw new Error('官网菜单中未找到该操作。');option.click();
  }
  async renameConversation(id:string,title:string){
    const before=nativeLink(this.doc,id),parent=before?.parentElement;await this.sessionAction(id,'rename');
    const input=await until(()=>before?.querySelector<HTMLInputElement>('input')??parent?.querySelector<HTMLInputElement>('input')??undefined,'官网未进入重命名状态。');
    const setter=Object.getOwnPropertyDescriptor(this.doc.defaultView!.HTMLInputElement.prototype,'value')?.set;setter?.call(input,title);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));input.blur();await until(()=>!input.isConnected||!parent?.contains(input),'官网尚未确认会话名称。');
  }
  async deleteConversation(id:string){
    await this.sessionAction(id,'delete');const dialog=await until(()=>this.doc.querySelector<HTMLElement>('.ds-modal [role=dialog]')??undefined,'官网删除确认未打开。');
    if(!/不可恢复|cannot be recovered|permanent/i.test(dialog.textContent??''))throw new Error('无法确认官网删除提示，已停止。');
    const confirm=[...dialog.querySelectorAll<HTMLElement>('button,[role=button]')].find(e=>/^(删除该对话|Delete chat|Delete)$/i.test(e.textContent?.trim()??''));if(!confirm)throw new Error('官网删除确认按钮不可用。');confirm.click();await until(()=>!nativeLink(this.doc,id),'官网尚未确认删除该会话。');
  }
  async requestDeleteConversation(id:string){
    await this.sessionAction(id,'delete');
    await until(()=>this.doc.querySelector('.ds-modal [role=dialog]')??undefined,'官网删除确认未打开。');
    // The human chooses the native confirm or cancel button; never confirm here.
    await until(()=>!this.doc.querySelector('.ds-modal [role=dialog]'),'删除确认仍未结束。',60000);
    await this.settle();return !nativeLink(this.doc,id);
  }
  async openConversation(id:string,softOnly=false){
    if(this.read().conversationId===id)return;
    if(this.read().busy)throw new Error('官网正在生成，请先完成或停止后再切换线路。');
    if(this.files.length)throw new Error('官网有未发送附件，请先处理后再切换线路。');
    if(this.doc.querySelector<HTMLTextAreaElement>('textarea')?.value.trim())throw new Error('官网仍有未发送的草稿，请先处理。');
    const link=nativeLink(this.doc,id);
    if(link){this.navigating=true;try{link.click();await until(()=>this.read().conversationId===id && this.doc.querySelector('textarea'),'官网尚未完成会话切换。');await this.settle();await this.settle();this.scanned=undefined;}finally{this.navigating=false;}return;}
    if(softOnly)throw new Error('官网尚未加载该会话入口，已跳过自动刷新。');
    this.navigate(`https://chat.deepseek.com/a/chat/s/${encodeURIComponent(id)}`);throw new PageNavigation('正在切换内部会话');
  }
  async navigation(action:'expand'|'search'|'account'){
    const controls=this.doc.querySelectorAll<HTMLElement>('.e5bf614e > [role=button]');
    if(action!=='account'){controls[action==='expand'?0:1]?.click();return;}
    const account=this.doc.querySelector<HTMLElement>('.b8812f16 ._2afd28d');if(!account)throw new Error('官网用户选项尚未加载。');
    if(!account.getBoundingClientRect().width){controls[0]?.click();await until(()=>account.getBoundingClientRect().width>0,'官网用户选项尚未展开。');}
    account.click();
  }
  async newConversation(){
    if(!this.read().conversationId){await until(()=>this.doc.querySelector('textarea'),'官网输入框尚未准备好。');return;}
    if(this.read().busy)throw new Error('官网正在生成，请先完成或停止后再新建根线路。');
    if(this.files.length)throw new Error('官网有未发送附件，请先处理后再新建根线路。');
    if(this.doc.querySelector<HTMLTextAreaElement>('textarea')?.value.trim())throw new Error('官网仍有未发送的草稿，请先处理。');
    const button=[...this.doc.querySelectorAll<HTMLElement>('[role=button],button,[tabindex="0"]')].find(e=>!e.closest('[data-suedama]')&&(/^(开启新对话|新对话|New chat)$/i.test(e.textContent?.trim()??'') || e.getAttribute('aria-label')==='New chat' || [...e.querySelectorAll('svg path')].some(p=>p.getAttribute('d')?.includes('M7.34473 4.93945'))));
    if(button){this.navigating=true;try{button.click();await until(()=>!this.read().conversationId && this.doc.querySelector('textarea')&&!this.pairs().length,'官网尚未进入新会话。');this.scanned=undefined;}finally{this.navigating=false;}return;}
    this.navigate('https://chat.deepseek.com/');throw new PageNavigation('正在创建内部会话');
  }
  read(): Snapshot {
    const conversationId = new URL(this.getUrl()).pathname.match(/\/chat\/s\/([\w-]+)/)?.[1] ?? '';
    const title = this.doc.title.replace(/\s*[-–]\s*DeepSeek.*$/,'').trim() || 'DeepSeek 对话';
    const send=this.doc.querySelector<HTMLElement>('.ds-button--primary.ds-button--circle');
    const input=this.doc.querySelector<HTMLTextAreaElement>('textarea');
    const arrow=send?.querySelector('svg path')?.getAttribute('d')?.startsWith('M8.3125');
    const busy=!!send?.querySelector('.ds-loading') || !!send && !disabled(send) && !input?.value && !arrow && !this.getUrl().startsWith('http://127.0.0.1');
    if(busy)this.historyClient?.invalidate(conversationId);
    const visible=this.doc.querySelector<HTMLElement>('.ds-virtual-list-visible-items');
    const offset=parseFloat(visible?.style.getPropertyValue('--dsl-virtual-list-transform-y') || '0');
    const first=this.doc.querySelector(MESSAGE);
    const leadingAnswerKey=first?.querySelector('.ds-assistant-message-main-content') ? first.closest('[data-virtual-list-item-key]')?.getAttribute('data-virtual-list-item-key') ?? undefined : undefined;
    return {conversationId,title,turns: this.pairs().map(p=>p.turn),busy,atStart:offset<1,leadingAnswerKey,controls:this.readControls(),files:this.files};
  }
  observe(callback: (snapshot: Snapshot)=>void) {
    this.notify=callback;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let signature = '';
    let stopped = false;
    const capture = () => {
      timer = undefined;
      if (stopped || this.scanning || this.branchScanning || this.navigating) return;
      if (this.doc.querySelectorAll('textarea').length > 1) return; // Ignore transient native edit forms.
      const snapshot = this.read();
      const next = JSON.stringify(snapshot);
      if (next !== signature) {signature=next; callback(snapshot);}
    };
    const observer = new MutationObserver(records=>{
      // Sidebar portals and native message presentations also live outside our main shadow root.
      if (timer || !records.some(record=>!isOwnedMutation(record))) return;
      timer = setTimeout(capture,120);
    });
    const files=(e:Event)=>{const input=e.target as HTMLInputElement;if(input.type==='file'){this.files=[...input.files??[]].map(f=>f.name);capture();}};
    this.doc.addEventListener('change',files);
    observer.observe(this.doc.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-disabled','aria-pressed','class']});
    const routeChanged=()=>{if(timer)clearTimeout(timer);timer=setTimeout(capture,120);};
    this.doc.defaultView?.addEventListener('popstate',routeChanged);
    capture();
    return () => {stopped=true;this.notify=undefined; observer.disconnect(); if(timer) clearTimeout(timer);this.doc.removeEventListener('change',files); this.doc.defaultView?.removeEventListener('popstate',routeChanged);};
  }
  private scroller(){return this.doc.querySelector<HTMLElement>('.ds-virtual-list.ds-scroll-area');}
  private check(epoch:number){if(epoch!==this.epoch){const error=new Error('已取消旧的导航任务。');error.name='AbortError';throw error;}}
  private checkSession(epoch:number,cid:string){this.check(epoch);if(new URL(this.getUrl()).pathname.match(/\/chat\/s\/([\w-]+)/)?.[1]!==cid){const error=new Error('会话已切换，停止定位。');error.name='AbortError';throw error;}}
  private async settle(){const epoch=this.epoch;await new Promise(resolve=>setTimeout(resolve,100));this.check(epoch);}
  async scanCurrent(startIndex=0):Promise<Snapshot>{return this.withGraph(()=>this.scanCurrentImpl(startIndex));}
  private async scanCurrentImpl(startIndex=0):Promise<Snapshot> {
    const epoch=this.epoch;
    if(this.scanning) throw new Error('正在收集当前线路，请稍候。');
    const initial=this.read();
    if(initial.busy) throw new Error('网页正在生成，完成后再收集完整线路。');
    const scroller=this.scroller();
    const versions=(pair:Pair)=>({user:versionControl(pair.user.shell).total,answer:pair.answer?versionControl(pair.answer.shell).total:1});
    if(!scroller){this.scanned={snapshot:initial,positions:initial.turns.map(()=>0),versions:this.pairs().map(versions)};if(!this.branchScanning)this.notify?.(initial);return initial;}
    const originalTop=scroller.scrollTop;
    const prefix=this.scanned?.snapshot.conversationId===initial.conversationId?this.scanned:undefined;
    const reused=prefix&&startIndex>0?prefix.snapshot.turns.slice(0,startIndex):[];
    const prefixIds=new Set(reused.map(turn=>turn.userKey));
    this.scanning=true;
    const turns=new Map<string,NativeTurn>(reused.map(turn=>[turn.userKey,turn]));
    const positions=new Map<string,number>(reused.map((turn,index)=>[turn.userKey,prefix!.positions[index]!]));
    const totals=new Map<string,{user:number;answer:number}>(reused.map((turn,index)=>[turn.userKey,prefix!.versions[index]!]));
    try {
      scroller.scrollTo({top:reused.length?Math.max(0,(prefix?.positions[startIndex]??0)-80):0});await this.settle();
      let complete=false;
      for(let step=0;step<180;step++){
        this.check(epoch);
        const status=this.read();
        if(status.conversationId!==initial.conversationId) throw new Error('会话已切换，停止收集。');
        if(status.busy) throw new Error('网页开始生成，停止收集。');
        for(const pair of this.pairs()){
          if(prefixIds.has(pair.turn.userKey))continue;
          turns.set(pair.turn.userKey,pair.turn);
          totals.set(pair.turn.userKey,versions(pair));
          positions.set(pair.turn.userKey,pair.user.shell.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop);
        }
        if(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-3){complete=true;break;}
        const top=scroller.scrollTop;
        scroller.scrollTo({top:top+Math.max(250,scroller.clientHeight*.7)});await this.settle();
        if(scroller.scrollTop===top)break;
      }
      if(!complete)throw new Error('这条线路过长或尚未加载完成；请先在网页加载历史后重试。');
      const snapshot={...initial,turns:[...turns.values()],atStart:true,leadingAnswerKey:undefined};
      this.scanned={snapshot,positions:[...turns.keys()].map(key=>positions.get(key)??0),versions:[...turns.keys()].map(key=>totals.get(key)!)};
      if(!this.branchScanning)this.notify?.(snapshot);
      return snapshot;
    } finally {try{if(epoch===this.epoch&&scroller.scrollTop!==originalTop){scroller.scrollTo({top:originalTop});await this.settle();}}finally{this.scanning=false;}}
  }
  private async seek(index:number) {
    const expected=this.scanned?.snapshot.turns[index];
    const present=expected&&this.pairs().find(pair=>sameStep(pair.turn,expected));if(present)return present;
    const position=this.scanned?.positions[index];
    if(position!==undefined && this.scroller()){this.scroller()!.scrollTo({top:Math.max(0,position-80)});await this.settle();}
    const pair=expected && this.pairs().find(p=>sameStep(p.turn,expected));
    if(!pair)throw new Error('网页未加载目标消息，已停止操作。');
    return pair;
  }
  /** Walk native user/answer version controls. Each subtree is restored before
   * visiting its sibling, so nested branches keep their actual parent context. */
  async scanBranches(capture:(snapshot:Snapshot)=>void,shouldContinue=()=>true,reuse=false):Promise<{branches:number;turns:number}>{return this.withGraph(()=>this.scanBranchesImpl(capture,shouldContinue,reuse));}
  private async scanBranchesImpl(capture:(snapshot:Snapshot)=>void,shouldContinue=()=>true,reuse=false):Promise<{branches:number;turns:number}>{
    const epoch=this.epoch;
    if(this.branchScanning||this.scanning)throw new Error('正在收集当前线路，请稍候。');
    if(this.operating)throw new Error('正在发送，请稍后切换会话。');
    const initial=this.read(),originalTop=this.scroller()?.scrollTop;
    if(this.doc.querySelectorAll('textarea').length>1||this.doc.querySelector<HTMLTextAreaElement>('textarea')?.value.trim()||this.files.length)throw new Error('官网仍有未发送的草稿或附件，请先处理。');
    this.branchScanning=true;
    const turns=new Set<string>(),branches=new Set<string>();let scans=0;
    const collected=new Map<string,{turn:NativeTurn;versions:{user:number;answer:number}}>();
    const scan=async(startIndex=0)=>{
      if(++scans>2000)throw new Error('分支过多，已保留收集结果，请分次收集。');
      this.check(epoch);const snapshot=await this.scanCurrent(startIndex);this.check(epoch);capture(snapshot);
      for(const [index,turn]of snapshot.turns.entries()){const id=turnId(snapshot.conversationId,turn);turns.add(id);collected.set(id,{turn,versions:this.scanned!.versions[index]!});}
      branches.add(JSON.stringify(snapshot.turns.map(turn=>turnId(snapshot.conversationId,turn))));return snapshot;
    };
    const check=()=>{this.check(epoch);if(this.read().conversationId!==initial.conversationId)throw new Error('会话已切换，停止收集。');if(!shouldContinue())throw new Error('已停止收集分支。');if(this.read().busy)throw new Error('网页开始生成，停止收集。');};
    const select=async(index:number,role:'user'|'answer',target:number,snapshot:Snapshot,restore=false):Promise<Snapshot>=>{
      for(let changes=0;changes<2000;changes++){
        this.check(epoch);
        if(this.read().conversationId!==initial.conversationId||this.read().busy)throw new Error('会话已切换或开始生成，停止收集。');
        if(!restore)check();
        const current=this.scanned?.snapshot??snapshot,turn=current.turns[index];
        if(turn&&(role==='user'?turn.userVersion:turn.answerVersion)===target)return current;
        const pair=await this.seek(index),message=pair[role];
        if(!message){if(target===1)return snapshot;throw new Error('网页尚未加载目标回答。');}
        const control=versionControl(message.shell);if(control.index===target)return this.scanned?.snapshot??snapshot;
        const button=target<control.index?control.previous:control.next;
        if(!button||disabled(button))throw new Error('官网分支版本切换不可用。');
        if(!restore&&scans>=2000)throw new Error('分支过多，已保留收集结果，请分次收集。');
        const prior=pair.turn,nextVersion=control.index+(target<control.index?-1:1);
        button.click();
        await until(()=>{this.check(epoch);return this.pairs().some(p=>role==='user'?p.turn.userKey!==prior.userKey&&p.turn.userVersion===nextVersion:p.turn.userKey===prior.userKey&&p.turn.answerVersion===nextVersion);},'官网尚未完成分支切换。');
        snapshot=restore?await this.scanCurrent(index):await scan(index);
      }
      throw new Error('版本切换次数过多，请回到网页手动定位。');
    };
    const visit=async(index:number,snapshot:Snapshot):Promise<Snapshot>=>{
      check();
      // A long linear history needs one scan, without seeking every message again.
      while(index<snapshot.turns.length&&this.scanned?.versions[index]?.user===1&&this.scanned.versions[index]?.answer===1)index++;
      if(index>=snapshot.turns.length)return snapshot;
      const userVersion=snapshot.turns[index]!.userVersion;
      const users=this.scanned?.versions[index]?.user??1;
      try{
        for(let user=1;user<=users;user++){
          snapshot=await select(index,'user',user,snapshot);
          const answerVersion=snapshot.turns[index]!.answerVersion,answers=this.scanned?.versions[index]?.answer??1;
          try{for(let answer=1;answer<=answers;answer++){snapshot=await select(index,'answer',answer,snapshot);snapshot=await visit(index+1,snapshot);}}
          finally{if(epoch===this.epoch)snapshot=await select(index,'answer',answerVersion,snapshot,true);}
        }
      }finally{if(epoch===this.epoch)snapshot=await select(index,'user',userVersion,snapshot,true);}
      return snapshot;
    };
    let original:Snapshot|undefined;
    try{
      original=await scan();const cached=this.branchCache.get(initial.conversationId);
      if(reuse&&cached&&collected.size>0&&[...collected].every(([id,value])=>JSON.stringify(value)===JSON.stringify(cached.turns.get(id))))return cached.stats;
      await visit(0,original);const stats={branches:branches.size,turns:turns.size};this.branchCache.set(initial.conversationId,{turns:collected,stats});return stats;
    }
    finally{
      try{if(epoch===this.epoch&&original&&this.read().conversationId===initial.conversationId&&!this.read().busy){
        const current=this.scanned?.snapshot;
        if(original.turns.length&&(!current||original.turns.length!==current.turns.length||original.turns.some((turn,i)=>!sameStep(current.turns[i]!,turn)))){
          let restored=current??original;
          for(const [index,turn]of original.turns.entries()){restored=await select(index,'user',turn.userVersion,restored,true);restored=await select(index,'answer',turn.answerVersion,restored,true);}
          if(original.turns.some((turn,i)=>!restored.turns[i]||!sameStep(restored.turns[i]!,turn)))throw new Error('未能恢复原分支，请回到官网核对。');
        }
        if(shouldContinue()&&this.scanned)capture(this.scanned.snapshot);
        if(originalTop!==undefined){this.scroller()?.scrollTo({top:originalTop});await this.settle();}
      }}finally{this.branchScanning=false;}
    }
  }
  async locate(conversationId:string,route:RouteStep[]){return this.withGraph(()=>this.locateImpl(conversationId,route));}
  private async locateImpl(conversationId: string, route: RouteStep[]) {
    const epoch=this.epoch;
    if (this.read().conversationId !== conversationId) await this.openConversation(conversationId);
    if (this.read().busy) throw new Error('网页正在生成，请完成或停止后再切换分支。');
    route=route.map(step=>this.formalStep(conversationId,step));
    const requested=route.at(-1),targetId=requested?.answerKey??requested?.userKey,positive=(value:string|undefined)=>!!value&&/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value));
    if(this.nativeLocator&&positive(targetId)){
      const result=await this.nativeLocator.reveal({conversationId,messageId:targetId!,userId:positive(requested?.userKey)?requested!.userKey:undefined,path:route.flatMap(step=>[step.userKey,step.answerKey].filter((id):id is string=>positive(id)))});this.checkSession(epoch,conversationId);
      if(result){this.nativeIdentity={conversationId,byKey:new Map(result.identities.map(m=>[m.renderKey,m])),byId:new Map(result.identities.map(m=>[m.id,m]))};
        const target=this.formalStep(conversationId,requested!);if(this.pairs().some(p=>sameStep(p.turn,target))){this.scanned=undefined;return;}}
    }
    await until(()=>{this.checkSession(epoch,conversationId);return this.pairs().length>0;},'官网尚未加载历史消息。');
    const graph=this.historyClient?.peek(conversationId),messages=new Map(graph?.messages.map(m=>[m.id,m])??[]);
    route=route.map(step=>{const answer=messages.get(step.answerKey??'');return answer?.role==='ASSISTANT'&&answer.parentId?{...step,userKey:answer.parentId,identity:'server' as const}:step;});
    const last=route.at(-1);if(!last)throw new Error('没有可定位的历史。');
    this.checkSession(epoch,conversationId);
    if(this.pairs().some(p=>sameStep(p.turn,last))){this.scanned=undefined;return;}
    const user=messages.get(last.userKey);
    if(user){
      const entries=[...this.doc.querySelectorAll<HTMLElement>('._72b6158')].filter(e=>e.textContent?.trim()===user.question.trim());
      if(entries.length===1){entries[0]!.parentElement?.click();await this.settle();this.checkSession(epoch,conversationId);if(this.pairs().some(p=>sameStep(p.turn,last))){this.scanned=undefined;return;}}
    }
    // A mounted prefix is enough to choose a version; it need not be scanned to the bottom.
    for(let changes=0;changes<40;changes++){
      this.checkSession(epoch,conversationId);const current=this.read(),pairs=this.pairs();
      if(pairs.some(p=>sameStep(p.turn,last))){this.scanned=undefined;return;}
      if(!current.atStart||route[0]?.root===false)break;
      const mismatch=route.findIndex((step,i)=>!current.turns[i]||!sameStep(current.turns[i]!,step)),expected=route[mismatch],pair=pairs[mismatch];
      if(!expected||!pair)break;
      const role=(messages.get(pair.turn.answerKey??'')?.parentId??pair.turn.userKey)!==expected.userKey?'user':'answer',message=pair[role];if(!message)break;
      const control=versionControl(message.shell),target=role==='user'?expected.userVersion:expected.answerVersion;
      const button=target<control.index?control.previous:target>control.index?control.next:undefined;if(!button||disabled(button))break;
      button.click();await until(()=>{this.checkSession(epoch,conversationId);return this.pairs().some(p=>role==='user'?p.turn.userKey!==pair.turn.userKey&&p.turn.userVersion!==pair.turn.userVersion:p.turn.userKey===pair.turn.userKey&&p.turn.answerKey!==pair.turn.answerKey);},'网页未完成版本切换，草稿已保留。');
    }
    let snapshot=await this.scanCurrent();
    for(let changes=0;changes<40;changes++){
      this.checkSession(epoch,conversationId);
      const present=snapshot.turns.findIndex(t=>sameStep(t,last));
      if(present>=0){await this.seek(present);return;}
      if(route[0]?.root===false)throw new Error('这份快照缺少早期历史，请先在原分支收集完整线路。');
      const mismatch=route.findIndex((step,i)=>!snapshot.turns[i] || !sameStep(snapshot.turns[i]!,step));
      if(mismatch<0)throw new Error('分支未能匹配。');
      const expected=route[mismatch]!;
      const pair=await this.seek(mismatch);
      const role=(messages.get(pair.turn.answerKey??'')?.parentId??pair.turn.userKey)!==expected.userKey ? 'user' : 'answer';
      const message=pair[role];if(!message)throw new Error('网页尚未加载目标回答。');
      const control=versionControl(message.shell);
      const target=role==='user'?expected.userVersion:expected.answerVersion;
      const button=target<control.index?control.previous:target>control.index?control.next:undefined;
      if(!button || disabled(button))throw new Error('无法匹配保存的分支。请在网页切换到该版本后重试。');
      const prior=pair.turn;
      button.click();
      await until(()=>{this.checkSession(epoch,conversationId);return this.pairs().some(p=>role==='user'?p.turn.userKey!==prior.userKey && versionControl(p.user.shell).index!==(prior.userVersion):p.turn.userKey===prior.userKey && p.turn.answerKey!==prior.answerKey);},'网页未完成版本切换，草稿已保留。');
      snapshot=await this.scanCurrent();
    }
    throw new Error('版本切换次数过多，请回到网页手动定位。');
  }
  async reveal(conversationId: string, route: RouteStep[]) {
    const epoch=this.epoch,style=this.doc.createElement('style');style.dataset.suedama='native-positioning';
    // Keep the virtual list laid out while concealing branch switches and scan fallback.
    style.textContent='.ds-virtual-list.ds-scroll-area{visibility:hidden!important}[data-virtual-list-item-key]{scroll-margin-top:80px!important}html,body,.ds-virtual-list.ds-scroll-area,.ds-virtual-list.ds-scroll-area *{scroll-behavior:auto!important;overflow-anchor:none!important}';
    this.doc.head.append(style);
    try{
      await this.locate(conversationId,route);this.checkSession(epoch,conversationId);
      const last=route.at(-1)?this.formalStep(conversationId,route.at(-1)!):undefined;
      const target=()=>last&&this.pairs().find(p=>sameStep(p.turn,last));
      if(!target())throw new Error('目标轮次尚未挂载，请重新定位。');
      // Repeat after layout: native virtual-list measurement can move the target on its next frame.
      for(let frame=0;frame<3;frame++){
        this.checkSession(epoch,conversationId);const pair=target();if(!pair)throw new Error('目标轮次已变化，请重新定位。');
        pair.user.shell.scrollIntoView({block:'start',behavior:'instant'});
        await new Promise<void>(resolve=>{const timer=setTimeout(resolve,100);this.doc.defaultView!.requestAnimationFrame(()=>{clearTimeout(timer);resolve();});});
      }
      this.checkSession(epoch,conversationId);
      if(this.read().conversationId!==conversationId||!target())throw new Error('目标轮次已变化，请重新定位。');
    }finally{style.remove();}
  }
  async submitNative(text:string){
    if(this.operating)throw new Error('上一条发送尚未完成。');
    const input=this.doc.querySelector<HTMLTextAreaElement>('textarea'),submit=this.controls().send;
    if(!input||!submit||this.doc.querySelectorAll('textarea').length!==1)throw new Error('官网输入框暂时不可用。');
    const before=new Set(this.pairs().map(p=>p.turn.userKey)),original=input.value;this.operating=true;
    try{setTextarea(input,text);await until(()=>!disabled(submit),'网页发送按钮不可用。',4000);submit.click();await until(()=>this.pairs().some(p=>p.turn.question===text.trim()&&!before.has(p.turn.userKey)),'尚未确认网页是否接收，请回到网页核对，避免重复发送。',20000);this.files=[];this.notify?.(this.read());}
    catch(e){if(input.isConnected&&input.value===text)setTextarea(input,original);throw e;}
    finally{this.operating=false;}
  }
  async send(conversationId: string, route: RouteStep[], text: string, mode: 'continue'|'edit', stage: SubmitStage,files:File[]=[]) {
    if (this.operating) throw new Error('上一条发送尚未完成，请稍候。');
    this.operating=true;
    try {
      if (!text.trim()) throw new Error('请先输入问题。');
      await stage('正在定位分支');
      if(route.length)await this.locate(conversationId,route);
      else if(this.read().conversationId)throw new Error('新根线路尚未进入独立官网会话。');
      // Sending must know whether a later turn exists: a mounted target alone cannot prove it is a leaf.
      const actual=route.length?(await this.scanCurrent()).turns:[];
      const sourceIndex=route.length?actual.findIndex(t=>sameStep(t,route.at(-1)!)):-1;
      if(route.length && sourceIndex<0)throw new Error('未能确认提问的历史落点。');
      const index=mode==='edit'?sourceIndex:sourceIndex+1;
      const editTarget=actual[index] ? await this.seek(index) : undefined;
      if(editTarget && (this.files.length||files.length))throw new Error('官网的历史编辑不能携带当前输入框附件。请改在末尾或独立根线路发送附件。');
      let input: HTMLTextAreaElement;
      let submit: HTMLElement;
      if (editTarget) {
        const edit = editTarget.user.shell.querySelector<HTMLElement>('.d4910adc') ?? editTarget.user.shell.querySelectorAll<HTMLElement>('.ds-flex [role="button"]')[1];
        if (!edit || disabled(edit)) throw new Error('未找到可用的历史编辑按钮。请回到网页检查。');
        if (this.doc.querySelectorAll('textarea').length !== 1) throw new Error('网页存在未完成的编辑，请先完成或取消。');
        const composer = this.doc.querySelector('textarea');
        if (composer?.value.trim()) throw new Error('网页输入框还有草稿，请先处理，避免覆盖。');
        edit.click();
        input = await until(()=>editTarget.user.shell.querySelector<HTMLTextAreaElement>('textarea') ?? undefined,'网页未进入编辑状态。');
        const button=[...editTarget.user.shell.querySelectorAll<HTMLElement>('button,[role="button"]')].find(e=>/^(发送|Send)$/.test(e.textContent?.trim()??''));
        if (!button) throw new Error('未找到历史编辑的发送按钮。');
        submit=button;
      } else {
        const candidate=this.doc.querySelector<HTMLTextAreaElement>('textarea');
        if (!candidate || this.doc.querySelectorAll('textarea').length!==1) throw new Error('网页输入框不可用，请回到网页检查。');
        if (candidate.value.trim()) throw new Error('网页输入框还有草稿，请先处理，避免覆盖。');
        input=candidate;
        const button=input.parentElement?.parentElement?.querySelector<HTMLElement>('.ds-button--primary.ds-button--circle');
        if (!button) throw new Error('未识别发送按钮，请回到网页发送。');
        submit=button;
      }
      if(files.length&&this.files.length&&this.files.join('\n')!==files.map(f=>f.name).join('\n'))throw new Error('官网已有其他未发送附件，请先处理。');
      if(files.length&&this.files.join('\n')!==files.map(f=>f.name).join('\n')){
        await stage('正在上传附件');const fileInput=this.doc.querySelector<HTMLInputElement>('input[type=file]');if(!fileInput)throw new Error('未找到官网文件上传控件。');
        const transfer=new DataTransfer();for(const file of files)transfer.items.add(file);fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));
        await this.settle();await this.settle();
        await until(()=>{const box=this.doc.querySelector('textarea')?.parentElement?.parentElement?.parentElement;if(/上传失败|上传错误|upload failed/i.test(box?.textContent??''))throw new Error('官网附件上传失败，文件仍保留在白板草稿中。');return !box?.querySelector('.ds-loading,[data-uploading=true]');},'官网仍在处理附件，文件已保留，请核对后重试。',45000);
      }
      const priorKeys=new Set(actual.map(p=>p.userKey));
      setTextarea(input,text);
      await stage('等待网页接收');
      await until(()=>!disabled(submit),'网页发送按钮不可用，草稿已保留。',4000);
      await stage('即将发送');
      submit.click(); // One submit only. A timeout never triggers an automatic retry.
      await until(()=>{
        return this.pairs().some(p=>p.turn.question===text.trim() && !priorKeys.has(p.turn.userKey));
      },'尚未确认网页是否接收。请先回到网页核对，避免重复发送。',20000);
      this.files=[];await stage('等待模型回复');
    } finally {this.operating=false;}
  }
}
