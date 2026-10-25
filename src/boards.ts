import {t,translate} from './i18n';
import type {Library,CanvasBoard,Card,Appearance} from './model';
export const boardForConversation=(library:Library,cid:string)=>Object.values(library.boards??{}).find(b=>b.conversationIds.includes(cid));
export function nextBoardTitle(library:Library){let i=1;const used=new Set(Object.values(library.boards??{}).filter(b=>b.kind==='group').map(b=>b.title));while(used.has(translate('白板{0}','zh',{'0':i}))||used.has(translate('白板{0}','en',{'0':i})))i++;return t('白板{0}',{'0':i});}
export function migrateBoards(library:Library):Library{
  const boards={...library.boards};let n=1;
  for(const [id,b]of Object.entries(boards))if(!b.kind)boards[id]={...b,kind:b.conversationIds.length>1||b.title==='新白板'?'group':'standalone',...(b.conversationIds.length>1||b.title==='新白板'?{title:'白板'+n++}:{})};
  for(const c of Object.values(library.conversations))if(!c.deleted&&!Object.values(boards).some(b=>b.conversationIds.includes(c.id))){const id='session:'+c.id;boards[id]={id,title:c.title,conversationIds:[c.id],kind:'standalone'};}
  if(!Object.keys(boards).length)boards['canvas:initial']={id:'canvas:initial',title:t('新对话'),conversationIds:[],kind:'standalone'};
  return {...library,defaultAppearance:library.defaultAppearance??Object.values(boards).find(b=>b.appearance)?.appearance,boards,activeBoardId:library.activeBoardId&&boards[library.activeBoardId]?library.activeBoardId:Object.keys(boards)[0]};
}
export function attachConversation(library:Library,boardId:string,cid:string,title:string):Library{
  const board=library.boards?.[boardId];if(!board||board.conversationIds.includes(cid))return library;
  const boards={...library.boards};
  for(const b of Object.values(boards))if(b.conversationIds.includes(cid))boards[b.id]={...b,conversationIds:b.conversationIds.filter(id=>id!==cid)};
  boards[boardId]={...board,title:board.kind==='standalone'?title:board.title,conversationIds:[...board.conversationIds,cid]};
  return {...library,boards};
}
export const belongsToBoard=(card:Card,board:CanvasBoard|undefined)=>!!board?.conversationIds.includes(card.conversationId);

export const boardAppearance=(library:Library,id?:string):Appearance=>({brightness:100,blur:0,dots:true,opacity:100,...library.defaultAppearance,...library.boards?.[id??library.activeBoardId??'']?.appearance});
