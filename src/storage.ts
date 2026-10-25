import {packLibrary,unpackLibrary} from './storage-codec';
import {emptyLibrary, validateLibrary, reconcileCardAliases, type Library,type GlobalCustomPrompt} from './model';
import {cleanFolders} from './sidebar';
const KEY = 'suedama.library.v1';
/** Apply only this tab's changed fields to the latest persisted library. */
export function mergeLocalChanges(latest: Library,before: Library,incoming: Library):Library {
  const result={...latest};
  for(const group of ['cards','conversations','drafts','views','boards','folders','cardAliases'] as const){
    const old=(before[group]??{}) as Record<string,unknown>,next=(incoming[group]??{}) as Record<string,unknown>;
    const rows={...latest[group]} as Record<string,unknown>;
    for(const [key,value] of Object.entries(next)){
      if(JSON.stringify(value)===JSON.stringify(old[key]))continue;
      const prior=old[key] as Record<string,unknown>|undefined;
      const current=rows[key] as Record<string,unknown>|undefined;
      if(current && prior){
        const patched={...current};
        for(const field of new Set([...Object.keys(prior),...Object.keys(value as object)])){
          const val=(value as Record<string,unknown>)[field];
          if(JSON.stringify(val)!==JSON.stringify(prior[field])){if(val===undefined)delete patched[field];else patched[field]=val;}
        }
        rows[key]=patched;
      }else rows[key]=value;
    }
    for(const key of Object.keys(old))if(!Object.hasOwn(next,key) && JSON.stringify(rows[key])===JSON.stringify(old[key]))delete rows[key];
    Object.assign(result,{[group]:rows});
  }
  for(const field of ['viewport','previewViewport','selectedId','lockedId','activeBoardId','resume','selectionCleared','sessionOrder','recentOrder','sidebarSort','sidebarSections','defaultAppearance','globalCustomPrompt'] as const)if(JSON.stringify(incoming[field])!==JSON.stringify(before[field]))Object.assign(result,{[field]:incoming[field]});
  result.revision=Math.max(latest.revision,incoming.revision);
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
    this.baseline=await this.read();return this.baseline;
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
