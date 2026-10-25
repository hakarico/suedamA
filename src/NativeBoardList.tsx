import {isSidebarMutation} from './dom-observers';
import {t,useLocale} from './i18n';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {CanvasStore,State} from './store';
import {OverlayPortal} from './OverlayPortal';
import {Icon} from './Icon';
import {boardForConversation} from './boards';
import {folderForItem,sidebarSort,sortedItems,sortedFolders,validSidebarItem,recentItems,itemKey} from './sidebar';
import {installSidebarDrag} from './sidebar-drag';
import type {CanvasBoard} from './model';
const cidOf=(link:HTMLAnchorElement)=>link.getAttribute('href')?.match(/\/chat\/s\/([\w-]+)/)?.[1];
type Target={id:string;title:string};
const NativeMore=()=> <span className="icon"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.40146" cy="8" r="1.15"/><circle cx="7.9976" cy="8" r="1.15"/><circle cx="12.5986" cy="8" r="1.15"/></svg></span>;
/** Native sessions remain owned by the website; only their presentation is grouped. */
export function NativeBoardList({store,state}:{store:CanvasStore;state:State}){useLocale();
  const [mount,setMount]=useState<HTMLElement>(),[topMount,setTopMount]=useState<HTMLElement>(),[sortMenu,setSortMenu]=useState<{x:number;y:number}>(),[menu,setMenu]=useState<HTMLElement>(),[shape,setShape]=useState('');
  const [target,setTarget]=useState<Target>(),[expanded,setExpanded]=useState<Record<string,boolean>>({});
  const [popup,setPopup]=useState<{board?:string;folder?:string;session?:Target;x:number;y:number}>(),[rename,setRename]=useState<{id:string;session?:boolean;folder?:boolean;title:string}>(),[deleting,setDeleting]=useState<string>();
  const [working,setWorking]=useState(false),[multi,setMulti]=useState('');
  const [selection,setSelection]=useState({active:false,ids:[] as string[],available:[] as string[]});
  const nativeSessions=useRef(new Map<string,HTMLAnchorElement>());
  const [submenu,setSubmenu]=useState<{target:Target;x:number;y:number;keyboard?:boolean}>();

  const submenuTimer=useRef<ReturnType<typeof setTimeout>>();
  const keepSubmenu=()=>{if(submenuTimer.current)clearTimeout(submenuTimer.current);};
  const leaveSubmenu=()=>{keepSubmenu();submenuTimer.current=setTimeout(()=>setSubmenu(undefined),180);};
  const showSubmenu=(anchor:HTMLElement,session:Target,keyboard=false)=>{keepSubmenu();const r=anchor.getBoundingClientRect(),menu=anchor.closest('[role=menu]')?.getBoundingClientRect()??r,width=Math.min(240,innerWidth-24);setSubmenu({target:session,x:menu.right+width+8<innerWidth?menu.right+4:Math.max(8,menu.left-width-4),y:Math.max(8,r.top-6),keyboard});};
  useEffect(()=>()=>keepSubmenu(),[]);
  const targetRef=useRef<Target>();
  useEffect(()=>{
    const owned=document.createElement('div');owned.dataset.suedama='groups';
    const toolbar=document.createElement('div');toolbar.dataset.suedama='groups-toolbar';let scroll:HTMLElement|undefined;const nativeLists=new Set<HTMLElement>(),scrolls=new Set<HTMLElement>();
    const addition=document.createElement('div');addition.dataset.suedama='session-menu';let queued=false,stopped=false,previousOrder:string|undefined;
    const css=document.createElement('style');css.textContent=`
      [data-suedama=groups],[data-suedama=groups-toolbar]{display:flex;flex-direction:column;gap:4px;color:var(--suedama-native-color);font:inherit;min-width:0}
      [data-suedama=groups] button,[data-suedama=groups-toolbar] button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer}
      [data-suedama=groups] .icon,[data-suedama=groups-toolbar] .icon{display:inline-flex;width:20px;height:20px;flex-shrink:0}
      [data-suedama=groups] .icon svg,[data-suedama=groups-toolbar] .icon svg{width:100%;height:100%;fill:currentColor}
      [data-suedama=groups] .organizer-row,[data-suedama=groups] .folder-row,[data-suedama=groups] .member-row{display:flex;align-items:center;min-height:40px;border-radius:10px;padding:0 6px;gap:2px}
      .fixture-history [data-suedama=groups] .organizer-row:hover,.fixture-history [data-suedama=groups] .folder-row:hover,.fixture-history [data-suedama=groups] .member-row:hover{background:rgb(255 255 255 / 6%)}
      .fixture-history [data-suedama=groups] .folder-row[aria-current=true]{background:rgb(255 255 255 / 8%)}
      [data-suedama=groups] .folder-icon{display:flex;align-items:center;justify-content:center;width:32px;height:36px;flex-shrink:0}
      [data-suedama=groups] .folder-name,[data-suedama=groups] .member-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;height:40px;padding:0 5px}
      [data-suedama=groups] .folder-more{width:32px;height:32px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:8px;opacity:0;pointer-events:none;transition:opacity .12s}
      [data-suedama=groups] .organizer-row:hover>.folder-more,[data-suedama=groups] .folder-row:hover>.folder-more,[data-suedama=groups] .member-row:hover>.folder-more,[data-suedama=groups] :is(.organizer-row,.folder-row,.member-row):has(:focus-visible)>.folder-more,[data-suedama=groups] .folder-more[aria-expanded=true]{opacity:1;pointer-events:auto}
      @media(hover:none){[data-suedama=groups] .folder-more{opacity:1;pointer-events:auto}}
      @media(prefers-reduced-motion:reduce){[data-suedama=groups] .folder-more{transition:none}}
      [data-suedama=groups] .member-select{width:32px;height:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0}
      [data-suedama=groups] .member-check{width:18px;height:18px;border:1px solid currentColor;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-sizing:border-box}
      [data-suedama=groups] .member-select[aria-checked=true] .member-check{background:var(--dsr-main, #4d6bfe);border-color:var(--dsr-main, #4d6bfe);color:white}
      [data-suedama=groups] .member-select:disabled{opacity:.35;cursor:default}
      [data-suedama=groups] .folder-more .icon{width:16px;height:16px}
      [data-suedama=groups] .folder-row .folder-icon:hover{background:rgb(255 255 255 / 12%);border-radius:8px}
      [data-suedama=groups] .folder-more:hover{background:rgb(255 255 255 / 8%)}
      [data-suedama=groups]{display:contents!important}
      [data-suedama-sidebar-scroll]{display:flex!important;flex-direction:column!important;gap:0!important}
      [data-suedama=groups] [data-folder-heading]{order:-40}
      [data-suedama=groups] .organizing-folders{order:-30}
      [data-suedama=groups] .sidebar-section-gap{order:-20}
      [data-suedama=groups] [data-recent-heading]{order:-10}
      [data-suedama=groups] .folder-zone{display:contents}
      [data-suedama-native-list],[data-suedama-native-list] ._3098d02,[data-suedama-native-list] .fixture-native-group{display:contents!important}
      html[data-suedama-recent=collapsed] [data-suedama-native-list]{display:none!important}
      [data-suedama=groups-toolbar]{margin:8px 0 0;flex-shrink:0}
      [data-suedama=groups] .folder-zone{overflow:visible}
      [data-suedama=groups] .icon-artboard svg,[data-suedama=groups-toolbar] .icon-artboard svg{fill:none!important}
      [data-suedama-sidebar-scroll]{min-height:0;overflow-y:auto!important;overscroll-behavior:contain}
      [data-suedama-native-list]{flex-shrink:0;margin-top:0!important;padding-top:0!important}
      html[data-suedama-recent=collapsed] [data-suedama-native-list]{display:none!important}
      html[data-suedama-groups] ._77cdc67 .f3d18f6a{display:none!important}
      [data-suedama=groups] .sidebar-section-heading{display:flex;align-items:center;gap:8px;min-height:34px;padding:4px 12px;text-align:left;font-size:13px;opacity:.6}
      [data-suedama=groups] .sidebar-section-heading:hover{opacity:1}
      [data-suedama=groups] .section-caret{display:inline-block;transition:transform .12s;font-size:17px}
      [data-suedama=groups] [aria-expanded=true]>.section-caret{transform:rotate(90deg)}
      [data-suedama=groups] .sidebar-section-gap{height:20px;flex-shrink:0}
      [data-suedama=groups-toolbar] .board-buffer{position:relative;height:40px;margin-top:0;padding:8px 6px 0;gap:4px;display:flex;align-items:flex-end;justify-content:flex-end;border-radius:9px;box-sizing:border-box;flex-shrink:0}
      [data-suedama=groups-toolbar] .buffer-hint{position:absolute;left:12px;right:118px;bottom:6px;pointer-events:none;opacity:0;font-size:11px;transition:opacity .12s;color:inherit}
      [data-suedama=groups-toolbar][data-session-dragging=true] .buffer-hint{opacity:.6}
      [data-suedama=groups-toolbar] .board-buffer[data-drop=true]{background:rgb(255 255 255 / 9%);outline:1px dashed #aaa8}
      [data-suedama=groups-toolbar] .board-buffer[data-drop=true] .buffer-hint{opacity:1}
      [data-suedama=groups-toolbar] .buffer-multi{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;padding:8px;flex-shrink:0}
      [data-suedama=groups-toolbar] .buffer-multi:hover{background:rgb(255 255 255 / 8%)}
      [data-suedama=groups-toolbar] .buffer-multi svg{width:16px;height:16px}
      html[data-suedama-groups] .b8812f16 ._8023265{display:none!important;pointer-events:none!important}
      [data-suedama=session-menu] .move-trigger{display:flex;align-items:center;gap:9px;min-width:160px}
      [data-suedama=session-menu] .move-trigger>.submenu-arrow{margin-left:auto;font-size:19px}
      [data-suedama=session-menu] .icon{width:18px;height:18px;display:inline-flex;flex-shrink:0}
      [data-suedama=session-menu] .icon svg{width:100%;height:100%;fill:currentColor}
      [data-suedama=groups] .folder-members{margin-left:18px;border-left:1px solid rgb(128 128 128 / 25%);padding-left:4px}
      html[data-suedama-session-order] ._77cdc67,html[data-suedama-session-order] .fixture-session-list{display:contents!important}
      html[data-suedama-session-order] ._77cdc67 ._3098d02,html[data-suedama-session-order] .fixture-session-list>div{display:contents!important}
      html[data-suedama-session-order] ._77cdc67 .f3d18f6a{display:none!important}
      html[data-suedama-recent=collapsed] [data-suedama-native-list]{display:none!important}
      [data-suedama=groups] [data-drop=true]>.organizer-row,[data-suedama=groups] [data-drop=true]>.folder-row{background:rgb(255 255 255 / 10%);outline:1px solid rgb(255 255 255 / 30%)}
    `;document.head.append(css);
    const originals=new Map<HTMLAnchorElement,{draggable:boolean;display:string;order:string;id?:string}>(),headers=new Map<HTMLElement,string>();
    let lastRows:{id:string;title:string}[]=[];
    const update=()=>{
      queued=false;if(stopped)return;const library=store.get().library;
      const native=[...document.querySelectorAll<HTMLElement>('[tabindex="0"],button,[role=button]')].find(e=>!e.closest('[data-suedama],.e5bf614e')&&(/^(开启新对话|新对话|New chat)$/i.test(e.textContent?.trim()??'')||[...e.querySelectorAll('svg path')].some(p=>p.getAttribute('d')?.includes('M7.34473 4.93945'))));
      toolbarExpected=!!native?.parentElement;
      if(native?.parentElement){if(toolbar.previousSibling!==native){native.after(toolbar);setTopMount(toolbar);}setShape(old=>old===native.className?old:native.className);owned.style.setProperty('--suedama-native-color',getComputedStyle(native).color);toolbar.style.setProperty('--suedama-native-color',getComputedStyle(native).color);}
      const list=document.querySelector<HTMLElement>('.b8812f16 ._77cdc67,.b8812f16 .fixture-session-list');
      mountExpected=!!list;
      if(list){scroll=list.closest<HTMLElement>('._6d215eb.ds-scroll-area')??list.parentElement??undefined;if(scroll&&scroll!==document.querySelector('.b8812f16')){if(owned.parentElement!==scroll){scroll.prepend(owned);setMount(owned);}scroll.dataset.suedamaSidebarScroll='true';scrolls.add(scroll);}list.dataset.suedamaNativeList='true';nativeLists.add(list);}
      document.documentElement.dataset.suedamaRecent=library.sidebarSections?.recent===false?'collapsed':'expanded';
      document.documentElement.setAttribute('data-suedama-groups','');
      const nativeMulti=document.querySelector<HTMLElement>('.b8812f16 ._8023265');setMulti(value=>value===(nativeMulti?.querySelector('svg')?.outerHTML??'')?value:nativeMulti?.querySelector('svg')?.outerHTML??'');
      const orderKey=JSON.stringify([sidebarSort(library),library.sessionOrder,library.recentOrder]),oldPositions=orderKey!==previousOrder?new Map([...originals.keys()].filter(e=>e.isConnected&&e.getClientRects().length).map(e=>[e,e.getBoundingClientRect().top])):undefined;previousOrder=orderKey;
      // The native list removes href in selection mode. Preserve identity before that transition.
      const links=[...(list?.querySelectorAll<HTMLAnchorElement>('a')??[])].filter(link=>!link.closest('[data-suedama]'));
      const sameOrder=links.length===lastRows.length&&links.every((link,i)=>link.querySelector('.c08e6e93')?.textContent===lastRows[i]!.title);
      for(const [link,value]of originals)if(!link.isConnected){link.draggable=value.draggable;link.style.display=value.display;link.style.order=value.order;originals.delete(link);}
      const nativeIds=links.map((link,i)=>cidOf(link)??originals.get(link)?.id??(sameOrder?lastRows[i]?.id:undefined)),order=recentItems(library,nativeIds.filter((id):id is string=>!!id)),ranks=new Map(order.map((item,i)=>[itemKey(item),i+10]));
      const grouped=new Set(Object.values(library.boards??{}).filter(b=>b.kind==='group').flatMap(b=>b.conversationIds));const filed=new Set(Object.values(library.folders??{}).flatMap(f=>f.items.filter(i=>i.kind==='session').map(i=>i.id)));
      const byId=new Map<string,HTMLAnchorElement>();
      for(const [i,link]of links.entries()){
        if(!originals.has(link))originals.set(link,{draggable:link.draggable,display:link.style.display,order:link.style.order});
        const original=originals.get(link)!,id=nativeIds[i];original.id=id;if(link.draggable)link.draggable=false;
        if(id)byId.set(id,link);
        const display=(id&&(grouped.has(id)||filed.has(id))||library.sidebarSections?.recent===false)?'none':original.display,rank=String(ranks.get('session:'+id)??order.length+10);
        if(link.style.display!==display)link.style.display=display;if(link.style.order!==rank)link.style.order=rank;
      }
      if(links.length&&links.every(link=>originals.get(link)?.id))lastRows=links.map(link=>({id:originals.get(link)!.id!,title:link.querySelector('.c08e6e93')?.textContent??''}));
      nativeSessions.current=byId;
      const active=links.some(link=>link.hasAttribute('aria-pressed')&&!!link.querySelector('.ds-checkbox'));
      document.documentElement.toggleAttribute('data-suedama-selecting',active);
      const ids=active?[...byId].filter(([,link])=>link.getAttribute('aria-pressed')==='true').map(([id])=>id):[],available=[...byId.keys()];
      setSelection(old=>old.active===active&&JSON.stringify(old.ids)===JSON.stringify(ids)&&JSON.stringify(old.available)===JSON.stringify(available)?old:{active,ids,available});
      document.documentElement.toggleAttribute('data-suedama-session-order',true);
      for(const group of document.querySelectorAll<HTMLElement>('._3098d02')){
        const header=group.querySelector<HTMLElement>('.f3d18f6a'),links=[...group.querySelectorAll<HTMLAnchorElement>('a[href*="/chat/s/"]')];
        if(header&&links.length){if(!headers.has(header))headers.set(header,header.style.display);header.style.display=links.every(l=>l.style.display==='none')?'none':headers.get(header)!;}
      }
      if(oldPositions&&!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const [el,y]of oldPositions){const next=el.getBoundingClientRect().top;if(el.getClientRects().length&&Math.abs(y-next)>1)el.animate([{transform:`translateY(${y-next}px)`},{transform:'translateY(0)'}],{duration:170,easing:'cubic-bezier(.2,.8,.2,1)'});}
      const nativePopup=[...document.querySelectorAll<HTMLElement>('.ds-dropdown-menu[role=menu]')].find(e=>!e.closest('[data-suedama]')&&/重命名|Rename/i.test(e.textContent??''));
      if(nativePopup&&targetRef.current){if(addition.parentElement!==nativePopup){nativePopup.querySelector('.ds-dropdown-menu-option--error')?.before(addition);if(!addition.parentElement)nativePopup.append(addition);setMenu(addition);}}
      else if(!nativePopup&&addition.parentElement){addition.remove();setMenu(undefined);}
    };
    const schedule=()=>{if(!queued){queued=true;queueMicrotask(update);}};
    const inputs=()=>{const s=store.get(),l=s.library;return [l.boards,l.folders,l.conversations,l.recentOrder,l.sessionOrder,l.sidebarSort,l.sidebarSections,s.open,s.current.conversationId];};let previous=inputs();
    const unsub=store.subscribe(()=>{const next=inputs();if(next.some((v,i)=>v!==previous[i])){previous=next;schedule();}});
    const stopDrag=installSidebarDrag(document,store,owned,toolbar,()=>scroll,id=>setExpanded(v=>({...v,[id]:true})));
    const click=(event:MouseEvent)=>{if(document.documentElement.hasAttribute('data-suedama-selecting'))return;const el=event.target as Element,link=el.closest<HTMLAnchorElement>('a[href*="/chat/s/"]');if(link&&!link.closest('[data-suedama]')&&!el.closest('button,[role=button]')&&store.get().open&&!store.adapter.navigationInProgress?.()){const id=cidOf(link);if(id){event.preventDefault();event.stopImmediatePropagation();void store.openNativeSession(id,link.querySelector('.c08e6e93')?.textContent??link.textContent??undefined);return;}}if(link&&!link.closest('[data-suedama]')&&el.closest('button,[role=button]')){const id=cidOf(link);if(id){targetRef.current={id,title:link.querySelector('.c08e6e93')?.textContent??link.textContent??t("DeepSeek 对话")};setTarget(targetRef.current);schedule();}}};
    document.addEventListener('click',click,true);
    const observer=new MutationObserver(records=>{if(mountExpected&&!owned.isConnected||toolbarExpected&&!toolbar.isConnected||records.some(isSidebarMutation))schedule();});let mountExpected=false,toolbarExpected=false;observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-pressed','href']});update();
    return()=>{stopDrag();stopped=true;unsub();observer.disconnect();document.removeEventListener('click',click,true);for(const [link,value]of originals){link.draggable=value.draggable;link.style.display=value.display;link.style.order=value.order;}for(const [header,value]of headers)header.style.display=value;for(const list of nativeLists)list.removeAttribute('data-suedama-native-list');for(const el of scrolls)el.removeAttribute('data-suedama-sidebar-scroll');nativeSessions.current.clear();document.documentElement.removeAttribute('data-suedama-selecting');document.documentElement.removeAttribute('data-suedama-groups');document.documentElement.removeAttribute('data-suedama-session-order');document.documentElement.removeAttribute('data-suedama-recent');owned.remove();toolbar.remove();addition.remove();css.remove();};
  },[store]);
  useEffect(()=>{if(!popup&&!submenu&&!sortMenu)return;const close=(e:PointerEvent)=>{if(e.composedPath().some(el=>el instanceof Element&&el.matches('[data-suedama-board-submenu],.sidebar-sort-menu')))return;setPopup(undefined);setSubmenu(undefined);setSortMenu(undefined);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[popup,submenu,sortMenu]);
  useEffect(()=>{if(!popup&&!rename&&!deleting&&!submenu&&!sortMenu)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&e.isTrusted){e.stopImmediatePropagation();if(working)return;if(submenu){setSubmenu(undefined);menu?.querySelector<HTMLElement>('.move-trigger')?.focus();return;}setPopup(undefined);setSubmenu(undefined);setRename(undefined);setDeleting(undefined);setSortMenu(undefined);}};window.addEventListener('keydown',close,true);return()=>window.removeEventListener('keydown',close,true);},[popup,rename,deleting,working,submenu,sortMenu]);
  const positions=useRef(new Map<string,number>());
  useLayoutEffect(()=>{if(!mount)return;const next=new Map<string,number>();for(const el of mount.querySelectorAll<HTMLElement>('.folder-row,[data-suedama-session]')){const key=el.dataset.suedamaSession??el.dataset.entryId??el.dataset.folderId;if(!key||!el.getClientRects().length)continue;const y=el.getBoundingClientRect().top,old=positions.current.get(key);next.set(key,y);if(old!==undefined&&Math.abs(y-old)>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches)el.animate([{transform:`translateY(${old-y}px)`},{transform:'translateY(0)'}],{duration:170,easing:'cubic-bezier(.2,.8,.2,1)'});}positions.current=next;},[mount,state.library.boards,state.library.folders,state.library.sidebarSort,state.library.recentOrder,expanded]);
  const dismissMenu=()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  const groups=Object.values(state.library.boards??{}).filter(b=>b.kind==='group').sort((a,b)=>(a.order??0)-(b.order??0));
  const run=async(action:()=>Promise<unknown>)=>{setWorking(true);try{await action();}catch(e){store.notice(e instanceof Error?e.message:String(e));}finally{setWorking(false);}};
  const action=(text:string,fn:()=>void,danger=false)=><button className={danger?'danger':''} onClick={()=>{setPopup(undefined);fn();}}>{text}</button>;
  const folder=deleting&&(state.library.boards?.[deleting]??state.library.folders?.[deleting]),organizing=!!deleting&&!!state.library.folders?.[deleting];
  // Keep the persisted upper-section key compatible with existing backups.
  const sections={boards:true,recent:true,...state.library.sidebarSections};
  const recentRanks=new Map(recentItems(state.library,selection.available).map((item,i)=>[itemKey(item),i+10]));
  const boardItems=sortedItems(state.library,groups.filter(b=>!folderForItem(state.library,{kind:'board',id:b.id})).map(b=>({kind:'board' as const,id:b.id})));
  const folders=sortedFolders(state.library);
  const rowMenu=(event:React.MouseEvent<HTMLButtonElement>,value:{board?:string;folder?:string;session?:Target})=>{const r=event.currentTarget.getBoundingClientRect();setPopup({...value,x:r.right,y:r.bottom});};
  const toggleSession=(id:string)=>{const link=nativeSessions.current.get(id);if(link?.isConnected)link.click();else store.notice(t("该会话尚未载入官网列表，请先在侧栏中载入后再选择。"));};
  const sessionRow=(cid:string,organizer?:string)=>{const c=state.library.conversations[cid];return c&&!c.deleted&&<div key={cid} className={'member-row _546d736'+(!state.open&&state.current.conversationId===cid?' b64fb9ae':'')} data-suedama-session={cid} data-session-title={c.title} data-entry-kind={organizer?'session':undefined} data-entry-id={organizer?cid:undefined} data-entry-folder={organizer}>{selection.active&&<button className="member-select" role="checkbox" aria-label={t("选择")+c.title} aria-checked={selection.ids.includes(cid)} disabled={!selection.available.includes(cid)} onClick={()=>toggleSession(cid)}><span className="member-check" aria-hidden="true">{selection.ids.includes(cid)?'✓':''}</span></button>}<button className="member-name" onClick={()=>selection.active?toggleSession(cid):void store.openNativeSession(cid,c.title)}>{c.title}</button>{!selection.active&&<button className="folder-more" aria-haspopup="menu" aria-expanded={popup?.session?.id===cid} aria-label={c.title+t("菜单")} onClick={e=>rowMenu(e,{session:{id:cid,title:c.title}})}><NativeMore/></button>}</div>;};
  const boardRow=(b:CanvasBoard,organizer?:string)=><div key={b.id} data-suedama-board={b.id} style={organizer?undefined:{order:recentRanks.get('board:'+b.id)??10}}><div data-folder-title={b.title} data-entry-kind="board" data-entry-id={b.id} data-entry-folder={organizer} className={'folder-row _546d736'+(state.open&&state.canvasId===b.id?' b64fb9ae':'')} aria-current={state.open&&state.canvasId===b.id}><button className="folder-icon" aria-label={t("进入")+b.title} onClick={()=>store.openBoard(b.id)}><Icon name="artboard"/></button><button className="folder-name" aria-expanded={!!expanded[b.id]} onClick={()=>setExpanded(v=>({...v,[b.id]:!v[b.id]}))}>{b.title}</button><button className="folder-more" aria-haspopup="menu" aria-expanded={popup?.board===b.id} aria-label={b.title+t("菜单")} onClick={e=>rowMenu(e,{board:b.id})}><NativeMore/></button></div>{expanded[b.id]&&<div className="folder-members">{sortedItems(state.library,b.conversationIds.map(id=>({kind:'session' as const,id}))).map(item=>sessionRow(item.id))}</div>}</div>;
  return <>{topMount&&createPortal(<>
    <div role="button" tabIndex={0} className={shape} aria-label={t("新建白板")} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',boxSizing:'border-box',minHeight:42,cursor:'pointer',color:'inherit'}} onClick={()=>store.newBoard()} onKeyDown={e=>{if(e.key==='Enter')store.newBoard();}}><Icon name="plus"/><span>{t("新建白板")}</span></div>
    <div className="board-buffer" data-suedama-new-board-drop="true" aria-label={t("拖入会话以新建白板")}><span className="buffer-hint">{t("拖到这里新建白板")}</span><button className="buffer-multi" aria-label={t("新建文件夹")} title={t("新建文件夹")} onClick={()=>{const id=store.newFolder();setExpanded(v=>({...v,[id]:true}));if(!sections.boards)store.toggleSidebarSection('boards');}}><Icon name="folders"/></button><button className="buffer-multi" aria-label={t("排序")} title={t("排序")} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setSortMenu({x:r.left,y:r.bottom});}}><Icon name="sort"/></button><button className="buffer-multi" aria-label={t("多选会话")} title={t("多选会话")} disabled={!multi} onClick={()=>document.querySelector<HTMLElement>('.b8812f16 ._8023265')?.click()} dangerouslySetInnerHTML={{__html:multi}}/></div>
  </>,topMount)}{mount&&createPortal(<>
    <button className="sidebar-section-heading" data-folder-heading="true" aria-expanded={sections.boards} onClick={()=>store.toggleSidebarSection('boards')}>{t("文件夹")} <span className="section-caret" aria-hidden="true">›</span></button>
    {sections.boards&&<div className="organizing-folders">{folders.map(f=><div key={f.id} data-suedama-folder={f.id}><div className="organizer-row _546d736" data-folder-id={f.id} data-folder-title={f.title}><button className="folder-icon" aria-label={t("展开")+f.title} aria-expanded={!!expanded[f.id]} onClick={()=>setExpanded(v=>({...v,[f.id]:!v[f.id]}))}><Icon name="folder-simple"/></button><button className="folder-name" aria-expanded={!!expanded[f.id]} onClick={()=>setExpanded(v=>({...v,[f.id]:!v[f.id]}))}>{f.title}</button><button className="folder-more" aria-haspopup="menu" aria-expanded={popup?.folder===f.id} aria-label={f.title+t("菜单")} onClick={e=>rowMenu(e,{folder:f.id})}><NativeMore/></button></div>{expanded[f.id]&&<div className="folder-members">{sortedItems(state.library,f.items.filter(item=>validSidebarItem(state.library,item))).map(item=>item.kind==='board'?boardRow(state.library.boards![item.id]!,f.id):sessionRow(item.id,f.id))}</div>}</div>)}</div>}
    <div className="sidebar-section-gap" aria-hidden="true"/>
    <button className="sidebar-section-heading" data-recent-heading="true" data-board-heading="true" aria-expanded={sections.recent} onClick={()=>store.toggleSidebarSection('recent')}>{t("最近")} <span className="section-caret" aria-hidden="true">›</span></button>
    {sections.recent&&<section className="folder-zone" aria-label={t("白板与会话")}>{boardItems.map(item=>boardRow(state.library.boards![item.id]!))}</section>}
  </>,mount)}{menu&&target&&createPortal(<>
    <div role="menuitem" tabIndex={0} className="ds-dropdown-menu-option ds-dropdown-menu-option--none" onClick={()=>{store.moveSessionToNewBoard(target.id,target.title);dismissMenu();}}>{t("将session移至新白板")}</div>
    {!!groups.length&&<div role="menuitem" tabIndex={0} aria-haspopup="menu" aria-expanded={!!submenu} className="ds-dropdown-menu-option move-trigger" onPointerDown={e=>e.stopPropagation()} onMouseEnter={e=>showSubmenu(e.currentTarget,target)} onMouseLeave={leaveSubmenu} onClick={e=>{e.preventDefault();e.stopPropagation();showSubmenu(e.currentTarget,target);}} onKeyDown={e=>{if(['ArrowRight','Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();showSubmenu(e.currentTarget,target,true);}}}><Icon name="artboard"/><span>{t("移入白板")}</span><span className="submenu-arrow" aria-hidden="true">›</span></div>}
  </>,menu)}
    {(popup||rename||folder||submenu||sortMenu)&&<OverlayPortal>
    {sortMenu&&<div className="board-submenu sidebar-sort-menu" role="menu" aria-label={t("聊天排序方式")} style={{left:Math.max(8,Math.min(sortMenu.x,innerWidth-248)),top:Math.min(sortMenu.y,innerHeight-120)}} onPointerDown={e=>e.stopPropagation()}>{(['time','manual'] as const).map(mode=><button key={mode} role="menuitemradio" aria-checked={sidebarSort(state.library)===mode} onClick={()=>{store.setSidebarSort(mode);setSortMenu(undefined);}}><span>{mode==='time'?t("最近更新"):t("手动排序")}</span><span aria-hidden="true">{sidebarSort(state.library)===mode?'✓':''}</span></button>)}</div>}
    {submenu&&<div ref={el=>{if(el){const y=Math.max(8,Math.min(submenu.y,innerHeight-el.getBoundingClientRect().height-8));if(Math.abs(y-submenu.y)>1)setSubmenu(v=>v?{...v,y}:v);}}} className="board-submenu" data-suedama-board-submenu="true" role="menu" aria-label={t("选择白板")} style={{left:submenu.x,top:submenu.y}} onMouseEnter={keepSubmenu} onMouseLeave={leaveSubmenu} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(((e.currentTarget.getRootNode() as ShadowRoot).activeElement??document.activeElement) as HTMLButtonElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(index+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}if(e.key==='ArrowLeft'||e.key==='Escape'){e.preventDefault();e.stopPropagation();setSubmenu(undefined);menu?.querySelector<HTMLElement>('.move-trigger')?.focus();}}}>{groups.map((b,i)=><button role="menuitem" autoFocus={submenu.keyboard&&i===0} key={b.id} disabled={b.conversationIds.includes(submenu.target.id)} onClick={()=>{store.moveSession(submenu.target.id,b.id,submenu.target.title);setExpanded(v=>({...v,[b.id]:true}));setSubmenu(undefined);dismissMenu();}}><Icon name="artboard"/><span>{b.title}</span>{b.conversationIds.includes(submenu.target.id)&&<span aria-hidden="true">✓</span>}</button>)}</div>}
    {popup&&<div className="card-menu secondary-menu folder-popup" role="menu" style={{position:'fixed',left:Math.max(8,Math.min(popup.x,innerWidth-220)),top:Math.min(popup.y,innerHeight-290),zIndex:420,pointerEvents:'auto'}} onPointerDown={e=>e.stopPropagation()}>
      {action(t("重命名"),()=>setRename({id:popup.folder??popup.board??popup.session!.id,folder:!!popup.folder,session:!!popup.session,title:popup.folder?state.library.folders![popup.folder]!.title:popup.board?state.library.boards![popup.board]!.title:popup.session!.title}))}
      {popup.folder?action(t("删除文件夹"),()=>setDeleting(popup.folder),true):popup.board?action(t("删除白板"),()=>setDeleting(popup.board),true):<>
        {action(t("置顶 / 取消置顶"),()=>void store.manageSession(popup.session!.id,'pin'))}
        {action(t("分享"),()=>void store.manageSession(popup.session!.id,'share'))}
        {action(t("多选"),()=>void store.manageSession(popup.session!.id,'multi'))}
        {folderForItem(state.library,{kind:'session',id:popup.session!.id})?action(t("移出文件夹"),()=>store.moveSidebarItem({kind:'session',id:popup.session!.id})):action(t("移出白板"),()=>store.moveSession(popup.session!.id))}
        {action(t("删除"),()=>void store.manageSession(popup.session!.id,'delete'),true)}
      </>}
    </div>}
    {rename&&<div className="folder-dialog-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget&&!working)setRename(undefined);}}><form className="folder-dialog" onSubmit={e=>{e.preventDefault();void run(async()=>{if(rename.session)await store.renameSession(rename.id,rename.title);else if(rename.folder)store.renameFolder(rename.id,rename.title);else store.renameBoard(rename.title,rename.id);setRename(undefined);});}}><h3>{t(rename.session?"重命名会话":rename.folder?"重命名文件夹":"重命名白板")}</h3><input autoFocus aria-label={t("名称")} value={rename.title} onChange={e=>setRename({...rename,title:e.target.value})}/><div className="actions"><button disabled={working||!rename.title.trim()}>{t("保存")}</button><button type="button" disabled={working} onClick={()=>setRename(undefined)}>{t("取消")}</button></div></form></div>}
    {folder&&<div className="folder-dialog-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget&&!working)setDeleting(undefined);}}><div className="folder-dialog" role="dialog" aria-modal="true" aria-label={organizing?t("删除文件夹"):t("删除白板")}><h3>{t("删除“{0}”？",{"0":folder.title})}</h3><p>{organizing?t("仅删除文件夹会释放内部白板与会话，保持原有白板归属。删除内部内容会同时删除其中白板和官网对话，无法恢复。"):t("仅删除白板会将 {0} 个官方会话移回原列表。删除内部 session 会同时删除官网对话，无法恢复。",{"0":'conversationIds' in folder?folder.conversationIds.length:0})}</p><div className="actions"><button disabled={working} onClick={()=>void run(async()=>{if(organizing)await store.deleteFolder(folder.id);else await store.deleteBoard(folder.id);setDeleting(undefined);})}>{organizing?t("仅删除文件夹"):t("仅删除白板")}</button><button className="danger" disabled={working} onClick={()=>void run(async()=>{if(organizing)await store.deleteFolder(folder.id,true);else await store.deleteBoard(folder.id,true);setDeleting(undefined);})}>{organizing?t("删除文件夹和内部内容"):t("删除白板和内部session")}</button><button disabled={working} onClick={()=>setDeleting(undefined)}>{t("取消")}</button></div></div></div>}
    </OverlayPortal>}
  </>;
}
