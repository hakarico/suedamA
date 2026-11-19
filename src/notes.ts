import {t} from './i18n';
import {displayQuestion,roleLabel,type Card,type Library} from './model';

/** Export only selected turns, ordered by their actual ancestry rather than click order. */
export function selectedNotes(library:Library,ids:Iterable<string>):string{
  const cards=[...new Set(ids)].map(id=>library.cards[id]).filter((card):card is Card=>!!card);
  const ranks=new Map(Object.keys(library.cards).map((id,index)=>[id,index]));
  const paths=new Map<string,string[]>();
  for(const card of cards){const path:string[]=[],seen=new Set<string>();let current:Card|undefined=card;while(current&&!seen.has(current.id)){seen.add(current.id);path.push(current.id);current=library.cards[current.parentId??''];}paths.set(card.id,path.reverse());}
  const conversations=new Map<string,number>();for(const card of cards)if(!conversations.has(card.conversationId))conversations.set(card.conversationId,conversations.size);
  cards.sort((a,b)=>{
    if(a.conversationId!==b.conversationId)return conversations.get(a.conversationId)!-conversations.get(b.conversationId)!;
    const left=paths.get(a.id)!,right=paths.get(b.id)!;let i=0;while(i<left.length&&i<right.length&&left[i]===right[i])i++;
    return i===left.length||i===right.length?left.length-right.length:ranks.get(left[i]!)!-ranks.get(right[i]!)!;
  });
  return cards.map((card,index)=>{
    const previous=cards[index-1];let boundary='';
    if(previous&&card.parentId!==previous.id){
      const path=paths.get(card.id)!,ancestor=path.indexOf(previous.id);
      const note=card.conversationId!==previous.conversationId?t('以下来自另一段独立会话。'):ancestor>=0?t('以下继续同一历史路径，中间略过 {0} 轮未选对话。',{'0':path.length-ancestor-2}):t('以下切换至同一会话的另一条分支。');
      boundary=`<!-- // ${note} -->\n\n`;
    }
    const references=card.annotations.length?'\n\n### '+t('引用')+'\n\n'+card.annotations.map(quote=>`#### ${t('注释')} ${quote.number??''} · ${t(roleLabel(quote.role))}\n\n${quote.text.split('\n').map(line=>'> '+line).join('\n')}`).join('\n\n'):'';
    return boundary+`## ${t('用户提问')}\n\n${displayQuestion(card)}\n\n## ${t('回答')}\n\n${card.answer}`+references;
  }).join('\n\n')+(cards.length?'\n':'');
}
