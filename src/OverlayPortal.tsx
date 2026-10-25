import {useLayoutEffect,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import styles from './styles.css';

/** Escape the canvas stacking context so native navigation cannot cover dialogs. */
export function OverlayPortal({children,modal=false}:{children:ReactNode;modal?:boolean}){
  const [mount,setMount]=useState<ShadowRoot>();
  useLayoutEffect(()=>{
    const host=document.createElement('div');host.dataset.suedama='overlay';
    host.style.cssText='position:fixed;inset:0;z-index:1000;pointer-events:none';
    const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=styles;shadow.append(style);
    document.documentElement.append(host);setMount(shadow);
    const blocked=modal?[...document.body.children,document.getElementById('suedama-deepseek-root')].filter((el):el is HTMLElement=>el instanceof HTMLElement&&el!==host).map(el=>({el,inert:el.inert})):[];for(const item of blocked)item.el.inert=true;
    return()=>{for(const item of blocked)item.el.inert=item.inert;host.remove();};
  },[modal]);
  return mount?createPortal(children,mount):null;
}
