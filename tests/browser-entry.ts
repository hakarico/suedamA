import {installFixture} from './fixture';
import {DeepSeekAdapter} from '../src/adapter';
import {CanvasStore} from '../src/store';
import {LibraryStorage} from '../src/storage';
import {App} from '../src/App';
import {createElement,Profiler} from 'react';
import {createRoot} from 'react-dom/client';
import flowStyles from '@xyflow/react/dist/style.css';
import styles from '../src/styles.css';
const stress=Number(new URL(location.href).searchParams.get('stress')??0);
const fixture=installFixture(document,true,Number.isFinite(stress)?stress:0);
// Exercise the same public language signal as the official settings, without account changes.
document.documentElement.lang=sessionStorage.getItem('suedama.fixture.language')??'zh-CN';
const language=document.createElement('select');language.setAttribute('aria-label','Fixture language');
language.style.cssText='position:fixed;left:12px;bottom:8px;z-index:20;background:#252525;color:#ddd;border:1px solid #555;border-radius:6px;padding:3px';
for(const [value,label]of [['zh-CN','简体中文'],['en-US','English'],['ja','日本語']] as const){const option=document.createElement('option');option.value=value;option.textContent=label;language.append(option);}
language.value=document.documentElement.lang;language.onchange=()=>{document.documentElement.lang=language.value;sessionStorage.setItem('suedama.fixture.language',language.value);};document.body.append(language);
// Same production adapter and UI; collect both branches to exercise the graph.
const adapter=new DeepSeekAdapter(document);
// Native fixture IDs restart in a new tab. Give each run its own local library, retained on reload.
const run=sessionStorage.getItem('suedama.fixture.run')??crypto.randomUUID();
sessionStorage.setItem('suedama.fixture.run',run);
const store=new CanvasStore(adapter,new LibraryStorage(`suedama.fixture.v4:${run}`));
let reader:{id:string;boardId:string}|undefined;try{reader=JSON.parse(sessionStorage.getItem('suedama.fixture.reader')??'null')??undefined;}catch{}
if(reader)store.prepareArchiveReader(reader);
store.subscribe(()=>{const value=store.get().archiveReader;if(value)sessionStorage.setItem('suedama.fixture.reader',JSON.stringify(value));else sessionStorage.removeItem('suedama.fixture.reader');});
await store.start();
if(!reader&&fixture.versions.length>1)fixture.setBranch(2);
await new Promise(resolve=>setTimeout(resolve,200));
const host=document.createElement('div');host.id='suedama-deepseek-root';
Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'2147483000',pointerEvents:'none'});
const shadow=host.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=flowStyles+'\n'+styles;
const root=document.createElement('div');shadow.append(style,root);document.documentElement.append(host);
let commits=0,totalRenderMs=0,longTasks=0,longTaskMs=0;
createRoot(root).render(createElement(Profiler,{id:'app',onRender:(_id,_phase,duration)=>{host.dataset.qaCommits=String(++commits);host.dataset.qaRenderMs=(totalRenderMs+=duration).toFixed(1);}},createElement(App,{store})));
if(PerformanceObserver.supportedEntryTypes.includes('longtask')){
  const tasks=new PerformanceObserver(list=>{for(const entry of list.getEntries()){longTasks++;longTaskMs+=entry.duration;}host.dataset.qaLongTasks=String(longTasks);host.dataset.qaLongTaskMs=longTaskMs.toFixed(1);});tasks.observe({entryTypes:['longtask']});
  window.addEventListener('pagehide',()=>tasks.disconnect(),{once:true});
}
if(!store.get().archiveReader)store.setOpen(true);
window.addEventListener('pagehide',()=>void store.flush());

// Readable DOM evidence that geometry/selection changed before pointer release.
let gesture:{node?:HTMLElement;width:number;height:number;resize:boolean}|undefined;
shadow.addEventListener('pointerdown',event=>{const e=event as PointerEvent,target=e.target as Element,node=target.closest<HTMLElement>('.react-flow__node-card'),r=node?.getBoundingClientRect();if(e.button===0){gesture={node:node??undefined,width:r?.width??0,height:r?.height??0,resize:!!target.closest('.react-flow__resize-control')};host.dataset.qaLiveResize='false';host.dataset.qaLiveSelection='0';}},true);
const evidence=new MutationObserver(()=>{if(!gesture)return;if(gesture.resize&&gesture.node){const r=gesture.node.getBoundingClientRect();if(Math.abs(r.width-gesture.width)>1||Math.abs(r.height-gesture.height)>1)host.dataset.qaLiveResize='true';}if(!gesture.node)host.dataset.qaLiveSelection=String(Math.max(Number(host.dataset.qaLiveSelection??0),shadow.querySelectorAll('.card.selected').length));});evidence.observe(shadow,{subtree:true,attributes:true,attributeFilter:['style','class']});
window.addEventListener('pointerup',()=>{gesture=undefined;},true);window.addEventListener('pointercancel',()=>{gesture=undefined;},true);
