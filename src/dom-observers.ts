const elementOf=(node:Node)=>node.nodeType===1?node as Element:node.parentElement;
const owned=(node:Node)=>!!elementOf(node)?.closest('[data-suedama],#suedama-deepseek-root');
/** Extension portals must not trigger another native-page scan of their own render. */
export function isOwnedMutation(record:MutationRecord){
  if(owned(record.target))return true;
  const nodes=[...record.addedNodes,...record.removedNodes];
  return record.type==='childList'&&nodes.length>0&&nodes.every(owned);
}
export function isSidebarMutation(record:MutationRecord){
  if(isOwnedMutation(record))return false;
  const selector='.b8812f16,.ds-dropdown-menu';
  if(elementOf(record.target)?.closest(selector))return true;
  return [...record.addedNodes,...record.removedNodes].some(node=>{const el=elementOf(node);return el?.matches(selector)||!!el?.querySelector(selector);});
}
export function isMessageMutation(record:MutationRecord){
  return !isOwnedMutation(record)&&!elementOf(record.target)?.closest('.b8812f16,.ds-dropdown-menu');
}
/** Plain token/paragraph updates cannot change sidebar geometry or open an image/modal. */
export function isChromeMutation(record:MutationRecord){
  if(isOwnedMutation(record))return false;
  const target=elementOf(record.target);
  if(!target?.closest('.ds-message,[data-virtual-list-item-key]'))return true;
  const affectsChrome=(node:Node)=>{const el=node.nodeType===1?node as Element:undefined;return !!el&&(el.matches('img,[role=dialog],.ds-modal')||!!el.querySelector('img,[role=dialog],.ds-modal'));};
  return record.type==='attributes'?affectsChrome(record.target):[...record.addedNodes,...record.removedNodes].some(affectsChrome);
}
