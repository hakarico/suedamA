import {t,useLocale} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {roleLabel,type Quote} from './model';
import {Icon} from './Icon';
let activePreview:(()=>void)|undefined;
export function AnnotationChip({quotes,number,onOpen,onRemove}:{quotes:Quote[];number:number;onOpen:()=>void;onRemove?:()=>void}){useLocale();
  const anchor=useRef<HTMLSpanElement>(null),timer=useRef<ReturnType<typeof setTimeout>>();
  const [panel,setPanel]=useState<{left:number;top:number;width:number;maxHeight:number;scale:number;below:boolean}>();
  const popup=useRef<HTMLDivElement>(null),point=useRef<{x:number;y:number}>();
  const closeSelf=useRef(()=>{if(timer.current)clearTimeout(timer.current);setPanel(undefined);});
  const cancel=()=>{if(timer.current)clearTimeout(timer.current);};
  const insideBridge=()=>{
    const p=point.current,a=anchor.current?.closest('.card')?.getBoundingClientRect()??anchor.current?.getBoundingClientRect(),b=popup.current?.getBoundingClientRect();
    if(!p||!a||!b)return false;return p.x>=Math.min(a.left,b.left)-8&&p.x<=Math.max(a.right,b.right)+8&&p.y>=Math.min(a.top,b.top)-8&&p.y<=Math.max(a.bottom,b.bottom)+8;
  };
  const close=()=>{cancel();timer.current=setTimeout(()=>{if(!insideBridge())setPanel(undefined);},140);};
  const show=()=>{cancel();timer.current=setTimeout(()=>{
    const el=anchor.current;if(!el)return;activePreview?.();activePreview=closeSelf.current;const card=el.closest<HTMLElement>('.card'),composer=el.closest('.composer'),anchorRect=el.getBoundingClientRect(),rect=card?.getBoundingClientRect()??composer?.getBoundingClientRect()??anchorRect;
    const scale=card?rect.width/card.offsetWidth:1,width=Math.max(0,Math.min(innerWidth-24,composer?Math.min(420,rect.width):rect.width)),maxHeight=card?Math.max(90,130*scale):320;
    const below=rect.top<maxHeight+16;setPanel({left:Math.max(12,Math.min(innerWidth-width-12,composer?anchorRect.left:rect.right-width)),top:below?Math.min(innerHeight-maxHeight-12,rect.bottom+10):rect.top-10,width,maxHeight,scale,below});
  },250);};
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(activePreview===closeSelf.current)activePreview=undefined;},[]);
  useEffect(()=>{if(!panel)return;const move=(e:PointerEvent)=>{point.current={x:e.clientX,y:e.clientY};if(insideBridge())cancel();else close();};document.addEventListener('pointermove',move,true);return()=>document.removeEventListener('pointermove',move,true);},[panel]);
  const open=()=>{cancel();setPanel(undefined);onOpen();};
  const portal=anchor.current?.getRootNode();
  return <span ref={anchor} className="annotation-chip" onMouseEnter={e=>{point.current={x:e.clientX,y:e.clientY};show();}} onMouseLeave={close} onFocus={show} onBlur={e=>{const next=e.relatedTarget as Node|null;if(!e.currentTarget.contains(next)&&!popup.current?.contains(next))closeSelf.current();}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closeSelf.current();}}}>
    <button onClick={open}><Icon name="chat-text"/>{t("注释")} {number}</button>
    {onRemove&&<button className="annotation-remove" aria-label={t("移除注释 {0}",{"0":number})} onClick={onRemove}><Icon name="x-circle"/></button>}
    {panel && portal && createPortal(<div ref={popup} className="annotation-hover" role="button" tabIndex={0} aria-label={t("查看注释 {0} 来源",{"0":number})} style={{left:panel.left,top:panel.top,width:panel.width,maxHeight:panel.maxHeight,fontSize:14*panel.scale,transform:panel.below?undefined:'translateY(-100%)'}} onMouseEnter={cancel} onMouseLeave={close} onClick={e=>{
      e.stopPropagation();const selection=(portal as ShadowRoot & {getSelection?:()=>Selection|null}).getSelection?.()??window.getSelection();if(selection && !selection.isCollapsed && e.currentTarget.contains(selection.anchorNode))return;open();
    }} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();open();}}}>{quotes.map(q=><div className="annotation-segment" key={q.id}><strong>{t(roleLabel(q.role))}</strong><pre>{q.text}</pre></div>)}</div>,portal as ShadowRoot)}
  </span>;
}
