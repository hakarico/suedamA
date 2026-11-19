import {t,useLocale} from './i18n';
import {useEffect,useMemo,useRef} from 'react';
import DOMPurify from 'dompurify';
import {AttachmentPreview} from './AttachmentPreview';
import {AnnotationChip} from './AnnotationChip';
import type {Quote,NativeControl} from './model';
import type {CanvasStore,State} from './store';
export function quoteGroups(quotes:Quote[]){const groups=new Map<string,Quote[]>();for(const q of quotes){const key=q.group??q.id;groups.set(key,[...groups.get(key)??[],q]);}return [...groups.values()];}
function NativeButton({control,disabled,onClick,label}:{control:NativeControl;disabled?:boolean;onClick:()=>void;label?:string}){
  const html=useMemo(()=>DOMPurify.sanitize(control.svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['foreignObject','image','use','script'],FORBID_ATTR:['style']}),[control.svg]);
  const text=label??t(control.id==='thinking'?'深度思考':control.id==='search'?'智能搜索':control.id==='attach'?'添加附件':'发送问题');
  return <button className={`native-button native-${control.id}`} style={control.style} aria-label={text} aria-pressed={control.id==='thinking'||control.id==='search'?control.active:undefined} disabled={disabled??control.disabled} onClick={onClick}><span className="native-icon" aria-hidden="true" dangerouslySetInnerHTML={{__html:html}}/>{(control.id==='thinking'||control.id==='search')&&text}</button>;
}
export function NativeComposer({store,state}:{store:CanvasStore;state:State}){useLocale();
  const draft=store.draft(),controls=state.current.controls??[],pending=state.pending&&!state.pending.error;
  const picker=useRef<HTMLInputElement>(null),files=store.files();
  const previews=useMemo(()=>files.map(file=>file.type.startsWith('image/')?URL.createObjectURL(file):''),[files]);useEffect(()=>()=>previews.forEach(url=>url&&URL.revokeObjectURL(url)),[previews]);
  const send=controls.find(c=>c.id==='send');const root=!store.anchorId();
  return <section className="composer" aria-label={t("白板提问")}>
    {pending && <div className="inbox-progress" role="status">{t(state.pending!.stage)}</div>}
    {draft.quotes.length>0 && <div className="annotation-list">{quoteGroups(draft.quotes).map((qs,i)=><AnnotationChip key={qs[0]!.id} quotes={qs} number={qs[0]!.number??i+1} onOpen={()=>store.jumpReference(qs)} onRemove={()=>store.setDraft({quotes:draft.quotes.filter(q=>!qs.includes(q))})}/>)}</div>}
    {!!files.length&&<div className="native-files">{files.map((file,i)=><AttachmentPreview key={i} name={file.name} bytes={file.size} image={previews[i]||undefined} onRemove={()=>store.removeFile(i)}/>)}</div>}
    {!!state.current.files?.length&&<div className="native-files">{state.current.files.map((name,i)=><AttachmentPreview key={`${i}:${name}`} name={name}/>)}</div>}
    <textarea rows={1} aria-label={t("输入问题")} placeholder={root?t("新根线路"):t("发消息")} value={draft.text} disabled={!!pending} onPaste={e=>{const incoming=[...e.clipboardData.files];if(incoming.length){e.preventDefault();e.stopPropagation();store.addFiles(incoming);}}} onChange={e=>store.setDraft({text:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void store.send();}}}/>
    <div className="composer-footer"><div className="native-toggles">{controls.filter(c=>c.id==='thinking'||c.id==='search').map(c=><NativeButton key={c.id} control={c} onClick={()=>void store.nativeAction(c.id)}/>)}</div><span className="native-spacer"/>
      {controls.filter(c=>c.id==='attach').map(c=><NativeButton key={c.id} control={c} onClick={()=>picker.current?.click()}/>)}
      <input hidden ref={picker} type="file" multiple accept={document.querySelector<HTMLInputElement>('input[type=file]')?.accept} onChange={e=>{store.addFiles([...e.target.files??[]]);e.target.value='';}}/>
      {send&&<NativeButton control={send} label={state.current.busy?t("停止生成"):t("发送问题")} disabled={state.nativeNavigating||(!state.current.busy&&(!draft.text.trim()&&!files.length&&!state.current.files?.length||!!pending||state.syncing||!state.ready))} onClick={()=>state.current.busy?void store.nativeAction('send'):void store.send()}/>}
    </div>
  </section>;
}
