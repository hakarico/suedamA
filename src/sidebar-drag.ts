import type {CanvasStore} from './store';
import type {SidebarItem} from './model';
import {sidebarEdgeSpeed} from './sidebar';

const cidOf=(link:Element)=>link.getAttribute('href')?.match(/\/chat\/s\/([\w-]+)/)?.[1];
type Drag={el:HTMLElement;id:string;title:string;kind:'session'|'board'|'folder';x:number;y:number;pointer:number;moved:boolean;opacity:string;offsetX:number;offsetY:number};
type Drop={type:'new-board'|'board'|'folder'|'recent'|'board-order'|'folder-order'|'recent-order';id?:string;before?:string;item?:SidebarItem;row?:HTMLElement;after?:boolean;highlight?:HTMLElement};
/** One gesture spans both sections and scrolls the shared native viewport at its edges. */
export function installSidebarDrag(doc:Document,store:CanvasStore,owned:HTMLElement,toolbar:HTMLElement,getScroll:()=>HTMLElement|undefined,expand:(id:string)=>void){
  let moving:Drag|undefined,ghost:HTMLElement|undefined,line:HTMLElement|undefined,hover:HTMLElement|undefined,frame=0,suppressClick=0,point={x:0,y:0};
  const ordinaryRows=()=>[...doc.querySelectorAll<HTMLAnchorElement>('.b8812f16 a[href*="/chat/s/"]')].filter(e=>!e.closest('[data-suedama]')&&e.getClientRects().length&&getComputedStyle(e).display!=='none').sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
  const recentRows=()=>[...owned.querySelectorAll<HTMLElement>('.folder-zone>[data-suedama-board]'),...ordinaryRows()].filter(e=>e.getClientRects().length).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
  const recentItem=(row:HTMLElement):SidebarItem=>row.dataset.suedamaBoard?{kind:'board',id:row.dataset.suedamaBoard}:{kind:'session',id:cidOf(row)!};
  const afterRow=(row:HTMLElement,y:number)=>y>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
  const itemOf=(row:HTMLElement):SidebarItem=>({kind:row.dataset.entryKind as SidebarItem['kind'],id:row.dataset.entryId!});
  const folderInsert=(folder:HTMLElement,row:HTMLElement,y:number):Drop=>{const rows=[...folder.querySelectorAll<HTMLElement>('[data-entry-folder]')].filter(e=>e.dataset.entryFolder===folder.dataset.suedamaFolder),after=afterRow(row,y),next=after?rows[rows.indexOf(row)+1]:row;return {type:'folder',id:folder.dataset.suedamaFolder,item:next&&itemOf(next),row,after};};
  const placementAt=(x:number,y:number):Drop|undefined=>{
    if(!moving)return;const el=doc.elementFromPoint(x,y);if(!el||el.closest('.sidebar-section-gap'))return;
    const buffer=el.closest<HTMLElement>('[data-suedama-new-board-drop]');if(buffer)return moving.kind==='session'?{type:'new-board',highlight:buffer}:undefined;
    const folder=el.closest<HTMLElement>('[data-suedama-folder]'),board=el.closest<HTMLElement>('[data-suedama-board]'),member=el.closest<HTMLElement>('[data-suedama-session]');
    if(moving.kind==='folder'){
      if(!folder)return;const folders=[...owned.querySelectorAll<HTMLElement>('[data-suedama-folder]')],row=folder.querySelector<HTMLElement>('.organizer-row')!,after=afterRow(row,y);return {type:'folder-order',before:(after?folders[folders.indexOf(folder)+1]:folder)?.dataset.suedamaFolder,row,after};
    }
    if(member&&board&&moving.kind==='session'){
      const rows=[...board.querySelectorAll<HTMLElement>('[data-suedama-session]')],after=afterRow(member,y);return {type:'board',id:board.dataset.suedamaBoard,before:(after?rows[rows.indexOf(member)+1]:member)?.dataset.suedamaSession,row:member,after};
    }
    if(board){
      const row=board.querySelector<HTMLElement>(':scope>.folder-row')!,r=row.getBoundingClientRect();
      if(folder&&(moving.kind==='board'||y<r.top+8||y>r.bottom-8))return folderInsert(folder,row,y);
      if(moving.kind==='session'&&y>=r.top+10&&y<=r.bottom-10)return {type:'board',id:board.dataset.suedamaBoard,highlight:board};
      if(!folder){const after=afterRow(row,y),rows=recentRows(),next=after?rows[rows.indexOf(board)+1]:board;return {type:'recent-order',item:next&&recentItem(next),row,after};}
      const rows=[...owned.querySelectorAll<HTMLElement>('.folder-zone>[data-suedama-board]')],after=afterRow(row,y);return {type:'board-order',before:(after?rows[rows.indexOf(board)+1]:board)?.dataset.suedamaBoard,row,after};
    }
    if(folder){if(member)return folderInsert(folder,member,y);return {type:'folder',id:folder.dataset.suedamaFolder,highlight:folder};}
    const row=el.closest<HTMLAnchorElement>('a[href*="/chat/s/"]');
    if(row&&!row.closest('[data-suedama]')){const after=afterRow(row,y),mixed=recentRows(),next=after?mixed[mixed.indexOf(row)+1]:row;return {type:'recent-order',item:next&&recentItem(next),row,after};}
    if(el.closest('.folder-zone,[data-board-heading]'))return {type:'recent-order',item:recentRows()[0]&&recentItem(recentRows()[0]!)};
    const scroll=getScroll(),recent=owned.querySelector<HTMLElement>('[data-recent-heading]');if(scroll?.contains(el)&&recent&&y>=recent.getBoundingClientRect().top){const mixed=recentRows(),target=mixed.find(r=>y<r.getBoundingClientRect().top+r.getBoundingClientRect().height/2);return {type:'recent-order',item:target&&recentItem(target),row:target??mixed.at(-1),after:!target};}
  };
  const clearVisuals=()=>{cancelAnimationFrame(frame);frame=0;hover?.removeAttribute('data-drop');hover=undefined;owned.removeAttribute('data-session-dragging');toolbar.removeAttribute('data-session-dragging');line?.remove();line=undefined;};
  const paint=()=>{frame=0;if(!moving?.moved||!ghost)return;
    const scroll=getScroll(),r=scroll?.getBoundingClientRect(),speed=r&&point.x>=r.left&&point.x<=r.right?sidebarEdgeSpeed(point.y,r.top,r.bottom):0;
    if(scroll&&speed)scroll.scrollTop+=speed;
    ghost.style.transform=`translate3d(${point.x-moving.offsetX}px,${point.y-moving.offsetY}px,0)`;
    const drop=placementAt(point.x,point.y);if(hover!==drop?.highlight){hover?.removeAttribute('data-drop');hover=drop?.highlight;}hover?.setAttribute('data-drop','true');
    if(drop?.row&&line){const rect=drop.row.getBoundingClientRect();line.style.cssText=`position:fixed;pointer-events:none;z-index:1100;left:${rect.left}px;top:${drop.after?rect.bottom:rect.top}px;width:${rect.width}px;height:2px;background:#aaa;border-radius:2px;display:block`;}
    else if(line)line.style.display='none';if(speed)frame=requestAnimationFrame(paint);
  };
  const down=(event:PointerEvent)=>{
    if(doc.documentElement.hasAttribute('data-suedama-selecting'))return;
    if(event.button!==0)return;const target=event.target as Element;if(target.closest('.folder-more,.folder-icon,.sidebar-section-heading,.board-buffer,._8023265'))return;
    const el=target.closest<HTMLElement>('[data-suedama-session],a[href*="/chat/s/"],.folder-row,.organizer-row');if(!el||!el.closest('.b8812f16'))return;
    if(el.matches('a')&&target.closest('button,[role=button]'))return;
    const kind=el.classList.contains('organizer-row')?'folder':el.classList.contains('folder-row')?'board':'session',id=kind==='folder'?el.dataset.folderId:kind==='board'?el.dataset.entryId:el.dataset.suedamaSession??cidOf(el);if(!id)return;
    const r=el.getBoundingClientRect();moving={el,id,kind,title:el.dataset.folderTitle??el.dataset.sessionTitle??el.querySelector('.c08e6e93')?.textContent??el.textContent??'DeepSeek 对话',offsetX:event.clientX-r.left,offsetY:event.clientY-r.top,x:event.clientX,y:event.clientY,pointer:event.pointerId,moved:false,opacity:el.style.opacity};
  };
  const move=(event:PointerEvent)=>{if(!moving||moving.pointer!==event.pointerId)return;point={x:event.clientX,y:event.clientY};
    if(!moving.moved&&Math.hypot(point.x-moving.x,point.y-moving.y)>6){moving.moved=true;owned.dataset.sessionDragging='true';toolbar.dataset.sessionDragging='true';moving.el.setPointerCapture?.(event.pointerId);moving.el.style.opacity='.25';
      ghost=doc.createElement('div');ghost.dataset.suedama='drag-preview';ghost.textContent=moving.title;ghost.style.cssText=`position:fixed;left:0;top:0;z-index:1100;pointer-events:none;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid #ffffff25;border-radius:10px;background:#252525ee;box-shadow:0 8px 28px #0005;padding:9px 14px;color:#ddd;font:14px/1.5 sans-serif;transform:translate3d(${point.x-moving.offsetX}px,${point.y-moving.offsetY}px,0)`;doc.body.append(ghost);line=doc.createElement('div');line.dataset.suedama='drag-line';line.style.display='none';doc.body.append(line);
    }if(moving.moved){event.preventDefault();if(!frame)frame=requestAnimationFrame(paint);}
  };
  const up=(event:PointerEvent)=>{if(!moving||moving.pointer!==event.pointerId)return;const active=moving,drop=placementAt(event.clientX,event.clientY);moving=undefined;active.el.style.opacity=active.opacity;
    if(active.moved){event.preventDefault();suppressClick=performance.now()+350;
      if(drop){if(drop.type==='recent-order'&&active.kind!=='folder'){if(active.kind==='session')store.moveSession(active.id,undefined,active.title);store.reorderRecent({kind:active.kind,id:active.id},drop.item,ordinaryRows().map(cidOf).filter((id):id is string=>!!id));}
        else if(active.kind==='folder'){if(drop.type==='folder-order')store.reorderFolders(active.id,drop.before);}
        else if(drop.type==='folder'){store.moveSidebarItem({kind:active.kind,id:active.id},drop.id,drop.item,active.title);if(drop.id)expand(drop.id);}
        else if(active.kind==='board'){if(drop.type==='board-order')store.reorderBoards(active.id,drop.before);else if(drop.type==='recent')store.moveSidebarItem({kind:'board',id:active.id});}
        else if(drop.type==='new-board')expand(store.moveSessionToNewBoard(active.id,active.title));
        else if(drop.type==='board'&&drop.before!==active.id){store.moveSession(active.id,drop.id,active.title,{before:drop.before});if(drop.id)expand(drop.id);}
        else if(drop.type==='recent'&&drop.before!==active.id)store.moveSession(active.id,undefined,active.title,{before:drop.before,order:ordinaryRows().map(cidOf).filter((id):id is string=>!!id)});
      }if(active.el.hasPointerCapture?.(event.pointerId))active.el.releasePointerCapture(event.pointerId);
    }
    clearVisuals();const leaving=ghost;ghost=undefined;if(leaving){if(matchMedia('(prefers-reduced-motion:reduce)').matches)leaving.remove();else leaving.animate([{opacity:1},{opacity:0,scale:'.96'}],{duration:140,fill:'forwards'}).onfinish=()=>leaving.remove();}
  };
  const cancel=()=>{if(moving)moving.el.style.opacity=moving.opacity;moving=undefined;clearVisuals();ghost?.remove();ghost=undefined;};
  const click=(event:MouseEvent)=>{const target=event.target as Element,menu=target.closest('.folder-more,.folder-icon')||target.closest('a[href]')&&target.closest('button,[role=button]');if(!menu&&performance.now()<suppressClick&&target.closest('a[href*="/chat/s/"],[data-suedama-session],.folder-row,.organizer-row')){event.preventDefault();event.stopImmediatePropagation();}};
  const preventNativeDrag=(event:DragEvent)=>{if((event.target as Element).closest('.b8812f16 a[href*="/chat/s/"],[data-suedama-session]'))event.preventDefault();};
  doc.addEventListener('pointerdown',down,true);doc.addEventListener('pointermove',move,{capture:true,passive:false});doc.addEventListener('pointerup',up,true);doc.addEventListener('pointercancel',cancel,true);doc.addEventListener('click',click,true);doc.addEventListener('dragstart',preventNativeDrag,true);
  return()=>{cancel();doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerup',up,true);doc.removeEventListener('pointercancel',cancel,true);doc.removeEventListener('click',click,true);doc.removeEventListener('dragstart',preventNativeDrag,true);};
}
