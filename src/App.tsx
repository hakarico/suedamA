import {t,useLocale} from './i18n';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {Canvas,type CardMenu} from './Canvas';
import {displayQuestion,turnQuotes,HISTORY_COLORS,type Card,type Role,type Quote} from './model';
import {installNativeReadonly} from './native-readonly';
import {NavigationRail} from './NavigationRail';
import {belongsToBoard,boardAppearance} from './boards';
import {isArchived} from './topology';
import {selectedParts} from './native-selection';
import {Icon,type IconName} from './Icon';
import {CanvasStore,errorText} from './store';
import {NativeComposer} from './NativeComposer';
import {OverlayPortal} from './OverlayPortal';
import {SettingsPanel,download} from './SettingsPanel';
import {selectedNotes} from './notes';
import {NativeConversation} from './NativeConversation';
import {NativeBoardList} from './NativeBoardList';
import {useNativeChrome} from './use-native-chrome';
import {ImageLightbox} from './ImageLightbox';
import {ReferenceHighlight} from './ReferenceHighlight';

type SelectionQuote={quotes:Quote[];x:number;y:number;target?:string};
export function App({store}:{store:CanvasStore}){useLocale();
  const [image,setImage]=useState<string>();
  const state=useSyncExternalStore(store.subscribe,store.get);
  const {library,open,preview,archives}=state;const chrome=useNativeChrome(open);
  const [menu,setMenu]=useState<CardMenu>(),[selection,setSelection]=useState<SelectionQuote>();
  const [settings,setSettings]=useState(false),[searchOpen,setSearchOpen]=useState(false),[search,setSearch]=useState('');
  const frozenTarget=useRef<string>();const closeImage=useCallback(()=>setImage(undefined),[]);
  useLayoutEffect(()=>state.archiveReader?installNativeReadonly(document,()=>store.get().library,()=>store.adapter.read()):undefined,[!!state.archiveReader,store]);
  const board=library.boards?.[state.canvasId],appearance=boardAppearance(library,state.canvasId);
  const showMenu=useCallback((m:CardMenu)=>setMenu({...m,x:Math.max(12,Math.min(m.x,innerWidth-210)),y:Math.max(16,Math.min(m.y,innerHeight-230))}),[]);
  const openSettings=useCallback(()=>setSettings(v=>!v),[]);
  const jump=useCallback((quotes:Quote[])=>{setSelection(undefined);store.jumpReference(quotes);},[store]);
  useEffect(()=>{if(!open)return;const previous=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';return()=>{document.documentElement.style.overflow=previous;};},[open]);
  useEffect(()=>{const clear=()=>{if(window.getSelection()?.isCollapsed)setSelection(undefined);};document.addEventListener('selectionchange',clear);return()=>document.removeEventListener('selectionchange',clear);},[]);
  useEffect(()=>{
    const nativeEscapes=new WeakSet<Event>();const noteNative=(e:KeyboardEvent)=>{if(e.key==='Escape'&&document.querySelector('.ds-dropdown-menu'))nativeEscapes.add(e);};
    const key=(e:KeyboardEvent)=>{
      if(nativeEscapes.has(e))return;
      if(state.archiveReader){if(e.key==='Escape'&&!chrome.modal){e.preventDefault();store.closeArchiveReader();}return;}
      if(!open)return;
      if(e.key==='Escape'){if(!e.isTrusted||chrome.modal||e.composedPath().some(el=>el instanceof Element&&el.matches('.folder-dialog-backdrop,.folder-popup')))return;if(image)setImage(undefined);else if(selection)setSelection(undefined);else if(menu)setMenu(undefined);else if(settings||archives){setSettings(false);if(archives)store.returnToCanvas();}else if(searchOpen)setSearchOpen(false);else if(archives)store.returnToCanvas();else if(preview)store.togglePreview();else store.setOpen(false);}
      const editing=(e.composedPath()[0] as Element)?.closest?.('textarea,input,[contenteditable=true]');
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&!editing){e.preventDefault();setSearchOpen(true);}
      if(!preview&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();store.replay(e.shiftKey?'redo':'undo');}
    };
    window.addEventListener('keydown',noteNative,true);window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',noteNative,true);window.removeEventListener('keydown',key);};
  },[image,selection,menu,settings,searchOpen,archives,preview,open,store,chrome.modal,state.archiveReader]);
  const selectText=useCallback((e:React.MouseEvent)=>{
    if(preview || (e.target as Element).closest('button,input,textarea,.card-menu,.annotation-hover'))return;
    const shadow=(e.target as Element).getRootNode() as ShadowRoot & {getSelection?:()=>Selection|null};
    const sel=shadow.getSelection?.()??window.getSelection();
    if(!sel || sel.isCollapsed || !sel.rangeCount){setSelection(undefined);return;}
    const range=sel.getRangeAt(0),parts=[...shadow.querySelectorAll<HTMLElement>('article[data-card][data-role]')].map(element=>({element,cardId:element.dataset.card!,role:element.dataset.role as Role}));
    const quotes=selectedParts(document,store.get().library,range,parts);if(!quotes.length){setSelection(undefined);return;}
    const rect=range.getBoundingClientRect();setSelection({quotes,x:Math.max(12,Math.min(rect.x,innerWidth-120)),y:Math.max(12,rect.y-44),target:frozenTarget.current});
  },[store,preview]);
  function addSelection(){if(!selection)return;try{store.quoteMany(selection.quotes,selection.target);setSelection(undefined);const root=document.getElementById('suedama-deepseek-root')?.shadowRoot as ShadowRoot & {getSelection?:()=>Selection|null};root?.getSelection?.()?.removeAllRanges();window.getSelection()?.removeAllRanges();}catch(e){store.notice(errorText(e));}}
  function fullQuote(card:Card){
    if(!card.answer || state.current.busy&&state.current.turns.at(-1)?.answerKey===card.route.at(-1)?.answerKey){store.notice(t("这一轮尚未结束，可以先划选已出现的正文。"));return;}
    store.quoteMany(turnQuotes(card));
  }
  const card=menu&&library.cards[menu.id];
  const available=useMemo(()=>Object.values(library.cards).filter(c=>belongsToBoard(c,board)),[library.cards,board]);
  return <>
    <NativeBoardList store={store} state={state}/>
    <NativeConversation store={store} state={state}/>
    {state.archiveReader&&<div className="archive-native-banner" style={{left:`calc(50% + ${chrome.width/2}px)`}} role="status"><span>{t("归档内容，只读中")}</span><button onClick={store.closeArchiveReader}>{t("返回归档")}</button></div>}
    {open&&<div className="canvas-scene">{appearance.image&&<div className="canvas-background" style={{backgroundImage:`url(${JSON.stringify(appearance.image)})`,filter:`brightness(${appearance.brightness}%) blur(${appearance.blur}px)`}}/>}</div>}
    {chrome.width===56&&<NavigationRail store={store}/>}
    {(state.notice||state.nativeNavigating||open&&state.syncing||state.savingError)&&<div className="notice" role="status" style={{zIndex:430}}>{t(state.savingError||(state.nativeNavigating?"正在定位目标对话…":open&&state.syncing?"正在收集当前线路…":state.notice))}</div>}
    {!open&&!state.nativeNavigating&&!state.archiveReader&&!chrome.modal&&state.current.conversationId&&<div className="native-actions"><button aria-label={t("全局预览")} onClick={()=>{store.setOpen(true);if(!store.get().preview)store.togglePreview();}}><Icon name="globe"/></button><button aria-label={t("白板")} onClick={()=>{if(store.get().preview)store.togglePreview();store.setOpen(true);}}><Icon name="artboard"/></button></div>}
    {open&&<div className="app" style={{left:chrome.width,'--surface-opacity':(appearance.opacity??100)/100} as React.CSSProperties} onPaste={e=>{if((e.target as Element).closest('input,textarea,[contenteditable=true]'))return;const files=[...e.clipboardData.files];if(files.length){e.preventDefault();store.addFiles(files);}}} onClick={e=>{const target=(e.target as Element).closest<HTMLElement>('[data-image]');if(target?.dataset.image)setImage(target.dataset.image);}} onMouseUp={selectText} onPointerDownCapture={e=>{const target=e.target as Element;if(e.button===0){frozenTarget.current=store.draftKey();if(target.closest('.react-flow')&&!target.closest('.react-flow__node,button,nav,input,textarea')){window.getSelection()?.removeAllRanges();setSelection(undefined);}}if(menu&&!target.closest('.card-menu'))setMenu(undefined);}}>
      <div className="canvas-title"><span>{board?.title??t("白板")}</span></div>
      <main className={`canvas-area ${preview?'is-preview':''}`}>
        <Canvas key={`${state.canvasId}:${preview}`} store={store} state={state} menu={showMenu} quote={jump} settings={openSettings} tools={id=>{const c=library.cards[id]!;return <>
          <Tool icon="focus" text={t("聚焦")} action={()=>store.focus(c.position,{x:c.width,y:c.height},{fit:true})}/>
          <Tool icon="immersive" text={t("沉浸对话")} action={()=>void store.locate(c.id)}/>
          <button aria-label={t("历史线路颜色")} title={t("历史线路颜色")} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();showMenu({id,x:r.right+8,y:r.top,level:'palette'});}}><Icon name="palette"/></button>
          <Tool icon="quote-full" text={t("全文引用")} action={()=>fullQuote(c)}/>
          <Tool icon="edit" text={t("选中")} action={()=>store.secondarySelect(id)}/>
  </>;}}/>
        {!available.some(c=>!isArchived(c,library.cards))&&<div className="empty"><p>{t("在下方输入问题，开始一条根线路")}</p></div>}
      </main>
      {!preview&&store.draftKey()&&<NativeComposer store={store} state={state}/>}
      {searchOpen&&<aside className="canvas-search"><div className="panel-heading"><input autoFocus aria-label={t("搜索白板正文")} placeholder={t("搜索白板正文")} value={search} onChange={e=>setSearch(e.target.value)}/><button aria-label={t("关闭搜索")} onClick={()=>setSearchOpen(false)}><Icon name="close"/></button></div>{search.trim()&&available.filter(c=>(c.question+'\n'+c.answer).toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0,80).map(c=><button key={c.id} onClick={()=>{store.select(c.id);if(preview)store.togglePreview();if(isArchived(c,library.cards)!==archives)store.toggleArchives();setSearchOpen(false);requestAnimationFrame(()=>store.focus(c.position,{x:c.width,y:c.height}));}}>{displayQuestion(c).slice(0,100)}</button>)}</aside>}
      {selection&&<div className="selection-actions" style={{left:selection.x,top:selection.y}} onPointerDown={e=>e.preventDefault()}><button aria-label={t("添加所选原文到附件")} onClick={addSelection}><Icon name="quote"/></button><button aria-label={t("取消划选引用")} onClick={()=>setSelection(undefined)}><Icon name="close"/></button></div>}
      {menu&&!preview&&<div className="card-menu secondary-menu" role="menu" style={{left:menu.x,top:menu.y}}>
        {card&&(menu.level==='palette'?<div className="palette" aria-label={t("历史线路颜色")}>{HISTORY_COLORS.map((c,i)=><button key={c} aria-label={t("历史颜色 {0}",{"0":i+1})} aria-pressed={card.historyColor===i} style={{background:c}} onClick={()=>store.colorLine(card.id,i)}/>)}</div>:<>
          <Tool label icon="reset-size" text={t("恢复原始大小")} action={()=>{store.patchCard(card.id,{width:Math.max(280,Math.min(1100,innerWidth-160)*.75),height:Math.max(280,Math.min(1000,innerHeight-200))});setMenu(undefined);}}/>
          <Tool label icon={card.bookmarked?'bookmark-fill':'bookmark'} text={card.bookmarked?t("取消收藏"):t("收藏")} action={()=>{store.patchCard(card.id,{bookmarked:!card.bookmarked});setMenu(undefined);}}/>
          <Tool label icon="download" text={t('导出笔记')} action={()=>{download('suedama-notes.md',selectedNotes(library,state.selectedIds.includes(card.id)?state.selectedIds:[card.id]),'text/markdown;charset=utf-8');setMenu(undefined);}}/>
          <hr/><Tool label danger icon="archive-tree" text={card.archived?t("恢复此轮及下游"):isArchived(card,library.cards)?t("先恢复归档的祖先"):t("归档此轮及下游")} disabled={isArchived(card,library.cards)&&!card.archived} action={()=>{store.archive(card.id);setMenu(undefined);}}/>
        </>)}
        {!card&&state.pending?.id===menu.id&&<><Tool label icon="archive-tree" text={state.pending.archived?t("恢复等待卡片"):t("归档等待卡片")} action={()=>{store.archivePending();setMenu(undefined);}}/><Tool label icon="eraser" text={t("移除失败卡片")} disabled={!state.pending.error} action={()=>{store.dismissPending();setMenu(undefined);}}/><Tool label icon="immersive" text={t("返回官网核对")} action={()=>store.setOpen(false)}/></>}
      </div>}
      {image&&<ImageLightbox src={image} alt={t("图片预览")} labels={{dialog:t("图片预览"),close:t("关闭图片预览")}} onClose={closeImage}/>}
      <ReferenceHighlight reference={state.reference} cards={library.cards}/>
    </div>}
    {open&&(settings||archives)&&<OverlayPortal modal><SettingsPanel key={archives?'archive:'+state.reference?.id:'settings'} store={store} state={state} onClose={()=>{setSettings(false);if(archives)store.returnToCanvas();}}/></OverlayPortal>}
  </>;
}
function Tool({icon,text,action,label=false,disabled=false,danger=false}:{icon:IconName;text:string;action:()=>void;label?:boolean;disabled?:boolean;danger?:boolean}){return <button className={danger?'danger':undefined} role={label?'menuitem':undefined} aria-label={text} title={label?undefined:text} disabled={disabled} onClick={action}><Icon name={icon}/>{label&&text}</button>;}
