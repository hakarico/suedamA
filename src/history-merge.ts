import {defaultCardSize,historyLine,turnId,turnSignature,reconcileCardAliases,HISTORY_COLORS,type Library,type Card,type RouteStep,type NativeTurn} from './model';
import {parsePrompt} from './prompt';
import {validateGraph,type HistoryGraph,type HistoryMessage} from './history-data';

export type HistoryTurn={turn:NativeTurn;parentId:string|null;route:RouteStep[];files:HistoryMessage['files']};
/** Each message pair is visited once, instead of replaying shared prefixes per leaf. */
export function historyTurns(graph:HistoryGraph):HistoryTurn[]{
  validateGraph(graph);const children=new Map<string|null,HistoryMessage[]>();
  for(const m of graph.messages){const list=children.get(m.parentId)??[];list.push(m);children.set(m.parentId,list);}
  for(const list of children.values())list.sort((a,b)=>Number(a.id)-Number(b.id));
  const result:HistoryTurn[]=[],queue:{user:HistoryMessage;parentId:string|null;route:RouteStep[];version:number}[]=[];
  (children.get(null)??[]).forEach((user,i)=>queue.push({user,parentId:null,route:[],version:i+1}));
  for(let i=0;i<queue.length;i++){
    const {user,parentId,route,version}=queue[i]!,answers=children.get(user.id)??[];
    for(const [index,answer]of (answers.length?answers:[undefined]).entries()){
      const turn:NativeTurn={userKey:user.id,answerKey:answer?.id,userVersion:version,answerVersion:index+1,question:user.question,answer:answer?.answer??'',...(answer?.reasoning?{reasoning:answer.reasoning,reasoningLabel:'思考'}:{})};
      const step:RouteStep={userKey:turn.userKey,answerKey:turn.answerKey,userVersion:version,answerVersion:index+1,signature:turnSignature(turn.question,turn.answer),...(turn.answerKey?{identity:'server' as const}:{}),...(!route.length?{root:true}:{})};
      const path=[...route,step];if(path.length>=10000)throw new Error('历史路径过长。');
      result.push({turn,parentId,route:path,files:user.files});
      if(answer)(children.get(answer.id)??[]).forEach((next,j)=>queue.push({user:next,parentId:turnId(graph.conversationId,turn),route:path,version:j+1}));
    }
  }
  return result;
}
class Placement {
  private cells=new Map<string,Card[]>();private right=new Map<string|null,number>();
  constructor(cards:Card[]){for(const card of cards)this.add(card);}
  private keys(x:number,y:number,w:number,h:number){const result:string[]=[];for(let a=Math.floor(x/600);a<=Math.floor((x+w+60)/600);a++)for(let b=Math.floor(y/600);b<=Math.floor((y+h+60)/600);b++)result.push(`${a},${b}`);return result;}
  add(card:Card){for(const key of this.keys(card.position.x,card.position.y,card.width,card.height)){const rows=this.cells.get(key)??[];rows.push(card);this.cells.set(key,rows);}this.right.set(card.parentId,Math.max(this.right.get(card.parentId)??-Infinity,card.position.x+card.width));}
  position(parent:Card|undefined,parentId:string|null,size:{width:number;height:number}){
    let x=Math.max(parent?.position.x??0,(this.right.get(parentId)??-92)+92);const y=parent?parent.position.y+parent.height+92:60;
    for(;;){const seen=new Set<Card>();let end=x;for(const key of this.keys(x,y,size.width,size.height))for(const c of this.cells.get(key)??[]){if(seen.has(c))continue;seen.add(c);if(x<c.position.x+c.width+60&&x+size.width+60>c.position.x&&y<c.position.y+c.height+60&&y+size.height+60>c.position.y)end=Math.max(end,c.position.x+c.width+92);}if(end===x)return{x,y};x=end;}
  }
}
export function mergeHistoryGraph(library:Library,graph:HistoryGraph):Library{
  const turns=historyTurns(graph),cards={...library.cards},size=defaultCardSize(),existing=Object.values(cards).filter(c=>c.conversationId===graph.conversationId),placement=new Placement(existing);
  const pending=new Map<string,Card[]>(),byAnswer=new Map<string,Card>();
  for(const card of existing){const step=card.route.at(-1)!;if(step.answerKey&&!step.answerKey.startsWith('-'))byAnswer.set(step.answerKey,card);else{const key=JSON.stringify([card.parentId,card.question,step.userVersion,step.answerVersion]);pending.set(key,[...pending.get(key)??[],card]);}}
  const promotions=new Map<string,string>();let changed=false;
  for(const {turn,parentId,route,files}of turns){
    const id=turnId(graph.conversationId,turn),pendingId=turnId(graph.conversationId,{...turn,answerKey:undefined});
    const candidates=(pending.get(JSON.stringify([parentId,turn.question,turn.userVersion,turn.answerVersion]))??[]).filter(c=>!promotions.has(c.id)&&c.updatedAt<=graph.observedAt);
    const before=cards[id]??(turn.answerKey?byAnswer.get(turn.answerKey):undefined)??cards[pendingId]??(candidates.length===1?candidates[0]:undefined);
    // An old website cache may add unseen branches, but cannot roll back newer local text.
    const preserve=before&&!graph.fresh&&before.updatedAt>graph.observedAt;
    const answer=preserve?before.answer:turn.answer,question=preserve?before.question:turn.question;
    const nextRoute=preserve?[...route.slice(0,-1),{...route.at(-1)!,signature:turnSignature(question,answer)}]:route;
    const parent=parentId?cards[parentId]:undefined;
    const lineId=before?.lineId??(parent&&turn.userVersion===1&&turn.answerVersion===1?historyLine(parent,cards):id);
    const color=before?.historyColor??(parent?(parent.historyColor+(lineId!==historyLine(parent,cards)?Math.max(turn.userVersion,turn.answerVersion)-1:0))%HISTORY_COLORS.length:(turn.userVersion-1)%HISTORY_COLORS.length);
    const card:Card={...before,id,conversationId:graph.conversationId,parentId,route:nextRoute,question,answer,reasoning:preserve?before.reasoning:turn.reasoning,reasoningLabel:preserve?before.reasoningLabel:before?.reasoningLabel??turn.reasoningLabel,position:before?.position??placement.position(parent,parentId,size),width:before?.width??size.width,height:before?.height??size.height,color:before?.color??0,historyColor:color,lineId,bookmarked:before?.bookmarked??false,archived:before?.archived??false,annotations:before?.annotations??[],updatedAt:before&&before.question===question&&before.answer===answer?before.updatedAt:graph.observedAt,prompt:parsePrompt(question)?.userMessage??(before?.question===question?before.prompt:undefined)};
    if(!before?.attachments&&files.length)card.attachments=files;
    if(!before||JSON.stringify(card)!==JSON.stringify(before)){cards[id]=card;changed=true;}else cards[id]=before;
    if(!before)placement.add(card);
    if(before&&before.id!==id){delete cards[before.id];promotions.set(before.id,id);changed=true;}
  }
  const old=library.conversations[graph.conversationId];
  // Importing remote branches does not select a different native path or record a visit as activity.
  const current=turns.find(t=>t.turn.answerKey===graph.currentMessageId||!t.turn.answerKey&&t.turn.userKey===graph.currentMessageId);
  const activeIds=old?.activeIds.length?old.activeIds:current?.route.map(step=>turnId(graph.conversationId,step))??[];
  const conversation=old?{...old,title:graph.title,activeIds,updatedAt:Math.max(old.updatedAt,graph.updatedAt)}:{id:graph.conversationId,title:graph.title,activeIds,updatedAt:graph.updatedAt};
  if(!changed&&JSON.stringify(old)===JSON.stringify(conversation))return library;
  return reconcileCardAliases({...library,cards,cardAliases:{...library.cardAliases,...Object.fromEntries(promotions)},conversations:{...library.conversations,[graph.conversationId]:conversation},revision:library.revision+1});
}
