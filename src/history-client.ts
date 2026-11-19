import {HISTORY_CHANNEL,applyHistoryPacket,readHistoryCache,validConversationId,type HistoryGraph,type HistoryPacket} from './history-data';
export class HistoryClient {
  private graphs=new Map<string,HistoryGraph>();private listeners=new Set<(graph:HistoryGraph)=>void>();
  private allowed=new Set<string>();
  private pending=new Map<string,(packet?:HistoryPacket)=>void>();private requests=new Map<string,Promise<HistoryGraph|undefined>>();
  private ready=false;private disposed=false;
  private retain(graph:HistoryGraph){
    this.graphs.delete(graph.conversationId);this.graphs.set(graph.conversationId,graph);
    const bytes=(g:HistoryGraph)=>g.messages.reduce((n,m)=>n+2*(m.question.length+m.answer.length+m.reasoning.length),0);
    let total=[...this.graphs.values()].reduce((n,g)=>n+bytes(g),0);
    while(this.graphs.size>1&&(this.graphs.size>6||total>40_000_000)){const oldest=this.graphs.entries().next().value!;this.graphs.delete(oldest[0]);total-=bytes(oldest[1]);}
  }
  constructor(private win:Window,private cacheReader=readHistoryCache){win.addEventListener('message',this.message);this.post({kind:'hello'});}
  private post(data:Record<string,unknown>){if(!this.disposed)this.win.postMessage({channel:HISTORY_CHANNEL,from:'extension',...data},this.win.location.origin);}
  private message=(event:MessageEvent)=>{
    const data=event.data;if(event.source!==this.win||event.origin!==this.win.location.origin||!data||data.channel!==HISTORY_CHANNEL||data.from!=='page')return;
    if(data.kind==='ready')this.ready=true;
    if(data.kind==='packet')this.accept(data.packet);
    if(data.kind==='result'&&typeof data.id==='string')this.pending.get(data.id)?.(data.packet);
  };
  private accept(packet:HistoryPacket):HistoryGraph|undefined{
    try{
      if(!packet||!validConversationId(packet.conversationId)||typeof packet.startedAt!=='number'||!Number.isFinite(packet.startedAt))return;
      const current=this.win.location.pathname.match(/\/chat\/s\/([\w-]+)/)?.[1];
      if(packet.conversationId!==current&&!this.allowed.has(packet.conversationId))return;
      this.allowed.add(packet.conversationId);
      const before=this.graphs.get(packet.conversationId);if(before?.fresh&&before.observedAt>packet.startedAt)return;
      const graph=applyHistoryPacket(packet,before);this.retain(graph);this.listeners.forEach(fn=>fn(graph));return graph;
    }catch{return;}
  }
  peek(id:string){return this.graphs.get(id);}
  invalidate(id:string){const graph=this.graphs.get(id);if(graph?.fresh)this.graphs.set(id,{...graph,fresh:false});}
  subscribe(fn:(graph:HistoryGraph)=>void){this.listeners.add(fn);for(const graph of this.graphs.values())fn(graph);return()=>{this.listeners.delete(fn);};}
  async get(id:string,force=false,signal?:AbortSignal):Promise<HistoryGraph|undefined>{
    if(this.disposed||!validConversationId(id)||signal?.aborted)return;
    this.allowed.add(id);
    // Jobs with their own cancellation cannot share another caller's lifetime.
    if(!force&&!signal&&this.requests.has(id))return this.requests.get(id);
    const work=this.load(id,force,signal);if(!signal)this.requests.set(id,work);
    try{return await work;}finally{if(this.requests.get(id)===work)this.requests.delete(id);}
  }
  private async load(id:string,force:boolean,signal?:AbortSignal){
    let before=this.graphs.get(id);
    if(!before){const cached=await this.cacheReader(id,this.win.indexedDB,signal);if(this.disposed||signal?.aborted)return;if(cached&&!this.graphs.has(id)){this.retain(cached);this.listeners.forEach(fn=>fn(cached));}before=this.graphs.get(id);}
    if(!force&&before?.fresh&&Date.now()-before.observedAt<15000)return before;
    this.post({kind:'hello'});
    // The page bridge answers unavailable immediately if native auth has not been observed.
    const requestId=crypto.randomUUID(),packet=await new Promise<HistoryPacket|undefined>(resolve=>{
      let done=false;const finish=(packet?:HistoryPacket)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);this.pending.delete(requestId);resolve(packet);};
      const abort=()=>{this.post({kind:'cancel',id:requestId});finish();};const timer=setTimeout(abort,this.ready?8500:300);
      if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});this.pending.set(requestId,finish);
      this.post({kind:'get',id:requestId,conversationId:id,version:force?null:before?.version??null,resetAt:force?null:before?.resetAt??null});
    });
    if(this.disposed||signal?.aborted)return;
    return packet?this.accept(packet)??(force?undefined:before):force?undefined:before;
  }
  dispose(){this.disposed=true;this.win.removeEventListener('message',this.message);for(const [id,finish]of this.pending){this.win.postMessage({channel:HISTORY_CHANNEL,from:'extension',kind:'cancel',id},this.win.location.origin);finish();}this.listeners.clear();this.graphs.clear();}
}
