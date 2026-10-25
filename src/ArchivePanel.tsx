import {t,useLocale} from './i18n';
import {useEffect,useState} from 'react';
import {displayQuestion,type Library,type Card} from './model';
import {Icon} from './Icon';
import {Message} from './Message';
import type {CanvasStore,Pending} from './store';

export function archiveGroups(library:Library){
  const groups=Object.values(library.boards??{}).map(board=>({board,cards:[] as Card[]})),owners=new Map(groups.flatMap(group=>group.board.conversationIds.map(id=>[id,group] as const)));
  for(const card of Object.values(library.cards))if(card.archived&&!library.conversations[card.conversationId]?.deleted)owners.get(card.conversationId)?.cards.push(card);
  return groups.filter(group=>group.cards.length).map(group=>({...group,cards:group.cards.sort((a,b)=>b.updatedAt-a.updatedAt)}));
}
export function ArchivePanel({store,library,initialCard}:{store:CanvasStore;library:Library;initialCard?:string}){useLocale();
  const [reading,setReading]=useState(initialCard);
  useEffect(()=>{if(initialCard&&library.cards[initialCard])void store.openArchiveReader(initialCard);},[initialCard,store]);
  useEffect(()=>{if(!reading)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();setReading(undefined);}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[reading]);
  const pending=store.get().pending;
  const groups:(ReturnType<typeof archiveGroups>[number]&{pending?:Pending})[]=archiveGroups(library);
  if(pending?.archived){const board=library.boards?.[pending.boardId];if(board){const group=groups.find(g=>g.board.id===board.id);if(group)group.pending=pending;else groups.push({board,cards:[],pending});}}
  if(pending?.archived&&reading===pending.id)return <div className="archive-reader"><div className="archive-reader-heading"><button onClick={()=>setReading(undefined)}><Icon name="undo"/>{t("返回归档")}</button><span>{t("只读查看")}</span></div><div className="archive-reader-content"><Message text={pending.question}/><p>{t(pending.error??pending.stage)}</p></div></div>;
  return <div className="archive-list" aria-label={t("归档内容")}>
    {!groups.length&&<p className="archive-empty">{t("没有归档内容")}</p>}
    {groups.map(({board,cards,pending})=><details className="archive-board" open key={board.id}><summary><strong>{board.title}</strong><span>{cards.length+(pending?1:0)}  {t("项归档")}</span></summary>
      <div className="archive-items">{cards.map(c=><div className="archive-item" key={c.id}><div className="archive-label"><span>{c.title||displayQuestion(c)||t("附件提问")}</span><small>{Date.now()-c.updatedAt<86400000?t('今天'):t('{0} 天',{'0':Math.max(1,Math.floor((Date.now()-c.updatedAt)/86400000))})}</small></div><div className="archive-actions"><button onClick={()=>void store.openArchiveReader(c.id)}>{t("只读查看")}</button><button onClick={()=>store.patchCard(c.id,{archived:false})}>{t("取消归档")}</button></div></div>)}{pending&&<div className="archive-item"><div className="archive-label"><span>{pending.question||t("未完成的提问")}</span><small>{t(pending.error?"发送未完成":pending.stage)}</small></div><div className="archive-actions"><button onClick={()=>setReading(pending.id)}>{t("只读查看")}</button><button onClick={()=>store.archivePending()}>{t("取消归档")}</button></div></div>}</div>
    </details>)}
  </div>;
}
