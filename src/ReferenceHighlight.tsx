import {useLayoutEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {referenceRange} from './selection';
import {SELECTED_COLORS,type Card,type Quote} from './model';
type Box={host:HTMLElement;left:number;top:number;width:number;height:number;color:string};
const sameBoxes=(a:Box[],b:Box[])=>a.length===b.length&&a.every((v,i)=>{const w=b[i]!;return v.host===w.host&&v.left===w.left&&v.top===w.top&&v.width===w.width&&v.height===w.height&&v.color===w.color;});
export function ReferenceHighlight({reference,cards}:{reference?:{id:string;quotes:Quote[];surface?:'native'};cards:Record<string,Card>}){
  const [boxes,setBoxes]=useState<Box[]>([]);
  useLayoutEffect(()=>{
    setBoxes([]);if(!reference||reference.surface==='native')return;
    const shadow=document.getElementById('suedama-deepseek-root')?.shadowRoot;if(!shadow)return;
    let frame=0,remaining=24,stable=0,scrolled=false,stopped=false,last:Box[]=[];
    const watched=new Set<Element>();let refresh=()=>{};
    const resize=new ResizeObserver(()=>refresh()),observer=new MutationObserver(()=>refresh());
    const update=()=>{
      if(stopped)return;const next:Box[]=[];
      let removed=false;for(const el of watched)if(!el.isConnected){resize.unobserve(el);watched.delete(el);removed=true;}
      if(removed){observer.disconnect();if(nodes?.isConnected)observer.observe(nodes,{childList:true});for(const el of watched)if(el.matches('article'))observer.observe(el,{childList:true,characterData:true,subtree:true});}
      const articles=new Map([...shadow.querySelectorAll<HTMLElement>('article[data-card][data-role]')].map(el=>[el.dataset.card+':'+el.dataset.role,el]));
      for(const q of reference.quotes){
        const article=articles.get(q.sourceId+':'+q.role);
        const host=article?.closest<HTMLElement>('[data-card-scroll]');if(!article||!host)continue;
        if(!watched.has(article)){watched.add(article);resize.observe(article);observer.observe(article,{childList:true,characterData:true,subtree:true});}if(!watched.has(host)){watched.add(host);resize.observe(host);}
        const range=referenceRange(article,q),rect=range?.getBoundingClientRect()??article.getBoundingClientRect(),base=host.getBoundingClientRect(),scale=base.width/host.offsetWidth;
        if(!scale)continue;
        const left=(rect.left-base.left)/scale+host.scrollLeft-4,top=(rect.top-base.top)/scale+host.scrollTop-4;
        if(!scrolled){host.scrollTop=Math.max(0,top-24);scrolled=true;}
        next.push({host,left,top,width:rect.width/scale+8,height:rect.height/scale+8,color:SELECTED_COLORS[cards[q.sourceId]?.historyColor??0]!});
      }
      stable=next.length&&sameBoxes(last,next)?stable+1:0;last=next;
      setBoxes(old=>sameBoxes(old,next)?old:next);
      if(stable<2&&remaining-->0)frame=requestAnimationFrame(update);
    };
    const nodes=shadow.querySelector('.react-flow__nodes');if(nodes)observer.observe(nodes,{childList:true});
    refresh=()=>{remaining=2;stable=0;cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};frame=requestAnimationFrame(update);
    return()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();};
  },[reference]);
  return <>{boxes.map((b,i)=>createPortal(<div className="reference-frame" style={{left:b.left,top:b.top,width:b.width,height:b.height,borderColor:b.color}}/>,b.host,String(i)))}</>;
}
