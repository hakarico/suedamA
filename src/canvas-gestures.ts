import type {Point} from './model';
import {crossedDragThreshold} from './topology';
type Pointer={button:number;pointerId:number;clientX:number;clientY:number};
type Session={kind:'card'|'lasso';pointer:number;start:Point;positions:Map<string,Point>;add:string[];moved:boolean;latest:Point};
/** Gesture arbitration is shared by the UI and DOM regression tests. Blank right drags stay with Flow. */
export class CanvasGestures {
  session?:Session;
  start(e:Pointer,nodeId:string|undefined,pane:boolean,selected:string[],positions:Map<string,Point>,shift=false):boolean {
    const point={x:e.clientX,y:e.clientY};
    if(e.button===2 && nodeId){
      const ids=selected.includes(nodeId)?selected:[nodeId];
      this.session={kind:'card',pointer:e.pointerId,start:point,latest:point,positions:new Map(ids.map(id=>[id,positions.get(id)??{x:0,y:0}])),add:[],moved:false};
      return true;
    }
    if(e.button===0 && pane){this.session={kind:'lasso',pointer:e.pointerId,start:point,latest:point,positions:new Map(),add:shift?[...selected]:[],moved:false};return true;}
    return false;
  }
  move(e:Pointer,zoom:number){
    const g=this.session;if(!g || g.pointer!==e.pointerId)return;
    g.latest={x:e.clientX,y:e.clientY};g.moved ||=crossedDragThreshold(g.start,g.latest);
    if(!g.moved)return;
    return g.kind==='card'?new Map([...g.positions].map(([id,p])=>[id,{x:p.x+(g.latest.x-g.start.x)/zoom,y:p.y+(g.latest.y-g.start.y)/zoom}])):undefined;
  }
  finish(cancel=false){
    const g=this.session;this.session=undefined;
    return cancel?undefined:g;
  }
}

/** Preview and commit use the same intersection rule while the pointer is held. */
export function lassoSelection(cards:{id:string;position:Point;width:number;height:number}[],a:Point,b:Point,add:string[]=[]){return [...new Set([...add,...cards.filter(c=>c.position.x+c.width>=Math.min(a.x,b.x)&&c.position.x<=Math.max(a.x,b.x)&&c.position.y+c.height>=Math.min(a.y,b.y)&&c.position.y<=Math.max(a.y,b.y)).map(c=>c.id)])];}
