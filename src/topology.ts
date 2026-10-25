import {historyLine, type Card, type Point, type Library} from './model';

/** The same native turn is shared by every observed version that inherits it. */
export function ancestry(cards:Record<string,Card>, ids:Iterable<string>):Set<string> {
  const result=new Set<string>();
  for(let id of ids) while(id && !result.has(id)) {result.add(id);id=cards[id]?.parentId ?? '';}
  return result;
}
/** An archive flag is a subtree mask. Nested masks survive restoration of an ancestor. */
export function isArchived(card:Card,cards:Record<string,Card>):boolean {
  return [...ancestry(cards,[card.id])].some(id=>cards[id]?.archived);
}
/** Resolve a whole immutable card map in one pass, without walking every ancestor per card. */
export function archivedCards(cards:Record<string,Card>):Set<string>{
  const states=new Map<string,boolean>();
  for(const card of Object.values(cards)){
    if(states.has(card.id))continue;
    const path:Card[]=[],seen=new Set<string>();let cursor:Card|undefined=card;
    while(cursor&&!states.has(cursor.id)&&!seen.has(cursor.id)){seen.add(cursor.id);path.push(cursor);cursor=cursor.parentId?cards[cursor.parentId]:undefined;}
    let archived=cursor?states.get(cursor.id)??false:false;
    for(let i=path.length-1;i>=0;i--){const item=path[i]!;archived=archived||item.archived;states.set(item.id,archived);}
  }
  return new Set([...states].filter(([,archived])=>archived).map(([id])=>id));
}
export function recolorLine(cards:Record<string,Card>,id:string,color:number):Record<string,Card> {
  const card=cards[id];if(!card)return cards;
  const line=historyLine(card,cards);
  return Object.fromEntries(Object.values(cards).map(c=>[c.id,historyLine(c,cards)===line?{...c,historyColor:color}:c]));
}
/** A topology map, never an overview of the user's manual card positions. */
export function previewLayout(cards:Card[]):Map<string,Point> {
  const byId=Object.fromEntries(cards.map(c=>[c.id,c]));
  const children=new Map<string,Card[]>();
  for(const c of cards)if(c.parentId && byId[c.parentId]){const siblings=children.get(c.parentId);if(siblings)siblings.push(c);else children.set(c.parentId,[c]);}
  const positions=new Map<string,Point>();let lane=0;
  for(const root of cards.filter(c=>!c.parentId || !byId[c.parentId]).sort((a,b)=>a.id.localeCompare(b.id))){
    const stack:{card:Card;depth:number;preferred?:number}[]=[{card:root,depth:0,preferred:lane}];
    while(stack.length){const {card,depth,preferred}=stack.pop()!;if(positions.has(card.id))continue;const x=preferred??lane;lane=Math.max(lane,x+1);positions.set(card.id,{x:x*268,y:depth*168});
      const list=children.get(card.id)??[];list.sort((a,b)=>Number(historyLine(b,byId)===historyLine(card,byId))-Number(historyLine(a,byId)===historyLine(card,byId))||a.id.localeCompare(b.id));
      for(let i=list.length-1;i>=0;i--)stack.push({card:list[i]!,depth:depth+1,preferred:i?undefined:x});
    }
  }
  return positions;
}
export const crossedDragThreshold=(start:Point,next:Point)=>Math.hypot(next.x-start.x,next.y-start.y)>4;

/** The native reader opens one real descendant branch; its route retains every ancestor to root. */
export function archiveLeaf(library:Library,id:string):Card|undefined{
  const card=library.cards[id];if(!card)return;
  const all=Object.values(library.cards).filter(c=>c.conversationId===card.conversationId),children=new Map<string,Card[]>();for(const item of all)if(item.parentId){const siblings=children.get(item.parentId);if(siblings)siblings.push(item);else children.set(item.parentId,[item]);}
  const ids=new Set<string>(),stack=[card];while(stack.length){const next=stack.pop()!;if(ids.has(next.id))continue;ids.add(next.id);stack.push(...children.get(next.id)??[]);}const descendants=all.filter(c=>ids.has(c.id));
  const active=library.conversations[card.conversationId]?.activeIds.at(-1);return descendants.find(c=>c.id===active)??descendants.sort((a,b)=>b.route.length-a.route.length||b.updatedAt-a.updatedAt)[0]??card;
}
