import {isMessageMutation} from './dom-observers';
import {sameStep,turnId,type Library,type Snapshot} from './model';
import {archivedCards} from './topology';

/** Classify only turns actually visible in the official branch, including virtualized suffixes. */
export function archiveMessageStates(library:Library,snapshot:Snapshot){
  const states=new Map<string,'archived'|'context'>(),cards=Object.values(library.cards).filter(c=>c.conversationId===snapshot.conversationId),archived=archivedCards(library.cards);
  for(const turn of snapshot.turns){
    const card=library.cards[turnId(snapshot.conversationId,turn)]??cards.find(c=>c.route.at(-1)&&sameStep(c.route.at(-1)!,turn));
    const state=card&&archived.has(card.id)?'archived':'context';
    states.set(turn.userKey,state);if(turn.answerKey)states.set(turn.answerKey,state);
  }
  if(snapshot.leadingAnswerKey){const card=cards.find(c=>c.route.at(-1)?.answerKey===snapshot.leadingAnswerKey);if(card)states.set(snapshot.leadingAnswerKey,archived.has(card.id)?'archived':'context');}
  return states;
}

/** Reversible presentation on the real native page. No cloned thread, edited text, or draft clearing. */
export function installNativeReadonly(doc:Document,library:()=>Library,snapshot:()=>Snapshot){
  const style=doc.createElement('style');style.dataset.suedama='archive-readonly-style';style.textContent=`
    html[data-suedama-archive-reading] [data-suedama-readonly-composer],html[data-suedama-archive-reading] [data-suedama-readonly-action],html[data-suedama-archive-reading] ._57370c5{display:none!important}
    [data-suedama-archive-host]{isolation:isolate!important}
    [data-suedama-archive-position]{position:relative!important}
    [data-suedama=archive-backdrop]{position:absolute;z-index:-1;pointer-events:none;user-select:none;left:0;width:100%;background:repeating-linear-gradient(135deg,rgb(128 128 128 / 18%) 0 1px,transparent 1px 10px)}
    html[data-suedama-archive-reading] [data-suedama-archive-thinking],
    html[data-suedama-archive-reading] [data-suedama-archive-thinking]::before,
    html[data-suedama-archive-reading] [data-suedama-archive-thinking]::after{background-color:transparent!important;background-image:none!important}
    html[data-suedama-archive-reading] .fixture-native{padding-top:72px;padding-bottom:32px;margin-bottom:0}
  `;doc.head.append(style);doc.documentElement.setAttribute('data-suedama-archive-reading','');
  const inert=new Map<HTMLElement,boolean>(),marked=new Set<HTMLElement>(),observed=new Set<Element>();let stopped=false,frame=0,host:HTMLElement|undefined;
  const backdrop=doc.createElement('div');backdrop.dataset.suedama='archive-backdrop';backdrop.setAttribute('aria-hidden','true');backdrop.hidden=true;
  const releaseHost=()=>{host?.removeAttribute('data-suedama-archive-host');host?.removeAttribute('data-suedama-archive-position');host=undefined;backdrop.remove();};
  const updateBackdrop=(rows:HTMLElement[])=>{
    const first=rows.find(row=>row.dataset.suedamaArchiveState==='archived');
    let parent=rows[0]?.parentElement;
    while(parent&&rows.some(row=>!parent!.contains(row)))parent=parent.parentElement;
    const viewport=doc.querySelector<HTMLElement>('.ds-virtual-list.ds-scroll-area');
    // Prefer the official reading viewport, so the pattern spans the pane rather than a message box.
    const next=first?(viewport&&rows.every(row=>viewport.contains(row))?viewport:parent??undefined):undefined;
    if(next!==host){releaseHost();host=next;if(host){host.setAttribute('data-suedama-archive-host','');if(getComputedStyle(host).position==='static')host.setAttribute('data-suedama-archive-position','');}}
    if(host&&backdrop.parentElement!==host)host.append(backdrop);
    const targets=new Set<Element>([...rows,...(host?[host]:[])]);
    for(const el of observed)if(!targets.has(el)){resize?.unobserve(el);observed.delete(el);}
    for(const el of targets)if(!observed.has(el)){resize?.observe(el);observed.add(el);}
    // Do not let our absolute sheet keep the old scroll height after content collapses.
    backdrop.hidden=true;
    if(first&&host){
      // One sheet in the native list's own coordinate space: gaps and thinking share the same pattern.
      // A virtualized leading archived answer also provides the boundary when its user row is unmounted.
      const bounds=host.getBoundingClientRect(),top=Math.max(0,first.getBoundingClientRect().top-bounds.top+host.scrollTop-host.clientTop);
      backdrop.style.top=`${top}px`;backdrop.style.height=`${Math.max(0,Math.max(host.clientHeight,host.scrollHeight)-top)}px`;
      backdrop.hidden=false;
    }
  };
  const block=(element:HTMLElement,attribute:string)=>{if(!inert.has(element))inert.set(element,element.inert);element.inert=true;element.setAttribute(attribute,'');marked.add(element);};
  const update=()=>{frame=0;if(stopped)return;
    for(const el of marked){el.removeAttribute('data-suedama-archive-thinking');if(!el.isConnected){el.removeAttribute('data-suedama-archive-state');el.removeAttribute('data-suedama-readonly-action');el.removeAttribute('data-suedama-readonly-composer');if(inert.has(el)){el.inert=inert.get(el)!;inert.delete(el);}marked.delete(el);}}
    const states=archiveMessageStates(library(),snapshot());
    const rows=[...doc.querySelectorAll<HTMLElement>('[data-virtual-list-item-key]')];
    for(const row of rows){
      row.dataset.suedamaArchiveState=states.get(row.getAttribute('data-virtual-list-item-key')!)??'context';marked.add(row);
      if(row.dataset.suedamaArchiveState==='archived'){
        const transparent=(el:HTMLElement)=>{el.setAttribute('data-suedama-archive-thinking','');marked.add(el);};
        for(const el of row.querySelectorAll<HTMLElement>('details,summary,.ds-think-content'))transparent(el);
        for(const title of row.querySelectorAll<HTMLElement>('._5255ff8'))for(let el:HTMLElement|null=title;el&&el!==row;el=el.parentElement)transparent(el);
      }
      for(const button of row.querySelectorAll<HTMLElement>('button,[role=button]')){
        const parent=button.parentElement,label=(button.getAttribute('aria-label')??'')+' '+(button.getAttribute('title')??'')+' '+button.textContent;
        const versions=parent&&/^\s*[‹›<>←→\s]*\d+\s*\/\s*\d+[‹›<>←→\s]*$/.test(parent.textContent??'');
        const siblings=parent?[...parent.querySelectorAll<HTMLElement>(':scope>button,:scope>[role=button]')]:[];
        const copy=siblings.length>1&&siblings[0]===button;
        if(versions||copy||/复制|copy|朗读|read aloud|思考|thought|thinking|展开|收起/i.test(label)||button.closest('pre,.ds-collapsible-text')){button.removeAttribute('data-suedama-readonly-action');if(inert.has(button)){button.inert=inert.get(button)!;inert.delete(button);}continue;}
        block(button,'data-suedama-readonly-action');
      }
    }
    updateBackdrop(rows);
    const input=doc.querySelector<HTMLTextAreaElement>('textarea');
    const composer=input?.closest<HTMLElement>('._9a2f8e4,.fixture-composer')??input?.parentElement?.parentElement;
    if(composer)block(composer,'data-suedama-readonly-composer');
  };
  const queue=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const resize=doc.defaultView?.ResizeObserver?new doc.defaultView.ResizeObserver(queue):undefined;
  const observer=new MutationObserver(records=>{if(host&&!backdrop.isConnected||records.some(isMessageMutation))queue();});observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','aria-pressed']});
  doc.addEventListener('scroll',queue,true);doc.defaultView?.addEventListener('resize',queue);
  const prevent=(event:Event)=>{const target=event.target as Element;if(target.closest?.('[data-suedama-readonly-action],[data-suedama-readonly-composer]')||target instanceof HTMLTextAreaElement){event.preventDefault();event.stopImmediatePropagation();}};
  for(const type of ['click','keydown','beforeinput','paste','drop','submit'])doc.addEventListener(type,prevent,true);
  update();return()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();resize?.disconnect();releaseHost();doc.removeEventListener('scroll',queue,true);doc.defaultView?.removeEventListener('resize',queue);style.remove();doc.documentElement.removeAttribute('data-suedama-archive-reading');for(const el of marked){el.removeAttribute('data-suedama-archive-thinking');el.removeAttribute('data-suedama-archive-state');el.removeAttribute('data-suedama-readonly-action');el.removeAttribute('data-suedama-readonly-composer');}for(const [el,value]of inert)el.inert=value;for(const type of ['click','keydown','beforeinput','paste','drop','submit'])doc.removeEventListener(type,prevent,true);};
}
