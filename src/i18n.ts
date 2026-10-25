import {useSyncExternalStore} from 'react';
import english from './locales/en.json';

export type Locale='zh'|'en';
const catalog:Record<string,string>=english;
export const localeFromLanguage=(language:string):Locale=>!language||/^zh(?:-|$)/i.test(language)?'zh':'en';
export const currentLocale=():Locale=>localeFromLanguage(typeof document==='undefined'?'':document.documentElement.lang);
const listeners=new Set<()=>void>();let observer:MutationObserver|undefined,last:Locale;
function subscribe(listener:()=>void){
  listeners.add(listener);
  if(!observer&&typeof document!=='undefined'){
    last=currentLocale();observer=new MutationObserver(()=>{const next=currentLocale();if(next===last)return;last=next;for(const fn of listeners)fn();});
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  }
  return()=>{listeners.delete(listener);if(!listeners.size){observer?.disconnect();observer=undefined;}};
}
export const useLocale=()=>useSyncExternalStore(subscribe,currentLocale,()=> 'zh' as const);
const interpolate=(text:string,args:Record<string,string|number>)=>text.replace(/\{(\w+)\}/g,(token,key)=>String(args[key]??token));
const patterns=Object.keys(catalog).filter(key=>/\{\d+\}/.test(key)).map(key=>({key,regex:new RegExp('^'+key.split(/(\{\d+\})/).map(part=>/^\{\d+\}$/.test(part)?'([\\s\\S]*?)':part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('')+'$'),indices:[...key.matchAll(/\{(\d+)\}/g)].map(m=>m[1]!)}));
/** UI strings only. User titles, message bodies and custom prompts never pass through here. */
export function translate(text:string,locale:Locale,args:Record<string,string|number>={}){
  if(locale==='zh')return interpolate(text,args);
  if(catalog[text]!==undefined)return interpolate(catalog[text]!,args);
  for(const pattern of patterns){const match=pattern.regex.exec(text);if(match)return interpolate(catalog[pattern.key]!,Object.fromEntries(pattern.indices.map((key,i)=>[key,match[i+1]??''])));}
  return interpolate(text,args);
}
export const t=(text:string,args?:Record<string,string|number>)=>translate(text,currentLocale(),args);
