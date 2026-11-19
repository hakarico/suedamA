import {memo,useMemo} from 'react';
import {Marked} from 'marked';
import katex from 'katex';
import DOMPurify from 'dompurify';
function renderMath(text:string,displayMode=false){
  return katex.renderToString(text,{displayMode,output:'mathml',throwOnError:false,trust:false,
    // Chat formulas often contain CJK labels. Keep other compatibility diagnostics.
    strict:code=>code==='unicodeTextInMathMode'?'ignore':'warn'});
}
const parser=new Marked({gfm:true,breaks:true});
parser.use({extensions:[
  {name:'mathBlock',level:'block',start:src=>src.indexOf('$$'),tokenizer(src){const match=/^\$\$\s*\n?([\s\S]+?)\n?\$\$(?:\n|$)/.exec(src);if(match)return {type:'mathBlock',raw:match[0],text:match[1]!.trim()};},renderer(token){return renderMath(token.text,true);}},
  {name:'mathInline',level:'inline',start:src=>src.indexOf('$'),tokenizer(src){const match=/^\$(?!\$)((?:\\.|[^$\n])+?)\$(?!\$)/.exec(src);if(match)return {type:'mathInline',raw:match[0],text:match[1]};},renderer(token){return renderMath(token.text);}}
]});
export function renderMessage(text:string){return (typeof DOMPurify.sanitize==='function'?DOMPurify:DOMPurify(window)).sanitize(parser.parse(text,{async:false}) as string,{
  USE_PROFILES:{html:true,mathMl:true},FORBID_TAGS:['img','video','audio','iframe','input','form','button','style'],FORBID_ATTR:['style','id','name'],ADD_ATTR:['target','rel']
});}
export const Message=memo(function Message({text}:{text:string}){
  const html=useMemo(()=>renderMessage(text),[text]);
  return <div className="message" dangerouslySetInnerHTML={{__html:html}} onClick={e=>{const anchor=(e.target as Element).closest('a');if(anchor){anchor.target='_blank';anchor.rel='noopener noreferrer';}}}/>;
});
