import {t,useLocale} from './i18n';
import {DEFAULT_PREAMBLE,normalizePrompt,openingGuidance} from './prompt';
import {packLibrary} from './storage-codec';
import {ArchivePanel} from './ArchivePanel';
import {boardAppearance} from './boards';
import {useEffect,useRef,useState} from 'react';
import {Icon} from './Icon';
import {CanvasStore,errorText,type State} from './store';
import {belongsToBoard} from './boards';
import {archivedCards} from './topology';
import {displayQuestion,roleLabel} from './model';
export function download(name:string,text:string,type='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function SettingsPanel({store,state,onClose}:{store:CanvasStore;state:State;onClose:()=>void}){useLocale();
  const [tab,setTab]=useState<'appearance'|'prompt'|'archive'|'data'>(state.archives?'archive':'appearance'),image=useRef<HTMLInputElement>(null),backup=useRef<HTMLInputElement>(null);
  const board=state.library.boards?.[state.canvasId],appearance=boardAppearance(state.library,state.canvasId);
  return <div className="settings-backdrop" onClick={onClose}><section className={"settings-panel"+(tab==='archive'?' archive-settings':'')} role="dialog" aria-modal="true" aria-label={t("suedamA设置")} onClick={e=>e.stopPropagation()}>
    <div className="panel-heading"><strong>{t("suedamA设置")}</strong><button aria-label={t("关闭白板设置")} onClick={onClose}><Icon name="close"/></button></div>
    <nav className="settings-tabs"><button aria-pressed={tab==='appearance'} onClick={()=>setTab('appearance')}>{t("画布外观")}</button><button aria-pressed={tab==='prompt'} onClick={()=>setTab('prompt')}>{t("提问设置")}</button><button aria-pressed={tab==='archive'} onClick={()=>setTab('archive')}>{t("归档")}</button><button aria-pressed={tab==='data'} onClick={()=>setTab('data')}>{t("本地数据")}</button></nav>
    {tab==='appearance'?<div className="settings-body">
      <label className="setting-row">{t("点阵背景")}<input type="checkbox" checked={appearance.dots} onChange={e=>store.appearance({dots:e.target.checked})}/></label>
      <div className="setting-row"><span>{t("背景图片")}</span><div><button onClick={()=>image.current?.click()}>{t("选择图片")}</button>{appearance.image&&<button onClick={()=>store.appearance({image:undefined})}>{t("移除")}</button>}</div></div>
      {appearance.image&&<><label className="setting-row">{t("亮度")}<span className="slider-field"><input title={appearance.brightness+'%'} aria-label={t("背景亮度")} type="range" min="0" max="150" value={appearance.brightness} onChange={e=>store.appearance({brightness:Number(e.target.value)})}/><output>{appearance.brightness}%</output></span></label><label className="setting-row">{t("模糊")}<span className="slider-field"><input title={appearance.blur+'px'} aria-label={t("背景模糊")} type="range" min="0" max="30" value={appearance.blur} onChange={e=>store.appearance({blur:Number(e.target.value)})}/><output>{appearance.blur}px</output></span></label></>}
      <label className="setting-row">{t("容器不透明度")}<span className="slider-field"><input aria-label={t("容器不透明度")} title={appearance.opacity+'%'} type="range" min="0" max="100" value={appearance.opacity} onChange={e=>store.appearance({opacity:Number(e.target.value)})}/><output>{appearance.opacity}%</output></span></label>
      <input ref={image} type="file" hidden accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file){if(file.size>6_000_000){store.notice(t("背景图片请控制在 6 MB 内。"));return;}const reader=new FileReader();reader.onload=()=>store.appearance({image:String(reader.result)},board?.id);reader.readAsDataURL(file);}e.target.value='';}}/>
    </div>:tab==='prompt'?<PromptSettings key={state.canvasId} store={store} state={state} onCancel={onClose}/>:tab==='archive'?<ArchivePanel store={store} library={state.library} initialCard={state.archives?state.reference?.quotes[0]?.sourceId:undefined}/>:<div className="settings-body data-actions">
      <button title={t("重新读取官网当前分支的消息和思考，补齐虚拟列表内容；不发送问题，不自动遍历其他分支。")} disabled={state.syncing||!!state.pending&&!state.pending.error} onClick={()=>void store.sync()}><Icon name="reconnect"/>{t("重新收集当前线路")}</button>
      <button title={t("导出所有白板、归档、卡片内容和本地整理设置的 JSON，可通过导入备份恢复。")} onClick={()=>download('suedama-backup.json',JSON.stringify(packLibrary({...state.library,resume:undefined}),null,2))}><Icon name="download"/>{t("导出备份")}</button>
      <button onClick={()=>backup.current?.click()}><Icon name="upload"/>{t("导入备份")}</button>
      <button title={t("将当前白板未归档卡片的提问、回答和引用导出为 Markdown，用于阅读；不包含画布布局。")} onClick={()=>{const archived=archivedCards(state.library.cards);download('suedama-notes.md',Object.values(state.library.cards).filter(c=>belongsToBoard(c,board)&&!archived.has(c.id)).map(c=>`# ${t("用户提问")}\n\n${displayQuestion(c)}\n\n# ${t("回答")}\n\n${c.answer}\n\n${c.annotations.map(q=>`## ${t("注释")} ${q.number??''} · ${t(roleLabel(q.role))}\n\n${q.text}`).join('\n\n')}`).join('\n\n---\n\n'),'text/markdown;charset=utf-8');}}><Icon name="text-summary"/>{t("导出笔记")}</button>
      <input ref={backup} type="file" hidden accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];if(file)try{if(file.size>30_000_000)throw new Error(t("备份超过 30 MB。"));await store.importBackup(await file.text());}catch(error){store.notice(errorText(error));}e.target.value='';}}/>
    </div>}
  </section></div>;
}

export function PromptSettings({store,state,onCancel}:{store:CanvasStore;state:State;onCancel:()=>void}){useLocale();
  const board=state.library.boards?.[state.canvasId],global=state.library.globalCustomPrompt?.text??'';
  const preamble=openingGuidance(board),local=board?.customPrompt??global;
  const [scope,setScope]=useState<'global'|'board'>(board?.customPrompt!==undefined?'board':'global'),[inherit,setInherit]=useState(false);
  const [draft,setDraft]=useState({preamble,global,board:local}),previous=useRef({preamble,global,board:local});
  // Follow applied changes from other boards/tabs, but retain this editor's unsaved text.
  useEffect(()=>{const next={preamble,global,board:local},old=previous.current;setDraft(value=>Object.fromEntries(Object.entries(next).map(([key,text])=>[key,value[key as keyof typeof value]===old[key as keyof typeof old]?text:value[key as keyof typeof value]])) as typeof value);previous.current=next;},[preamble,global,local]);
  const changed=inherit&&board?.customPrompt!==undefined||normalizePrompt(draft.preamble)!==normalizePrompt(preamble)||!inherit&&normalizePrompt(draft[scope])!==normalizePrompt(scope==='global'?global:local);
  return <div className="settings-body prompt-settings">
    <label>{t('开头引导')}<textarea aria-label={t('开头引导')} rows={5} value={draft.preamble} onChange={e=>setDraft({...draft,preamble:e.target.value})}/></label>
    <label><span className="prompt-setting-heading"><span>{t('自定义 Prompt（可选）')}</span><select aria-label={t('自定义 Prompt 范围')} value={scope} onChange={e=>{setScope(e.target.value as 'global'|'board');setInherit(false);}}><option value="global">{t('全局')}</option><option value="board" disabled={!board}>{t('当前白板')}</option></select></span><textarea aria-label={t('自定义 Prompt')} rows={6} placeholder={t('例如：用中文回答，先给直观解释，再给例子。')} value={draft[scope]} onChange={e=>{setDraft({...draft,[scope]:e.target.value});setInherit(false);}}/></label>
    <p>{inherit?t('应用后将恢复使用全局 Prompt。'):scope==='global'?t('全局 Prompt 同步到所有会话，包括未归入白板的官网会话；白板自己的设置优先。'):board?.customPrompt===undefined?t('当前使用全局 Prompt。修改并应用后，将只覆盖当前白板。'):t('当前白板已覆盖全局 Prompt。')}{' '}{t('开头引导只在根轮发送，修改只影响新根。自定义 Prompt 应用改动后，每条受影响线路的下次提问更新一次。未应用不生效。')}</p>
    <div className="prompt-setting-actions"><button onClick={()=>setDraft({...draft,preamble:DEFAULT_PREAMBLE})}>{t('恢复默认引导')}</button>{board?.customPrompt!==undefined&&<button onClick={()=>{setInherit(true);setScope('board');setDraft({...draft,board:global});}}>{t('使用全局 Prompt')}</button>}<span className="prompt-actions-spacer"/><button onClick={onCancel}>{t('取消')}</button><button className="prompt-apply" disabled={!changed} onClick={()=>{if(store.promptSettings({promptPreamble:draft.preamble,...(inherit?{inheritGlobal:true}:{customPrompt:draft[scope]})},state.canvasId,scope)){setInherit(false);store.notice(t('提问设置已应用。'));}}}>{t('应用')}</button></div>
  </div>;
}
