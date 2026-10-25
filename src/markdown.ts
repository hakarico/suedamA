/** Convert visible semantic DOM, preserving list ownership and code/math boundaries. */
export function readMarkdown(root:Element):string{
  const trim=(s:string)=>s.replace(/^\n+|\n+$/g,'');
  function walk(node:Node):string{
    if(node.nodeType===3)return (node.textContent??'').replace(/\u00a0/g,' ');
    if(!(node instanceof Element))return '';
    const tag=node.tagName.toLowerCase();
    if(['button','svg','script','style'].includes(tag)||node.getAttribute('role')==='button'||node.getAttribute('aria-hidden')==='true')return '';
    if(node.classList.contains('katex-display')){const tex=node.querySelector('annotation[encoding="application/x-tex"]');if(tex)return '\n\n$$\n'+tex.textContent+'\n$$\n\n';}
    if(node.classList.contains('katex')){const tex=node.querySelector('annotation[encoding="application/x-tex"]');if(tex)return '$'+tex.textContent+'$';}
    if(tag==='pre'){
      const code=node.querySelector('code'),text=code?.textContent??node.textContent??'',language=code?.className.match(/language-([\w+-]+)/)?.[1]??'';
      const fence='`'.repeat(Math.max(3,...[...text.matchAll(/`+/g)].map(m=>m[0].length+1)));
      return '\n\n'+fence+language+'\n'+text.replace(/\n$/,'')+'\n'+fence+'\n\n';
    }
    if(tag==='ol'||tag==='ul'){
      let index=Number(node.getAttribute('start')??1);
      const items=[...node.children].filter(c=>c.tagName==='LI').map(li=>{
        const marker=tag==='ol'?(Number(li.getAttribute('value')??index++))+'. ':'- ';
        const content=trim([...li.childNodes].map(n=>walk(n)).join('')).trim();
        return marker+content.replace(/\n/g,'\n'+' '.repeat(marker.length));
      });return '\n\n'+items.join('\n\n')+'\n\n';
    }
    if(tag==='table'){
      const rows=[...node.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>trim(walk(c)).replace(/\n+/g,'<br>').replace(/\|/g,'\\|')));
      if(!rows.length)return '';const width=Math.max(...rows.map(r=>r.length));
      const row=(r:string[])=>'| '+Array.from({length:width},(_,i)=>r[i]??'').join(' | ')+' |';
      return '\n\n'+[row(rows[0]!),row(Array(width).fill('---')),...rows.slice(1).map(row)].join('\n')+'\n\n';
    }
    const content=[...node.childNodes].map(walk).join('');
    if(tag==='br')return '\n';if(tag==='hr')return '\n\n---\n\n';
    if(tag==='code')return '`'+content+'`';
    if(tag==='strong'||tag==='b')return '**'+content+'**';if(tag==='em'||tag==='i')return '*'+content+'*';if(tag==='del'||tag==='s')return '~~'+content+'~~';
    if(/^h[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+content+'\n\n';
    if(tag==='blockquote')return '\n\n'+trim(content).split('\n').map(l=>'> '+l).join('\n')+'\n\n';
    if(tag==='a'){const href=node.getAttribute('href')??'';return /^https?:\/\//i.test(href)?'['+content+']('+href+')':content;}
    if(tag==='img')return node.getAttribute('alt')??'';
    if(['p','div','section'].includes(tag))return '\n\n'+trim(content)+'\n\n';
    return content;
  }
  return trim(walk(root).replace(/\r\n/g,'\n'));
}
