import {makeQuote,turnId,sameStep,type Library,type Snapshot,type Role,type Card} from './model';
import {projectSelection} from './selection';

/** Clamp a single native selection to each visible message part, retaining exact offsets. */
export function selectedParts(doc:Document,library:Library,range:Range,parts:{element:HTMLElement;cardId:string;role:Role}[]){
  const quotes=[];
  for(const {element:part,cardId,role}of parts){
    if(part.closest('[data-suedama-wire-hidden]')||!range.intersectsNode(part))continue;
    let visible=true;for(let el:HTMLElement|null=part;el;el=el.parentElement){const css=doc.defaultView?.getComputedStyle(el);if(el.hidden||css?.display==='none'||css?.visibility==='hidden'||el.tagName==='DETAILS'&&!el.hasAttribute('open')&&!el.querySelector('summary')?.contains(part)){visible=false;break;}}if(!visible)continue;
    const card=library.cards[cardId];if(!card)continue;
    const clipped=doc.createRange();clipped.selectNodeContents(part);
    if(part.contains(range.startContainer))clipped.setStart(range.startContainer,range.startOffset);
    if(part.contains(range.endContainer))clipped.setEnd(range.endContainer,range.endOffset);
    const projected=projectSelection(part,clipped);if(!projected?.text.trim())continue;
    quotes.push(makeQuote(card,role,projected.text,projected.start,projected.sourceText));
  }
  return quotes;
}
export function nativeSelection(doc:Document,library:Library,range:Range){
  return selectedParts(doc,library,range,[...doc.querySelectorAll<HTMLElement>('[data-suedama-native-part]')].map(element=>({element,cardId:element.dataset.suedamaNativeCard!,role:element.dataset.suedamaNativePart as Role})));
}

export function nativeParts(doc:Document,library:Library,snapshot:Snapshot){
  const parts:{element:HTMLElement;cardId:string;role:Role}[]=[],rows=new Map([...doc.querySelectorAll<HTMLElement>('[data-virtual-list-item-key]')].map(el=>[el.getAttribute('data-virtual-list-item-key'),el]));
  const row=(key:string|undefined)=>key?rows.get(key):undefined;let fallback:Card[]|undefined;
  for(const card of snapshot.turns.map(turn=>library.cards[turnId(snapshot.conversationId,turn)]??(fallback??=Object.values(library.cards).filter(c=>c.conversationId===snapshot.conversationId)).find(c=>c.route.at(-1)&&sameStep(c.route.at(-1)!,turn))).filter(c=>!!c)){
    const step=card.route.at(-1);if(!step)continue;
    const user=row(step.userKey)?.querySelector<HTMLElement>('.ds-collapsible-text:not([data-suedama])');
    if(user)parts.push({element:user,cardId:card.id,role:'user'});
    const answer=row(step.answerKey),body=answer?.querySelector<HTMLElement>('.ds-assistant-message-main-content'),thought=answer?.querySelector<HTMLElement>('.ds-think-content .ds-markdown,.ds-think-content');
    if(thought)parts.push({element:thought.querySelector<HTMLElement>('.ds-markdown')??thought,cardId:card.id,role:'reasoning'});
    if(body)parts.push({element:body,cardId:card.id,role:'assistant'});
  }
  return parts;
}
