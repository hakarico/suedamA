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
export function sortedItems(library:Library,items:SidebarItem[]){return sortedMembers(library,items,'recent');}
export function sortedMembers(library:Library,items:SidebarItem[],parent:string){return sortInParent(library,items,parent,itemKey,item=>itemUpdatedAt(library,item));}
function sortInParent<T>(library:Library,items:T[],parent:string,key:(item:T)=>string,time:(item:T)=>number):T[]{
  const base=[...items].sort((a,b)=>time(b)-time(a));if(sidebarSort(library)==='time')return base;
  const moves=library.sidebarMoves??migrateSidebarMoves(library).sidebarMoves??{};
  const pinned=base.filter(item=>moves[key(item)]?.parent===parent).sort((a,b)=>moves[key(a)]!.index-moves[key(b)]!.index);
  const result=base.filter(item=>moves[key(item)]?.parent!==parent);
  for(const item of pinned)result.splice(Math.min(moves[key(item)]!.index,result.length),0,item);
  return result;
}
export function sortedFolders(library:Library):SidebarFolder[]{
  return sortInParent(library,Object.values(library.folders??{}),'folders',folder=>'folder:'+folder.id,folder=>Math.max(folder.createdAt,...folder.items.map(item=>itemUpdatedAt(library,item))));
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
  return sortedItems(library,items);
}

/** Recover a minimal set of moved rows from old full-list order snapshots. */
export function migrateSidebarMoves(library:Library):Library{
  if(library.sidebarMoves)return library;
  const moves:NonNullable<Library['sidebarMoves']>={};
  const infer=(base:string[],legacy:string[],parent:string)=>{
    const ranks=new Map(base.map((key,index)=>[key,index])),desired=legacy.filter(key=>ranks.has(key));
    const tails:number[]=[],previous:number[]=[];
    for(const [index,key]of desired.entries()){
      let low=0,high=tails.length;while(low<high){const mid=(low+high)>>>1;if(ranks.get(desired[tails[mid]!]!)!<ranks.get(key)!)low=mid+1;else high=mid;}
      previous[index]=low?tails[low-1]!:-1;tails[low]=index;
    }
    const kept=new Set<string>();for(let index=tails.at(-1)??-1;index>=0;index=previous[index]!)kept.add(desired[index]!);
    desired.forEach((key,index)=>{if(!kept.has(key))moves[key]={parent,index};});
  };
  if(sidebarSort(library)==='manual'){
    const timed={...library,sidebarSort:'time' as const};
    const legacy=library.recentOrder??[...Object.values(library.boards??{}).filter(b=>b.kind==='group').sort((a,b)=>(a.order??0)-(b.order??0)).map(b=>({kind:'board' as const,id:b.id})),...(library.sessionOrder??Object.keys(library.conversations)).map(id=>({kind:'session' as const,id}))];
    infer(recentItems(timed).map(itemKey),legacy.map(itemKey),'recent');
    for(const board of Object.values(library.boards??{})){const items=board.conversationIds.map(id=>({kind:'session' as const,id}));infer(sortedItems(timed,items).map(itemKey),items.map(itemKey),'board:'+board.id);}
    for(const folder of Object.values(library.folders??{}))infer(sortedItems(timed,folder.items).map(itemKey),folder.items.map(itemKey),'folder:'+folder.id);
    infer(sortedFolders(timed).map(f=>'folder:'+f.id),Object.values(library.folders??{}).sort((a,b)=>a.order-b.order).map(f=>'folder:'+f.id),'folders');
  }
  return {...library,sidebarMoves:moves};
}

/** Only dragged rows receive positions; all other rows continue to follow activity. */
export function recordSidebarMove(library:Library,parent:string,keys:string[],moved:string):Library{
  const moves={...migrateSidebarMoves(library).sidebarMoves};
  const ranks=new Map(keys.map((key,index)=>[key,index]));
  for(const [key,move]of Object.entries(moves))if(move.parent===parent&&ranks.has(key))moves[key]={...move,index:ranks.get(key)!};
  if(ranks.has(moved))moves[moved]={parent,index:ranks.get(moved)!};
  return {...library,sidebarMoves:moves,sidebarSort:'manual'};
}
