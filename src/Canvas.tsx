import {t,useLocale} from './i18n';
import {memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ReactFlow,ViewportPortal,Background,Handle,Position,NodeResizer,useStore,useReactFlow,ReactFlowProvider,type Node,type NodeProps,type Viewport,type ReactFlowInstance} from '@xyflow/react';
import {HISTORY_COLORS,SELECTED_COLORS,displayQuestion,historyLine,type Card,type Point,type Quote} from './model';
import {HistoryEdge,type HistoryFlowEdge} from './HistoryEdge';
import {ancestry,archivedCards,previewLayout} from './topology';
import {CanvasGestures,lassoSelection} from './canvas-gestures';
import {belongsToBoard,boardAppearance} from './boards';
import {useResizeRail} from './use-resize-rail';
import {cardViewport,scrollbarLane} from './card-geometry';
import {AnnotationChip} from './AnnotationChip';
import {Icon,type IconName} from './Icon';
import {AttachmentPreview} from './AttachmentPreview';
import {Message} from './Message';
import type {CanvasStore,Pending,State} from './store';

type ResizeGeometry={x:number;y:number;width:number;height:number};
type CardData={resize:(id:string,geometry?:ResizeGeometry)=>void;card?:Card;pending?:Pending;preview:boolean;dim:boolean;active:boolean;locked:boolean;primary:boolean;lineRoot:boolean;multiple:boolean;color:string;selectedColor:string;store:CanvasStore;quote:(q:Quote[])=>void;[key:string]:unknown};
type CanvasNode=Node<CardData,'card'>;
export type CardMenu={id:string;x:number;y:number;anchorId?:string;level:'more'|'palette'};
export function CardBody({card,onQuote}: {card:Card;onQuote:(q:Quote[])=>void}) {useLocale();
  const groups=new Map<string,Quote[]>();
  for(const q of card.annotations){const key=q.group??q.id;groups.set(key,[...groups.get(key)??[],q]);}
  return <>
    <div className="input-row"><div className="input-bubble">
      {!!card.attachments?.length&&<div className="card-attachments">{card.attachments.map((file,i)=><AttachmentPreview key={i} name={file.name} bytes={file.bytes} image={file.image}/>)}</div>}
      {!!groups.size && <div className="saved-annotations">{[...groups.values()].map((qs,i)=><AnnotationChip key={qs[0]!.id} quotes={qs} number={qs[0]!.number??i+1} onOpen={()=>onQuote(qs)}/>)}</div>}
      <article className="question" data-card={card.id} data-role="user"><Message text={displayQuestion(card)}/></article>
    </div></div>
    {card.reasoning&&<details className="reasoning"><summary>{t(card.reasoningLabel??"思考")}</summary><article data-card={card.id} data-role="reasoning"><Message text={card.reasoning}/></article></details>}
    {card.answer?<article className="answer" data-card={card.id} data-role="assistant"><Message text={card.answer}/></article>:<div className="waiting"><Icon name="text-summary"/></div>}
  </>;
}
const CardNode=memo(function CardNode({data}:NodeProps<CanvasNode>){useLocale();
  const selected=data.primary||data.locked;
  const small=useStore(s=>s.transform[2]<.25);
  const {card,pending,store}=data;
  const host=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const scroll=host.current?.querySelector<HTMLElement>('[data-card-scroll]');if(scroll)scroll.inert=small&&!data.preview;},[small,data.preview]);
  useResizeRail(host,!data.preview&&!small,card?.width??0,card?.height??0);
  const draft=card && store.draft(card.id);
  const ghost=card && store.anchorId()!==card.id && draft && (draft.text.trim() || draft.quotes.length>0);
  return <div ref={host} data-line-root={data.lineRoot} data-multiple={data.multiple} data-selected={selected||data.locked} className={`card ${selected?'selected':''} ${data.locked?'locked':''} ${data.dim?'dim':''} ${small&&!data.preview?'simplified':''} ${data.preview?'preview-card':''} ${data.preview && card?.bookmarked?'favorite-outline':''}`} style={{'--wl-color':data.color,'--wl-selected':data.selectedColor} as React.CSSProperties} tabIndex={data.preview?-1:0} onKeyDown={e=>{
    if(data.preview || !card || e.target!==e.currentTarget)return;
    if(e.key==='Enter'){store.select(card.id);return;}
    const delta:Record<string,Point>={ArrowLeft:{x:-24,y:0},ArrowRight:{x:24,y:0},ArrowUp:{x:0,y:-24},ArrowDown:{x:0,y:24}};
    if(delta[e.key]){e.preventDefault();e.stopPropagation();store.move([{id:card.id,position:{x:card.position.x+delta[e.key]!.x,y:card.position.y+delta[e.key]!.y}}]);}
  }}>
    <Handle type="target" position={Position.Top} isConnectable={false}/>
    <NodeResizer isVisible={!data.preview && !!card && !small} minWidth={48} minHeight={48} maxWidth={2000} maxHeight={3000} autoScale={false} handleStyle={{width:14,height:14,background:'transparent',border:0,zIndex:60,pointerEvents:'all'}} lineStyle={{border:0,background:'transparent',zIndex:59,pointerEvents:'all'}} onResize={(_,p)=>card&&data.resize(card.id,p)} onResizeEnd={(_,p)=>{if(card){store.patchCard(card.id,{position:{x:p.x,y:p.y},width:p.width,height:p.height});data.resize(card.id);}}}/>
    {data.preview?<div className="catalog-text">{card?displayQuestion(card):pending?.question}</div>:<>
      <div className="card-scroll nowheel" data-card-scroll>
        {card?<CardBody card={card} onQuote={data.quote}/>:<><div className="input-row"><div className="input-bubble"><Message text={pending?.question??''}/></div></div><div className={`waiting ${pending?.error?'failed':''}`}><Icon name={pending?.error?'text-summary':'text-summary'}/><span>{t(pending?.error??pending?.stage??'')}</span></div></>}
      </div>
      <div className="light-preview" aria-hidden="true"><Icon name="text-summary"/></div>
      {ghost && <button className="draft-ghost" onClick={()=>store.secondarySelect(card.id)}><span>{t("草稿")}</span>{draft.text || t("{0} 段引用",{"0":draft.quotes.length})}</button>}
    </>}
    <Handle type="source" position={Position.Bottom} isConnectable={false}/>
  </div>;
});
const nodeTypes={card:CardNode};
/** Geometry is known before React Flow measures a card, so lines and cards mount together.
 * The shared viewport transform also retains paths while their endpoints are offscreen. */
const HistoryLayer=memo(function HistoryLayer({nodes,edges}:{nodes:CanvasNode[];edges:HistoryFlowEdge[]}){
  const bounds=useStore(s=>({x:-s.transform[0]/s.transform[2],y:-s.transform[1]/s.transform[2],width:s.width/s.transform[2],height:s.height/s.transform[2]}),(a,b)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height);
  const geometry=useMemo(()=>new Map(nodes.map(n=>[n.id,{position:n.position,width:n.width!,height:n.height!}])),[nodes]);
  return <ViewportPortal><svg className="history-layer" aria-hidden="true">{edges.map(e=>{const a=geometry.get(e.source),b=geometry.get(e.target);if(!a||!b)return null;const margin=200+Math.abs(b.position.y-a.position.y)*.5;if(Math.max(a.position.x+a.width/2,b.position.x+b.width/2)<bounds.x-100||Math.min(a.position.x+a.width/2,b.position.x+b.width/2)>bounds.x+bounds.width+100||Math.max(a.position.y+a.height,b.position.y)<bounds.y-margin||Math.min(a.position.y+a.height,b.position.y)>bounds.y+bounds.height+margin)return null;return <HistoryEdge key={e.id} id={e.id} data={e.data} style={e.style} sourceX={a.position.x+a.width/2} sourceY={a.position.y+a.height} targetX={b.position.x+b.width/2} targetY={b.position.y} sourcePosition={Position.Bottom} targetPosition={Position.Top}/>;})}</svg></ViewportPortal>;
});
type Props={store:CanvasStore;state:State;menu:(menu:CardMenu)=>void;quote:(q:Quote[])=>void;settings:()=>void;tools:(id:string)=>ReactNode};
export const Canvas=memo(function Canvas(props:Props){return <ReactFlowProvider><Flow {...props}/></ReactFlowProvider>;});
function Flow({store,state,menu,quote,settings,tools}:Props){useLocale();
  const {library,preview,canvasId}=state;
  const archives=false;
  const cards=library.cards;
  const bookmarks=preview?state.previewBookmarks:state.bookmarks;
  const flow=useReactFlow<CanvasNode,HistoryFlowEdge>();
  const root=useRef<HTMLDivElement>(null);
  const gestures=useRef(new CanvasGestures());
  const suppressMenu=useRef(0);
  const [positions,setPositions]=useState(new Map<string,Point>());
  const [sizes,setSizes]=useState(new Map<string,ResizeGeometry>());
  const resize=useCallback((id:string,geometry?:ResizeGeometry)=>setSizes(prior=>{const next=new Map(prior);if(geometry)next.set(id,geometry);else next.delete(id);return next;}),[]);
  const [lassoIds,setLassoIds]=useState<string[]>();
  const [lasso,setLasso]=useState<{start:Point;end:Point}>();
  const frame=useRef(0);
  const queued=useRef(new Map<string,Point>());
  const initialized=useRef(false);
  const railClick=useRef(false);
  const board=library.boards?.[canvasId];
  const archived=useMemo(()=>archivedCards(cards),[cards]);
  const visible=useMemo(()=>Object.values(cards).filter(c=>belongsToBoard(c,board) && archived.has(c.id)===archives),[cards,board,archived,archives]);
  const layout=useMemo(()=>preview?previewLayout(visible):new Map<string,Point>(),[preview,visible]);
  const selectedIds=lassoIds??state.selectedIds;
  const selected=new Set(selectedIds);
  const active=useMemo(()=>ancestry(cards,[...selectedIds,...library.lockedId?[library.lockedId]:[]]),[cards,selectedIds,library.lockedId]);
  const lockedPath=useMemo(()=>ancestry(cards,library.lockedId?[library.lockedId]:[]),[cards,library.lockedId]);
  const nodeData=useRef(new Map<string,CardData>());
  const nodes=useMemo(()=>{
    const result:CanvasNode[]=visible.map(card=>({id:card.id,type:'card',position:positions.get(card.id)??(!preview&&sizes.get(card.id)?{x:sizes.get(card.id)!.x,y:sizes.get(card.id)!.y}:undefined)??layout.get(card.id)??card.position,width:preview?220:sizes.get(card.id)?.width??card.width,height:preview?112:sizes.get(card.id)?.height??card.height,selected:!preview&&selected.has(card.id),draggable:false,selectable:false,data:{resize,card,preview,dim:bookmarks&&!card.bookmarked,active:active.has(card.id),locked:library.lockedId===card.id,primary:!preview&&selected.has(card.id),lineRoot:!card.parentId || historyLine(card,cards)!==historyLine(cards[card.parentId]!,cards) && card.historyColor!==cards[card.parentId]!.historyColor,multiple:selected.size>1,color:(!preview && library.lockedId===card.id?SELECTED_COLORS:HISTORY_COLORS)[card.historyColor]!,selectedColor:SELECTED_COLORS[card.historyColor]!,store,quote}}));
    const pending=state.pending;
    if(!preview && pending && pending.boardId===canvasId && !!pending.archived===archives)result.push({id:pending.id,type:'card',position:positions.get(pending.id)??pending.position,width:pending.size.width,height:pending.size.height,selected:selected.has(pending.id),draggable:false,selectable:false,data:{resize,pending,preview:false,dim:bookmarks,active:false,locked:false,primary:selected.has(pending.id),lineRoot:!pending.conversationId,multiple:false,color:HISTORY_COLORS[cards[pending.baseId]?.historyColor??0]!,selectedColor:'#999',store,quote}});
    const live=new Set(result.map(node=>node.id));for(const id of nodeData.current.keys())if(!live.has(id))nodeData.current.delete(id);
    for(const node of result){const old=nodeData.current.get(node.id),next=node.data;if(old&&Object.keys(next).every(key=>old[key]===next[key]))node.data=old;else nodeData.current.set(node.id,next);}
    return result;
  },[visible,positions,sizes,resize,lassoIds,layout,preview,state.selectedIds,active,library.lockedId,bookmarks,store,quote,state.pending,canvasId,archives]);
  const edges=useMemo(()=>{
    const ids=new Set(visible.map(c=>c.id));
    const result:HistoryFlowEdge[]=visible.filter(c=>c.parentId && ids.has(c.parentId)).map(card=>{
      const parent=cards[card.parentId!]!;const highlighted=!preview && active.has(card.id);
      const palette=highlighted?SELECTED_COLORS:HISTORY_COLORS;
      return {id:`history:${card.id}`,source:parent.id,target:card.id,type:'history' as const,selectable:false,data:{agent:false,active:!preview&&lockedPath.has(card.id),sourceColor:palette[parent.historyColor],branch:historyLine(card,cards)!==historyLine(parent,cards)},style:{'--wl-color':palette[card.historyColor],opacity:bookmarks && (!card.bookmarked || !parent.bookmarked)?.09:highlighted?1:.62} as React.CSSProperties};
    });
    const p=state.pending;if(!preview&&p&&p.boardId===canvasId&&!!p.archived===archives&&ids.has(p.baseId))result.push({id:'history:'+p.id,source:p.baseId,target:p.id,type:'history',data:{agent:false,active:false},style:{'--wl-color':HISTORY_COLORS[cards[p.baseId]!.historyColor],opacity:.62} as React.CSSProperties});
    return result;
  },[visible,cards,active,lockedPath,bookmarks,preview,state.pending,canvasId,archives]);
  const center=useCallback((position:Point,size:Point,options:{fit?:boolean;zoom?:number}={})=>{
    const bounds=root.current?.getBoundingClientRect();if(!bounds)return;
    void flow.setViewport(cardViewport(bounds,position,size,options.zoom??flow.getZoom(),options.fit),{duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:150});
  },[flow]);
  useLayoutEffect(()=>store.onViewport(preview,()=>flow.getViewport()),[store,preview,flow,canvasId]);
  useLayoutEffect(()=>store.onFocus((p,s,options)=>{if(!preview)center(p,s,options);}),[store,preview,center]);
  const onInit=useCallback((instance:ReactFlowInstance<CanvasNode,HistoryFlowEdge>)=>{
    const saved=store.savedViewport(preview);
    if(saved)void instance.setViewport(saved);
    else if(!preview){const card=cards[library.selectedId??'']??visible.at(-1);if(card)center(card.position,{x:card.width,y:card.height},{zoom:instance.getZoom()});}
    initialized.current=true;
  },[preview,store,cards,library.selectedId,visible,center]);
  const saveViewport=useCallback((_:unknown,v:Viewport)=>{if(initialized.current)store.viewport(v,preview);},[store,preview]);
  const showMenu=(id:string,x:number,y:number)=>menu({id,x,y,anchorId:store.anchorId(),level:'more'});
  function selectedTextAt(node:Element,x:number,y:number){
    const selection=(root.current?.getRootNode() as ShadowRoot & {getSelection?:()=>Selection|null})?.getSelection?.()??window.getSelection();
    if(!selection || selection.isCollapsed || !selection.rangeCount || !node.contains(selection.anchorNode) || !node.contains(selection.focusNode))return false;
    return [...selection.getRangeAt(0).getClientRects()].some(rect=>x>=rect.left && x<=rect.right && y>=rect.top && y<=rect.bottom);
  }
  function pointerDown(e:React.PointerEvent<HTMLDivElement>){
    if(preview || (e.target as Element).closest('button,input,textarea,.annotation-chip,.annotation-hover,.react-flow__resize-control'))return;
    const scroller=(e.target as Element).closest<HTMLElement>('[data-card-scroll]');
    railClick.current=!!scroller&&scrollbarLane(scroller,e.clientX);
    if(railClick.current)return;
    const node=(e.target as Element).closest<HTMLElement>('.react-flow__node-card');
    if(e.button===0 && !node){const selection=(root.current?.getRootNode() as ShadowRoot & {getSelection?:()=>Selection|null})?.getSelection?.();selection?.removeAllRanges();window.getSelection()?.removeAllRanges();}
    if(e.button===2 && node && selectedTextAt(node,e.clientX,e.clientY)){e.preventDefault();e.stopPropagation();return;}
    const points=new Map(nodes.map(n=>[n.id,n.position]));
    if(gestures.current.start(e,node?.dataset.id,(e.target as Element).classList.contains('react-flow__pane'),state.selectedIds,points,e.shiftKey)){
      e.preventDefault();e.stopPropagation();
      root.current?.focus({preventScroll:true});
      root.current?.setPointerCapture(e.pointerId);
    }
  }
  function pointerMove(e:React.PointerEvent<HTMLDivElement>){
    const moved=gestures.current.move(e,flow.getZoom());
    const g=gestures.current.session;if(!g || g.pointer!==e.pointerId || !g.moved)return;
    e.preventDefault();e.stopPropagation();
    if(g.kind==='lasso'){setLasso({start:g.start,end:g.latest});setLassoIds(lassoSelection(visible,flow.screenToFlowPosition(g.start),flow.screenToFlowPosition(g.latest),g.add));return;}
    if(moved)queued.current=moved;
    if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;setPositions(queued.current);});
  }
  function finish(e:React.PointerEvent<HTMLDivElement>,cancel=false){
    const g=gestures.current.session;if(!g || g.pointer!==e.pointerId)return;
    gestures.current.finish(cancel);root.current?.releasePointerCapture(g.pointer);
    if(frame.current){cancelAnimationFrame(frame.current);frame.current=0;}
    if(g.kind==='card'){
      suppressMenu.current=performance.now()+400;
      if(!cancel && g.moved)store.move([...queued.current].map(([id,position])=>({id,position})));
      else if(!cancel){const id=g.positions.keys().next().value;if(id)showMenu(id,e.clientX,e.clientY);}
      setPositions(new Map());
    }else if(!cancel && g.moved){
      const a=flow.screenToFlowPosition(g.start),b=flow.screenToFlowPosition({x:e.clientX,y:e.clientY});
      store.selectMany(lassoSelection(visible,a,b,g.add));
    }else if(!cancel && g.kind==='lasso')store.clearSelection();
    setLasso(undefined);setLassoIds(undefined);
  }
  useEffect(()=>{
    const el=root.current;if(!el)return;
    let wheelFrame=0;let next:Viewport|undefined;let saveTimer:ReturnType<typeof setTimeout>;
    const wheel=(e:WheelEvent)=>{
      if((e.target as Element).closest('button'))return;
      const node=(e.target as Element).closest<HTMLElement>('.react-flow__node-card');
      if(!preview && node && (state.selectedIds.includes(node.dataset.id!) || library.lockedId===node.dataset.id) && (e.target as Element).closest('.card-scroll'))return;
      e.preventDefault();e.stopPropagation();
      const v=next??flow.getViewport();const rect=el.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;
      const zoom=Math.max(.01,Math.min(1.8,v.zoom*Math.exp(-e.deltaY*(e.deltaMode===1?.025:.0015))));
      next={x:x-(x-v.x)*zoom/v.zoom,y:y-(y-v.y)*zoom/v.zoom,zoom};
      if(!wheelFrame)wheelFrame=requestAnimationFrame(()=>{wheelFrame=0;if(next)void flow.setViewport(next);next=undefined;});
      clearTimeout(saveTimer);saveTimer=setTimeout(()=>store.viewport(flow.getViewport(),preview),180);
    };
    el.addEventListener('wheel',wheel,{passive:false,capture:true});
    return()=>{el.removeEventListener('wheel',wheel,true);cancelAnimationFrame(wheelFrame);clearTimeout(saveTimer);};
  },[flow,preview,state.selectedIds,library.lockedId,store]);
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
  const controlGroups: {icon:IconName;label:string;action:()=>void;pressed?:boolean;disabled?:boolean}[][]=preview?[
    [{icon:'close',label:t("关闭全局预览"),action:store.togglePreview},{icon:bookmarks?'bookmarks-fill':'bookmarks',label:t("收藏"),action:store.togglePreviewBookmarks,pressed:bookmarks}],
  ]:[
    [{icon:'gear',label:t("白板设置"),action:settings},{icon:'globe',label:t("全局预览"),action:store.togglePreview},{icon:bookmarks?'bookmarks-fill':'bookmarks',label:t("收藏"),action:store.toggleBookmarks,pressed:bookmarks},{icon:'immersive',label:store.anchorId()?t("沉浸对话"):t("返回主页"),action:()=>void store.returnNative()}],
  ];
  controlGroups.push([{icon:'plus',label:t("放大"),action:()=>void flow.zoomIn({duration:100})},{icon:'reset',label:t("恢复原始缩放"),action:()=>void flow.zoomTo(1,{duration:120})},{icon:'fit',label:t("适应全部 card"),action:()=>void flow.fitView({padding:.15,maxZoom:1,duration:150})},{icon:'minus',label:t("缩小"),action:()=>void flow.zoomOut({duration:100})}]);
  if(!preview)controlGroups.push([{icon:'undo',label:t("撤销白板操作"),action:()=>store.replay('undo'),disabled:!state.canUndo},{icon:'redo',label:t("重做白板操作"),action:()=>store.replay('redo'),disabled:!state.canRedo}]);
  return <div ref={root} className="flow-root" onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove} onPointerUpCapture={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onDoubleClickCapture={e=>{const el=e.target as Element;if(!preview && !el.closest('.react-flow__node,button,nav,input,textarea,[role=menu],.annotation-hover'))store.clearSelection(true);}} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{if(e.key==='Escape' && gestures.current.session){const g=gestures.current.session;gestures.current.finish(true);cancelAnimationFrame(frame.current);frame.current=0;root.current?.releasePointerCapture(g.pointer);setPositions(new Map());setLasso(undefined);setLassoIds(undefined);e.stopPropagation();}}} tabIndex={-1}>
    <ReactFlow<CanvasNode,HistoryFlowEdge> nodes={nodes} edges={[]} nodeTypes={nodeTypes} defaultViewport={store.currentViewport(preview)}
      onNodeClick={(event,node)=>{if(railClick.current || (event.target as Element).closest('button,a,.annotation-chip,.annotation-hover,.react-flow__resize-control'))return;const selection=(root.current?.getRootNode() as ShadowRoot & {getSelection?:()=>Selection|null})?.getSelection?.()??window.getSelection();if(selection && !selection.isCollapsed)return;if(preview){store.select(node.id);const c=cards[node.id]!;store.viewport(cardViewport({width:root.current?.clientWidth??innerWidth,height:root.current?.clientHeight??innerHeight},c.position,{x:c.width,y:c.height},store.currentViewport(false).zoom),false);store.togglePreview();}else store.select(node.id,event.shiftKey);}}
      onNodeDoubleClick={(event,node)=>{if(!preview && !(event.target as Element).closest('button,a,input,textarea,.annotation-chip,.annotation-hover'))store.lock(node.id,true);}}
      onNodeContextMenu={(e,node)=>{e.preventDefault();const el=(e.target as Element).closest('.react-flow__node-card');if(!preview && performance.now()>suppressMenu.current && !(el && selectedTextAt(el,e.clientX,e.clientY)))showMenu(node.id,e.clientX,e.clientY);}}
      onPaneClick={()=>{}}
      onInit={onInit} onMoveEnd={saveViewport} minZoom={.01} maxZoom={1.8} colorMode="dark" nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} elementsSelectable={false} selectNodesOnDrag={false} selectionKeyCode={null} multiSelectionKeyCode={null} deleteKeyCode={null} onlyRenderVisibleElements panOnDrag={[2]} zoomOnScroll={false} panOnScroll={false} zoomOnPinch zoomOnDoubleClick={false}>
      <HistoryLayer nodes={nodes} edges={edges}/>
      {boardAppearance(library,canvasId).dots!==false && <Background color="#727272" gap={24} size={1} style={{backgroundColor:'transparent'}}/>}
      {!preview && !lasso && state.selectedIds.length===1 && cards[state.selectedIds[0]!] && <FloatingTools id={state.selectedIds[0]!}>{tools(state.selectedIds[0]!)}</FloatingTools>}
    </ReactFlow>
    {lasso && <div className="lasso" style={{left:Math.min(lasso.start.x,lasso.end.x),top:Math.min(lasso.start.y,lasso.end.y),width:Math.abs(lasso.end.x-lasso.start.x),height:Math.abs(lasso.end.y-lasso.start.y)}}/>}
    <nav className={"canvas-controls"+(preview?" preview-controls":"")} aria-label={preview?t("全局预览操作"):t("白板操作")}>{controlGroups.map((group,i)=><div className="control-group" key={i}>{group.map(t=><button key={t.label} aria-label={t.label} title={t.label} aria-pressed={t.pressed} disabled={t.disabled} onClick={t.action}><Icon name={t.icon}/></button>)}</div>)}</nav>
  </div>;
}
function FloatingTools({id,children}:{id:string;children:ReactNode}){useLocale();
  const width=useStore(s=>s.width),height=useStore(s=>s.height);const transform=useStore(s=>s.transform);const node=useStore(s=>s.nodeLookup.get(id));if(!node)return null;
  const x=node.position.x*transform[2]+transform[0],y=node.position.y*transform[2]+transform[1];
  if(x>width || y>height || x+(node.measured.width??600)*transform[2]<0 || y+(node.measured.height??560)*transform[2]<0)return null;
  return <nav className="floating-card-tools" role="toolbar" aria-label={t("card 操作")} style={{left:Math.max(8,Math.min(width-52,x-56)),top:Math.max(8,Math.min(height-196,y+(node.measured.height??560)*transform[2]/2-94))}}>{children}</nav>;
}
