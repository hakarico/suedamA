import type {Card} from '../src/model';

/** A deep topology with short payloads, isolating graph work from DOM and route serialization. */
export function cardChain(count:number):Record<string,Card>{
  const cards:Record<string,Card>={};
  for(let i=0;i<count;i++){
    const id=`card-${i}`;
    cards[id]={id,conversationId:'performance',parentId:i?`card-${i-1}`:null,lineId:'line',route:[{userKey:String(i*2+1),answerKey:String(i*2+2),userVersion:1,answerVersion:1}],question:`Question ${i+1}`,answer:'A short answer.',position:{x:0,y:i*400},width:500,height:300,color:0,historyColor:0,bookmarked:false,archived:i===Math.floor(count/2),updatedAt:i,annotations:[]};
  }
  return cards;
}
