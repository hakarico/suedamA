import type {Library,SidebarItem,SidebarFolder} from './model';
import {boardForConversation} from './boards';

export const itemKey=(item:SidebarItem)=>item.kind+':'+item.id;
export const sidebarSort=(library:Library)=>library.sidebarSort??(library.sessionOrder?'manual':'time');
export const folderForItem=(library:Library,item:SidebarItem)=>Object.values(library.folders??{}).find(f=>f.items.some(i=>itemKey(i)===itemKey(item)));
export function validSidebarItem(library:Library,item:SidebarItem){
  return item.kind==='board'?library.boards?.[item.id]?.kind==='group':!!library.conversations[item.id]&&!library.conversations[item.id]!.deleted&&boardForConversation(library,item.id)?.kind!=='group';
}
/** Stale references can come from another tab; organizing never creates another conversation owner. */
export function cleanFolders(library:Library):Library{
  if(!library.folders)return library;const seen=new Set<string>();let changed=false;
  const folders=Object.fromEntries(Object.values(library.folders).map(folder=>{
    const items=folder.items.filter(item=>{const key=itemKey(item);if(!validSidebarItem(library,item)||seen.has(key))return false;seen.add(key);return true;});
    if(items.length!==folder.items.length)changed=true;return [folder.id,items.length===folder.items.length?folder:{...folder,items}];
  }));return changed?{...library,folders}:library;
}
export function itemUpdatedAt(library:Library,item:SidebarItem):number{
  if(item.kind==='session')return library.conversations[item.id]?.updatedAt??0;
  return Math.max(library.boards?.[item.id]?.createdAt??0,...(library.boards?.[item.id]?.conversationIds??[]).map(id=>library.conversations[id]?.updatedAt??0));
}
export function sortedItems(library:Library,items:SidebarItem[]){
  return sidebarSort(library)==='time'?[...items].sort((a,b)=>itemUpdatedAt(library,b)-itemUpdatedAt(library,a)):items;
}
export function sortedFolders(library:Library):SidebarFolder[]{
  const folders=Object.values(library.folders??{}).sort((a,b)=>a.order-b.order);
  return sidebarSort(library)==='time'?folders.sort((a,b)=>Math.max(b.createdAt,...b.items.map(i=>itemUpdatedAt(library,i)))-Math.max(a.createdAt,...a.items.map(i=>itemUpdatedAt(library,i)))):folders;
}
export function withoutFolderItem(library:Library,item:SidebarItem):Library{
  const key=itemKey(item);return {...library,folders:Object.fromEntries(Object.values(library.folders??{}).map(f=>[f.id,{...f,items:f.items.filter(i=>itemKey(i)!==key)}]))};
}
/** Pixels per animation frame. Continue scrolling even if the pointer stops at the edge. */
export function sidebarEdgeSpeed(y:number,top:number,bottom:number){
  const band=Math.min(48,(bottom-top)/4);if(band<=0)return 0;
  return y<top+band?-Math.ceil(13*Math.min(1,(top+band-y)/band)):y>bottom-band?Math.ceil(13*Math.min(1,(y-bottom+band)/band)):0;
}

/** A single sibling order for unfiled boards and ordinary native sessions. */
export function recentItems(library:Library,nativeIds:string[]=[]):SidebarItem[]{
  const boards=Object.values(library.boards??{}).filter(b=>b.kind==='group').sort((a,b)=>(a.order??0)-(b.order??0)).map(b=>({kind:'board' as const,id:b.id}));
  const sessionIds=[...new Set([...nativeIds,...Object.keys(library.conversations)])];
  const sessions=sessionIds.filter(id=>!library.conversations[id]?.deleted&&boardForConversation(library,id)?.kind!=='group').map(id=>({kind:'session' as const,id}));
  const items=[...boards,...sessions].filter(item=>!folderForItem(library,item));
  const fallback=library.recentOrder??[...boards,...(library.sessionOrder??sessionIds).map(id=>({kind:'session' as const,id}))];
  const ranks=new Map(fallback.map((item,i)=>[itemKey(item),i]));
  items.sort((a,b)=>(ranks.get(itemKey(a))??Infinity)-(ranks.get(itemKey(b))??Infinity));
  return sortedItems(library,items);
}
