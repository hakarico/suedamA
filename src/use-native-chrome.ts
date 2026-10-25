import {isChromeMutation} from './dom-observers';
import {useLayoutEffect,useState} from 'react';
/** Measure the real expanded sidebar; an owned transparent rail replaces collapsed chrome. */
export function useNativeChrome(open=false){
  const [chrome,setChrome]=useState({width:0,modal:false});
  useLayoutEffect(()=>{
    const style=document.createElement('style');style.dataset.suedama='navigation-style';
    style.textContent=`
      html[data-suedama-sidebar=collapsed] .dc04ec1d{z-index:60!important}
      html[data-suedama-sidebar=collapsed] .ca6d4be1{visibility:hidden!important;pointer-events:none!important}
      html[data-suedama-sidebar=collapsed] .the-header ._9fcbeda{margin-left:56px!important}
      html[data-suedama-sidebar=expanded] .the-header ._9fcbeda{margin-left:0!important}
      html[data-suedama-canvas=open] .dc04ec1d{z-index:60!important}
      html[data-suedama-canvas=open] ._2be88ba,html[data-suedama-canvas=open] ._2be88ba ._57370c5{visibility:hidden!important;pointer-events:none!important}
    `;document.head.append(style);
    let frame=0;const original=document.documentElement.getAttribute('data-suedama-sidebar');
    const update=()=>{frame=0;
      const sidebar=document.querySelector<HTMLElement>('.b8812f16,.fixture-history'),rect=sidebar?.getBoundingClientRect(),owner=sidebar?.closest('.dc04ec1d'),expanded=!!rect&&rect.width>160&&(owner?!owner.classList.contains('a02af2e6')&&getComputedStyle(sidebar!).display!=='none':rect.left>=-2&&rect.right>180);
      const rail=document.querySelector('.e5bf614e');const width=expanded?Math.round(rect!.width):rail||sidebar?56:0;
      const modal=[...document.querySelectorAll<HTMLElement>('.ds-modal,[role=dialog]')].some(e=>!e.closest('[data-suedama]')&&e.getBoundingClientRect().width>0)||[...document.querySelectorAll('img')].some(image=>{let p:HTMLElement|null=image;for(let i=0;p&&i<6;i++,p=p.parentElement){const r=p.getBoundingClientRect();if(getComputedStyle(p).position==='fixed'&&Number(getComputedStyle(p).zIndex)>=50&&r.width>innerWidth*.6&&r.height>innerHeight*.6)return true;}return false;});
      const mode=expanded?'expanded':'collapsed';if(document.documentElement.dataset.suedamaSidebar!==mode)document.documentElement.dataset.suedamaSidebar=mode;
      const host=document.getElementById('suedama-deepseek-root');if(host&&host.style.zIndex!==(modal?'1':'50'))host.style.zIndex=modal?'1':'50';
      setChrome(old=>old.width===width&&old.modal===modal?old:{width,modal});
    };
    const queue=()=>{if(!frame)frame=requestAnimationFrame(update);};const observer=new MutationObserver(records=>{if(records.some(isChromeMutation))queue();});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});window.addEventListener('resize',queue);document.addEventListener('transitionend',queue,true);document.addEventListener('transitioncancel',queue,true);update();
    return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',queue);document.removeEventListener('transitionend',queue,true);document.removeEventListener('transitioncancel',queue,true);style.remove();if(original===null)document.documentElement.removeAttribute('data-suedama-sidebar');else document.documentElement.setAttribute('data-suedama-sidebar',original);};
  },[]);
  useLayoutEffect(()=>{const old=document.documentElement.getAttribute('data-suedama-canvas');document.documentElement.dataset.suedamaCanvas=open?'open':'closed';return()=>{if(old===null)document.documentElement.removeAttribute('data-suedama-canvas');else document.documentElement.setAttribute('data-suedama-canvas',old);};},[open]);return chrome;
}
