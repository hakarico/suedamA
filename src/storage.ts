import {packLibrary,unpackLibrary} from './storage-codec';
import {emptyLibrary, validateLibrary, reconcileCardAliases, type Library,type GlobalCustomPrompt} from './model';
import {cleanFolders} from './sidebar';
const KEY = 'suedama.library.v1';
/** Apply only this tab's changed fields to the latest persisted library. */
export function mergeLocalChanges(latest: Library,before: Library,incoming: Library):Library {
  const result={...latest};
  const resolve=(key:string)=>{
    const seen=new Set<string>();let to=key;
    while(latest.cardAliases?.[to]&&!seen.has(to)){seen.add(to);to=latest.cardAliases[to]!;}
    return to;
  };
  const destination=(key:string,card:Library['cards'][string]|undefined)=>{
    const to=resolve(key),target=latest.cards[to],step=card?.route.at(-1),targetStep=target?.route.at(-1);
    return target&&(!card||card.question===target.question&&card.conversationId===target.conversationId&&step?.userVersion===targetStep?.userVersion&&step?.answerVersion===targetStep?.answerVersion&&resolve(card.parentId??'')===resolve(target.parentId??''))?to:key;
  };
  for(const group of ['cards','conversations','drafts','views','boards','folders','cardAliases','sidebarMoves'] as const){
    const old=(before[group]??{}) as Record<string,unknown>,next=(incoming[group]??{}) as Record<string,unknown>;
    const rows={...latest[group]} as Record<string,unknown>;
    for(const [key,value] of Object.entries(next)){
      if(JSON.stringify(value)===JSON.stringify(old[key]))continue;
      const targetKey=group==='cards'||group==='drafts'?destination(key,group==='cards'?value as Library['cards'][string]:incoming.cards[key]??before.cards[key]):key;
      const prior=old[key] as Record<string,unknown>|undefined;
      const current=rows[targetKey] as Record<string,unknown>|undefined;
      if(group!=='cardAliases' && current && prior){
        const patched={...current};
        for(const field of new Set([...Object.keys(prior),...Object.keys(value as object)])){
          const val=(value as Record<string,unknown>)[field];
          if(JSON.stringify(val)!==JSON.stringify(prior[field])){
            if(group==='boards'&&field==='conversationIds'){
              const oldIds=prior[field] as string[],nextIds=val as string[],currentIds=current[field] as string[];
              patched[field]=[...nextIds.filter(id=>!oldIds.includes(id)||currentIds.includes(id)),...currentIds.filter(id=>!oldIds.includes(id)&&!nextIds.includes(id))];
            }else if(val===undefined)delete patched[field];else patched[field]=val;
          }
        }
        rows[targetKey]=patched;
      }else rows[targetKey]=group==='cards'&&targetKey!==key?{...value as object,id:targetKey}:value;
    }
    for(const key of Object.keys(old))if(!Object.hasOwn(next,key)){
      const targetKey=group==='drafts'?destination(key,before.cards[key]):key;
      if(JSON.stringify(rows[targetKey])===JSON.stringify(old[key]))delete rows[targetKey];
    }
    Object.assign(result,{[group]:rows});
  }
  for(const field of ['viewport','previewViewport','selectedId','lockedId','activeBoardId','resume','selectionCleared','sessionOrder','recentOrder','sidebarSort','sidebarSections','defaultAppearance','globalCustomPrompt','preload'] as const)if(JSON.stringify(incoming[field])!==JSON.stringify(before[field]))Object.assign(result,{[field]:incoming[field]});
  result.revision=Math.max(latest.revision,incoming.revision);
  // A concurrent move may add the same session to two different boards.
  // Membership explicitly added by this tab wins over the persisted owner.
  const owners=new Map<string,string>();
  for(const board of Object.values(result.boards??{}))for(const id of board.conversationIds)if(!owners.has(id))owners.set(id,board.id);
  for(const board of Object.values(incoming.boards??{}))for(const id of board.conversationIds)if(!before.boards?.[board.id]?.conversationIds.includes(id))owners.set(id,board.id);
  result.boards=Object.fromEntries(Object.values(result.boards??{}).map(board=>[board.id,{...board,conversationIds:board.conversationIds.filter(id=>owners.get(id)===board.id)}]));
  return cleanFolders(reconcileCardAliases(result));
}
export class LibraryStorage {
  private queue: Promise<void> = Promise.resolve();
  private baseline=emptyLibrary();
  constructor(private key=KEY){}
  watchGlobalPrompt(callback:(before:GlobalCustomPrompt|undefined,after:GlobalCustomPrompt|undefined)=>void){
    const extract=(value:unknown):GlobalCustomPrompt|undefined=>{
      const packed=value as {format?:string;data?:{globalCustomPrompt?:unknown};texts?:unknown};
      const prompt=(packed?.format==='suedama.local.2'?unpackLibrary({...packed,data:packed.data?.globalCustomPrompt}):(value as Library|undefined)?.globalCustomPrompt) as GlobalCustomPrompt|undefined;
      if(prompt!==undefined&&(!prompt||typeof prompt.text!=='string'||typeof prompt.version!=='string'))throw new Error('Invalid global prompt');return prompt;
    };
    const changed=(before:unknown,after:unknown)=>{try{const old=extract(before),next=extract(after);if(JSON.stringify(old)!==JSON.stringify(next))callback(old,next);}catch{/* Ignore unrelated or malformed external data. */}};
    if(typeof chrome!=='undefined'&&chrome.storage?.onChanged){const listener=(changes:Record<string,{oldValue?:unknown;newValue?:unknown}>,area:string)=>{if(area==='local'&&changes[this.key])changed(changes[this.key]!.oldValue,changes[this.key]!.newValue);};chrome.storage.onChanged.addListener(listener);return()=>chrome.storage.onChanged.removeListener(listener);}
    const listener=(event:StorageEvent)=>{if(event.key!==this.key)return;try{changed(JSON.parse(event.oldValue??'{}')[this.key],JSON.parse(event.newValue??'{}')[this.key]);}catch{}};window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);
  }
  private async read():Promise<Library>{
    const values = typeof chrome !== 'undefined' && chrome.storage ? await chrome.storage.local.get(this.key) : JSON.parse(localStorage.getItem(this.key) ?? '{}');
    return values[this.key] ? validateLibrary(unpackLibrary(values[this.key])) : emptyLibrary();
  }
  async load(): Promise<Library> {
    const library=await this.read();this.baseline=structuredClone(library);return library;
  }
  save(library: Library): Promise<Library> {
    // Serialize writes so an earlier slow write can never replace a newer draft.
    const value = structuredClone(library);
    const write = this.queue.catch(()=>{}).then(async () => {
      const before=this.baseline;
      const save=async()=>{
        const merged=validateLibrary(mergeLocalChanges(await this.read(),before,value));
        if (typeof chrome !== 'undefined' && chrome.storage) await chrome.storage.local.set({[this.key]: packLibrary(merged)});
        else localStorage.setItem(this.key, JSON.stringify({[this.key]:packLibrary(merged)}));
        this.baseline=value;
        return merged;
      };
      // Content scripts on this site share the lock. Concurrent tabs cannot race whole-library writes.
      if(typeof navigator!=='undefined' && navigator.locks)return navigator.locks.request(this.key,save);
      return save();
    });
    this.queue = write.then(()=>{},()=>{});
    return write;
  }
}
