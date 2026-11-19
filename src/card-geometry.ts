import type {Point,Viewport} from './model';

/** Navigation preserves scale; only the explicit focus action may fit a card. */
export function cardViewport(bounds:{width:number;height:number},position:Point,size:Point,zoom:number,fit=false,center=false):Viewport{
  const scale=fit?Math.max(.25,Math.min(1.8,(bounds.width-160)/size.x,(bounds.height-240)/size.y)):zoom;
  return {x:bounds.width/2-(position.x+size.x/2)*scale,y:(center?bounds.height/2:Math.max(120,(bounds.height-140)/2))-(position.y+size.y/2)*scale,zoom:scale};
}

export function scrollbarLane(scroll:{offsetWidth:number;clientWidth:number;scrollHeight:number;clientHeight:number;getBoundingClientRect:()=>{right:number;width:number}},clientX:number){
  const rect=scroll.getBoundingClientRect(),scale=scroll.offsetWidth?rect.width/scroll.offsetWidth:1;
  return scroll.scrollHeight>scroll.clientHeight && clientX>=rect.right-Math.max(14,scroll.offsetWidth-scroll.clientWidth)*scale && clientX<=rect.right;
}
