import {createRoot} from 'react-dom/client';
import flowStyles from '@xyflow/react/dist/style.css';
import styles from './styles.css';
import {App} from './App';
import {DeepSeekAdapter} from './adapter';
import {CanvasStore} from './store';

if(!document.getElementById('suedama-deepseek-root')) {
  const host=document.createElement('div');
  host.id='suedama-deepseek-root';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'50',pointerEvents:'none'});
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=flowStyles+'\n'+styles;
  let initialOpen=false,archiveReader:{id:string;boardId:string}|undefined;try{initialOpen=sessionStorage.getItem('suedama.canvasOpen')==='1';const value=JSON.parse(sessionStorage.getItem('suedama.archiveReader')??'null');if(value&&typeof value.id==='string'&&typeof value.boardId==='string')archiveReader=value;}catch{}
  if(archiveReader){initialOpen=false;document.documentElement.setAttribute('data-suedama-archive-reading','');const pendingStyle=document.createElement('style');pendingStyle.textContent='html[data-suedama-archive-reading] ._9a2f8e4,html[data-suedama-archive-reading] .fixture-composer{display:none!important}';(document.head??document.documentElement).append(pendingStyle);}
  const boot=document.createElement('div');boot.style.cssText='position:fixed;inset:0;background:#1b1b1b;pointer-events:auto';if(initialOpen)shadow.append(boot);
  const root=document.createElement('div');
  shadow.append(style,root);document.documentElement.append(host);
  const store=new CanvasStore(new DeepSeekAdapter(),undefined,initialOpen);
  if(archiveReader)store.prepareArchiveReader(archiveReader);
  store.subscribe(()=>{try{sessionStorage.setItem('suedama.canvasOpen',store.get().open?'1':'0');const reader=store.get().archiveReader;if(reader)sessionStorage.setItem('suedama.archiveReader',JSON.stringify(reader));else{sessionStorage.removeItem('suedama.archiveReader');document.documentElement.removeAttribute('data-suedama-archive-reading');}}catch{}if(store.get().ready||!store.get().open||store.get().savingError)boot.remove();});
  const start=()=>{createRoot(root).render(<App store={store}/>);void store.start();};if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
  if(typeof chrome!=='undefined' && chrome.runtime?.onMessage) chrome.runtime.onMessage.addListener(message=>{if(message.type==='suedama:toggle')store.toggle();});
  window.addEventListener('pagehide',()=>void store.flush());
}
