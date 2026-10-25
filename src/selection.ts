/** A visible text projection with block/newline boundaries and exact DOM offsets. */
export function projectText(article:HTMLElement){
  let sourceText='';
  const offsets=new Map<Node,number[]>();
  const line=(count=1)=>{if(sourceText){const trailing=sourceText.match(/\n*$/)?.[0].length??0;if(trailing<count)sourceText+='\n'.repeat(count-trailing);}};
  const visit=(node:Node)=>{
    if(node.nodeType===3){const text=node.textContent??'';offsets.set(node,Array.from({length:text.length+1},(_,i)=>sourceText.length+i));sourceText+=text;return;}
    const el=node as Element;if(el.tagName==='ANNOTATION'||el.tagName==='annotation'||el.getAttribute?.('aria-hidden')==='true')return;
    const block=/^(P|DIV|PRE|LI|BLOCKQUOTE|H[1-6]|TR|UL|OL)$/.test(el.tagName??'');
    const gap=/^(P|PRE|BLOCKQUOTE|H[1-6]|UL|OL)$/.test(el.tagName??'')?2:1;
    if(block)line(gap);
    if(el.tagName==='BR')sourceText+='\n';
    const bounds=[sourceText.length];for(const child of node.childNodes){visit(child);bounds.push(sourceText.length);}
    offsets.set(node,bounds);if(block)line(gap);
  };
  visit(article);
  return {sourceText,offsets};
}
export function projectSelection(article:HTMLElement,range:Range){
  const {sourceText,offsets}=projectText(article);
  const start=offsets.get(range.startContainer)?.[range.startOffset];
  const end=offsets.get(range.endContainer)?.[range.endOffset];
  if(start===undefined || end===undefined || start>=end)return;
  return {sourceText,start,text:sourceText.slice(start,end)};
}
export function referenceRange(article:HTMLElement,quote:{start:number;end:number;text:string;sourceText:string}){
  const range=article.ownerDocument.createRange();
  if(quote.start===0 && quote.end===quote.sourceText.length){range.selectNodeContents(article);return range;}
  const {sourceText,offsets}=projectText(article);
  if(sourceText.slice(quote.start,quote.end)!==quote.text)return;
  let first:{node:Node;offset:number}|undefined,last:typeof first;
  for(const [node,indices]of offsets){
    if(node.nodeType!==3)continue;
    const begin=indices[0]!,end=indices.at(-1)!;
    if(end<=quote.start || begin>=quote.end)continue;
    first??={node,offset:Math.max(0,quote.start-begin)};last={node,offset:Math.min(end-begin,quote.end-begin)};
  }
  if(!first||!last)return;range.setStart(first.node,first.offset);range.setEnd(last.node,last.offset);return range;
}
