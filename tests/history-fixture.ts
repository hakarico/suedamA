import {applyHistoryPacket} from '../src/history-data';
/** Build a protocol-shaped graph from the existing native UI fixture. */
export function fixtureHistory(id:string,versions:{u:string;a:string;q:string;aText:string}[][],branch=1){
  const messages=new Map<string,unknown>();
  for(const route of versions){let parent:number|null=null;for(const turn of route){messages.set(turn.u,{message_id:Number(turn.u),parent_id:parent,role:'USER',status:'FINISHED',fragments:[{type:'REQUEST',content:turn.q}]});messages.set(turn.a,{message_id:Number(turn.a),parent_id:Number(turn.u),role:'ASSISTANT',status:'FINISHED',fragments:[{type:'RESPONSE',content:turn.aText}]});parent=Number(turn.a);}}
  return applyHistoryPacket({conversationId:id,version:null,resetAt:null,startedAt:Date.now()+1,data:{code:0,data:{biz_code:0,biz_data:{chat_session:{id,title:'结构化历史测试',version:1,updated_at:1,current_message_id:Number(versions[branch-1]?.at(-1)?.a)||null},cache_control:'REPLACE',cache_reset_at:1,chat_messages:[...messages.values()]}}}});
}
