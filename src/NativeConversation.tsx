import {isMessageMutation} from './dom-observers';
import {installNativeReference} from './native-reference';
import {t,useLocale} from './i18n';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {CanvasStore,State} from './store';
import {displayQuestion,type Quote} from './model';
import {parsePrompt,annotationGroups} from './prompt';
import {nativeParts,nativeSelection} from './native-selection';
import {AnnotationChip} from './AnnotationChip';
import {OverlayPortal} from './OverlayPortal';
import {Icon} from './Icon';
import styles from './styles.css';

type Display={host:HTMLElement;cardId:string;question:string;quotes:Quote[];fallback?:ReturnType<typeof parsePrompt>};
export function NativeConversation({store,state}:{store:CanvasStore;state:State}){useLocale();
  const [composer,setComposer]=useState<HTMLElement>(),[displays,setDisplays]=useState<Display[]>([]),[selection,setSelection]=useState<{quotes:Quote[];x:number;y:number;draftId:string}>();
  useEffect(()=>{
    const doc=document,css=doc.createElement('style');css.dataset.suedama='native-presentation-style';css.textContent='[data-suedama-wire-hidden]{display:none!important}[data-suedama=native-question]{white-space:pre-wrap;max-height:none!important;height:auto!important;overflow:visible!important}';doc.head.append(css);
    const chipHost=doc.createElement('div');chipHost.dataset.suedama='native-composer';chipHost.style.display='block';const shadow=chipHost.attachShadow({mode:'open'}),sheet=doc.createElement('style');sheet.textContent=styles+'\n.native-quote-draft{color:inherit;padding:8px 20px}.native-quote-draft .annotation-list{margin:0;display:flex;gap:6px;flex-wrap:wrap}';const chipRoot=doc.createElement('div');shadow.append(sheet,chipRoot);
    const replacements=new Map<HTMLElement,HTMLElement>(),marked=new Set<HTMLElement>();let queued=false,stopped=false;
    const update=()=>{queued=false;if(stopped)return;const current=store.get(),next:Display[]=[],seen=new Set<HTMLElement>();
      for(const part of nativeParts(doc,current.library,store.adapter.read())){
        const body=part.element;seen.add(body);marked.add(body);body.dataset.suedamaNativePart=part.role;body.dataset.suedamaNativeCard=part.cardId;
        const card=current.library.cards[part.cardId]!,parsed=part.role==='user'?parsePrompt(card.question):undefined;
        if(part.role==='user'&&(parsed||card.prompt!==undefined&&card.prompt!==card.question)){let host=replacements.get(body);if(!host){host=doc.createElement('div');host.className=body.className;host.dataset.suedama='native-question';body.after(host);replacements.set(body,host);}body.dataset.suedamaWireHidden='true';host.dataset.suedamaNativePart='user';host.dataset.suedamaNativeCard=part.cardId;if(host.previousSibling!==body)body.after(host);next.push({host,cardId:card.id,question:displayQuestion(card),quotes:card.annotations,fallback:parsed});}
        else if(replacements.has(body)){replacements.get(body)!.remove();replacements.delete(body);body.removeAttribute('data-suedama-wire-hidden');}
      }
      // Recognize freshly mounted native messages before the debounced history collector runs.
      for(const body of doc.querySelectorAll<HTMLElement>('.ds-message .ds-collapsible-text:not([data-suedama])'))if(!seen.has(body)){
        const parsed=parsePrompt((body.textContent??'').trim());if(!parsed)continue;seen.add(body);marked.add(body);let host=replacements.get(body);if(!host){host=doc.createElement('div');host.className=body.className;host.dataset.suedama='native-question';body.after(host);replacements.set(body,host);}if(host.previousSibling!==body)body.after(host);body.dataset.suedamaWireHidden='true';next.push({host,cardId:'',question:parsed.userMessage,quotes:[],fallback:parsed});
      }
      for(const body of marked)if(!seen.has(body)){body.removeAttribute('data-suedama-native-part');body.removeAttribute('data-suedama-native-card');body.removeAttribute('data-suedama-wire-hidden');replacements.get(body)?.remove();replacements.delete(body);marked.delete(body);}
      const liveHosts=new Set(replacements.values());for(const host of doc.querySelectorAll<HTMLElement>('[data-suedama=native-question]'))if(!liveHosts.has(host))host.remove();
      const input=doc.querySelector<HTMLTextAreaElement>('textarea'),active=!current.open&&!current.archiveReader;
      composerExpected=!!input&&active&&doc.querySelectorAll('textarea').length===1;
      if(composerExpected){const before=input!.parentElement!;if(chipHost.nextSibling!==before)before.before(chipHost);setComposer(chipRoot);}else{chipHost.remove();setComposer(undefined);}
      setDisplays(old=>old.length===next.length&&old.every((v,i)=>v.host===next[i]!.host&&v.question===next[i]!.question&&v.quotes===next[i]!.quotes)?old:next);
    };
    const schedule=()=>{if(!queued&&!stopped){queued=true;queueMicrotask(update);}};
    let previous=store.get();const unsub=store.subscribe(()=>{const next=store.get();if(next.current!==previous.current||next.library.cards!==previous.library.cards||next.open!==previous.open||next.archiveReader!==previous.archiveReader)schedule();previous=next;}),observer=new MutationObserver(records=>{
      // Native reconciliation may remove just our sibling while leaving the source message intact.
      const detached=[...replacements].some(([body,host])=>body.isConnected&&!host.isConnected);
      if(detached||composerExpected&&!chipHost.isConnected||records.some(isMessageMutation))schedule();
    });let composerExpected=false;observer.observe(doc.body,{subtree:true,childList:true,characterData:true});
    const mouseup=(event:MouseEvent)=>{if(store.get().open||(event.target as Element).closest('button,input,textarea,[role=button],[data-suedama=native-composer]'))return;const selected=doc.defaultView?.getSelection();if(!selected?.rangeCount||selected.isCollapsed){setSelection(undefined);return;}const range=selected.getRangeAt(0),quotes=nativeSelection(doc,store.get().library,range);if(!quotes.length){setSelection(undefined);return;}const r=range.getBoundingClientRect();setSelection({quotes,x:Math.max(8,Math.min(r.left,innerWidth-120)),y:Math.max(8,r.top-44),draftId:store.nativeDraftKey()});};
    const submit=(event:Event)=>{
      const current=store.get();if(current.open||current.archiveReader||current.current.busy||store.adapter.submissionInProgress?.())return;
      const input=doc.querySelector<HTMLTextAreaElement>('textarea');if(!input||doc.querySelectorAll('textarea').length!==1)return;
      const key=event as KeyboardEvent,isEnter=event.type==='keydown'&&event.target===input&&key.key==='Enter'&&!key.shiftKey&&!key.ctrlKey&&!key.metaKey&&!key.altKey&&!key.isComposing;
      const isClick=event.type==='click'&&(event.target as Element).closest('.ds-button--primary.ds-button--circle');
      if(!isEnter&&!isClick||!input.value.trim()&&!current.current.files?.length)return;
      if(isClick&&(isClick.getAttribute('aria-disabled')==='true'||isClick.classList.contains('ds-button--disabled')))return;
      event.preventDefault();event.stopImmediatePropagation();void store.sendNative(input.value);
    };
    const selectionChanged=()=>{if(doc.defaultView?.getSelection()?.isCollapsed)setSelection(undefined);};
    doc.addEventListener('selectionchange',selectionChanged);doc.addEventListener('mouseup',mouseup);doc.addEventListener('click',submit,true);doc.addEventListener('keydown',submit,true);update();
    return()=>{stopped=true;unsub();observer.disconnect();doc.removeEventListener('selectionchange',selectionChanged);doc.removeEventListener('mouseup',mouseup);doc.removeEventListener('click',submit,true);doc.removeEventListener('keydown',submit,true);for(const body of marked){body.removeAttribute('data-suedama-native-part');body.removeAttribute('data-suedama-native-card');body.removeAttribute('data-suedama-wire-hidden');}for(const host of replacements.values())host.remove();chipHost.remove();css.remove();};
  },[store]);
  useEffect(()=>setSelection(undefined),[state.current.conversationId,state.open]);
  useLayoutEffect(()=>!state.open&&state.reference?.surface==='native'?installNativeReference(document,state.reference.quotes,()=>store.get().library,()=>store.get().current):undefined,[state.reference,state.open,store]);
  const draftId=store.nativeDraftKey(),draft=store.draft(draftId);
  return <>{displays.map(d=>createPortal(<>{d.question}<NativeReferences quotes={d.quotes} fallback={d.fallback} store={store}/></>,d.host))}
    {composer&&!!draft.quotes.length&&createPortal(<div className="native-quote-draft">{!!draft.quotes.length&&<div className="annotation-list">{annotationGroups(draft.quotes).map((qs,i)=><AnnotationChip key={qs[0]!.id} quotes={qs} number={qs[0]!.number??i+1} onOpen={()=>void store.jumpNativeReference(qs)} onRemove={()=>store.setDraft({quotes:draft.quotes.filter(q=>!qs.includes(q))},draftId)}/>)}</div>}</div>,composer)}
    {selection&&!state.open&&<OverlayPortal><div className="selection-actions" style={{left:selection.x,top:selection.y}} onPointerDown={e=>e.preventDefault()}><button aria-label={t("引用所选原文")} onClick={()=>{store.quoteMany(selection.quotes,selection.draftId);setSelection(undefined);window.getSelection()?.removeAllRanges();}}><Icon name="quote"/></button><button aria-label={t("取消划选引用")} onClick={()=>setSelection(undefined)}><Icon name="close"/></button></div></OverlayPortal>}
  </>;
}

function NativeReferences({quotes,fallback,store}:{quotes:Quote[];fallback?:ReturnType<typeof parsePrompt>;store:CanvasStore}){useLocale();
  const ref=useRef<HTMLSpanElement>(null),[mount,setMount]=useState<ShadowRoot>();
  useLayoutEffect(()=>{if(!ref.current)return;const root=ref.current.shadowRoot??ref.current.attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=styles+'\n.annotation-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}';root.append(style);setMount(root);},[]);
  return <span ref={ref}>{mount&&createPortal(<span className="annotation-list">{annotationGroups(quotes).map((qs,i)=><AnnotationChip key={qs[0]!.id} quotes={qs} number={qs[0]!.number??i+1} onOpen={()=>void store.jumpNativeReference(qs)}/>)}{!quotes.length&&fallback?.contexts.map(c=><details key={c.id}><summary>{t("注释")} {c.id}</summary><pre>{c.text}</pre></details>)}</span>,mount)}</span>;
}
