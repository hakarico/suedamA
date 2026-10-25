import {isMessageMutation} from './dom-observers';
import {nativeParts} from './native-selection';
import {referenceRange} from './selection';
import type {Library,Quote,Snapshot} from './model';

/** Coarse, reversible paragraph highlights on the official thread; never wrap native text. */
export function nativeReferenceBlocks(part:HTMLElement,quote:Quote){
  const range=referenceRange(part,quote);
  const blocks=[...part.querySelectorAll<HTMLElement>('p,li,pre,blockquote,h1,h2,h3,h4,h5,h6,tr')].filter(el=>range?range.intersectsNode(el):!!quote.text.trim()&&el.textContent?.includes(quote.text.trim()));
  return blocks.length?blocks.filter(el=>!blocks.some(child=>child!==el&&el.contains(child))):[part];
}

export function installNativeReference(doc:Document,quotes:Quote[],library:()=>Library,snapshot:()=>Snapshot){
  const style=doc.createElement('style');style.dataset.suedama='native-reference-style';style.textContent='[data-suedama-reference-block]{background-color:rgb(157 157 143 / 24%)!important;box-decoration-break:clone}';doc.head.append(style);
  let stopped=false,frame=0,scrolled=false;const marked=new Set<HTMLElement>();
  const update=()=>{
    frame=0;if(stopped)return;const parts=nativeParts(doc,library(),snapshot()),next=new Set<HTMLElement>();
    for(const quote of quotes){
      let part=parts.find(p=>p.cardId===quote.sourceId&&p.role===quote.role)?.element;if(!part)continue;
      if(part.hasAttribute('data-suedama-wire-hidden'))part=part.nextElementSibling?.matches('[data-suedama=native-question]')?part.nextElementSibling as HTMLElement:undefined;
      if(!part)continue;
      for(let ancestor:HTMLElement|null=part;ancestor;ancestor=ancestor.parentElement)if(ancestor.tagName==='DETAILS')(ancestor as HTMLDetailsElement).open=true;
      for(const block of nativeReferenceBlocks(part,quote))next.add(block);
    }
    for(const block of marked)if(!next.has(block)){block.removeAttribute('data-suedama-reference-block');marked.delete(block);}
    for(const block of next){block.setAttribute('data-suedama-reference-block','');marked.add(block);}
    const first=next.values().next().value;if(first&&!scrolled){first.scrollIntoView({block:'center',behavior:'instant'});scrolled=true;}
  };
  const queue=()=>{if(!frame&&!stopped)frame=requestAnimationFrame(update);};
  const observer=new MutationObserver(records=>{
    const presentation=records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node as Element).matches('[data-suedama=native-question]')));
    if(presentation||records.some(isMessageMutation))queue();
  });observer.observe(doc.body,{childList:true,subtree:true,characterData:true});queue();
  return()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();for(const block of marked)block.removeAttribute('data-suedama-reference-block');style.remove();};
}
