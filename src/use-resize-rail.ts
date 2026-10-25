import {useLayoutEffect,type RefObject} from 'react';
/** Reused from BoardCanvas TurnNode: the scroll rail wins over transparent resize controls. */
export function useResizeRail(host:RefObject<HTMLDivElement>,active:boolean,width:number,height:number){
  useLayoutEffect(()=>{
    const owner=host.current;if(!owner || !active)return;
    const clip=()=>{
      const scroll=owner.querySelector<HTMLElement>('[data-card-scroll]'),rail=scroll?.getBoundingClientRect();
      const overflowing=!!scroll && scroll.scrollHeight>scroll.clientHeight;
      const scale=scroll?.offsetWidth&&rail?rail.width/scroll.offsetWidth:1;
      const lane=scroll?Math.max(14,scroll.offsetWidth-scroll.clientWidth)*scale:0;
      const paths=[...owner.querySelectorAll<HTMLElement>('.react-flow__resize-control')].map(control=>{
        if(!rail || !overflowing)return {control,path:''};
        const bounds=control.getBoundingClientRect(),w=control.offsetWidth,h=control.offsetHeight;
        if(!bounds.width||!bounds.height||!w||!h)return {control,path:''};
        const l=Math.max(0,(rail.right-lane-bounds.left)*w/bounds.width),r=Math.min(w,(rail.right-bounds.left)*w/bounds.width),t=Math.max(0,(rail.top-bounds.top)*h/bounds.height),b=Math.min(h,(rail.bottom-bounds.top)*h/bounds.height);
        return {control,path:l>=r||t>=b?'':`polygon(evenodd,0px 0px,${w}px 0px,${w}px ${h}px,0px ${h}px,0px 0px,${l}px ${t}px,${r}px ${t}px,${r}px ${b}px,${l}px ${b}px,${l}px ${t}px,0px 0px)`};
      });
      for(const {control,path}of paths)if(control.style.clipPath!==path)control.style.clipPath=path;
    };
    const observer=new ResizeObserver(clip);observer.observe(owner);const scroll=owner.querySelector('[data-card-scroll]');if(scroll)observer.observe(scroll);
    const invalidate=()=>{observer.unobserve(owner);observer.observe(owner);};
    const mutation=new MutationObserver(invalidate);mutation.observe(owner,{childList:true,characterData:true,subtree:true});
    window.addEventListener('resize',invalidate);clip();
    return()=>{observer.disconnect();mutation.disconnect();window.removeEventListener('resize',invalidate);};
  },[host,active,width,height]);
}
