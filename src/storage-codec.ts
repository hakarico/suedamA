import type {Library} from './model';

type Packed={format:'suedama.local.2';texts:string[];data:unknown};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Store repeated backgrounds and immutable quote snapshots once per atomic write. */
export function packLibrary(library:Library):Packed{
  const counts=new Map<string,number>();
  const count=(value:unknown):void=>{if(typeof value==='string'&&value.length>=256)counts.set(value,(counts.get(value)??0)+1);else if(Array.isArray(value))value.forEach(count);else if(record(value))Object.values(value).forEach(count);};count(library);
  const texts=[...counts].filter(([,n])=>n>1).map(([text])=>text),ids=new Map(texts.map((text,index)=>[text,index]));
  const encode=(value:unknown):unknown=>{if(typeof value==='string'&&ids.has(value))return {$suedamaText:ids.get(value)};if(Array.isArray(value))return value.map(encode);if(record(value))return Object.fromEntries(Object.entries(value).map(([key,value])=>[key,encode(value)]));return value;};
  return {format:'suedama.local.2',texts,data:encode(library)};
}
/** Legacy inline libraries remain readable; a successful save migrates in place. */
export function unpackLibrary(value:unknown):unknown{
  if(!record(value)||value.format!=='suedama.local.2')return value;
  const {texts}=value;if(!Array.isArray(texts)||texts.some(text=>typeof text!=='string'))throw new Error('本地资料文本表无效。');
  const decode=(item:unknown):unknown=>{
    if(record(item)&&Object.keys(item).length===1&&Object.hasOwn(item,'$suedamaText')){const index=item.$suedamaText;if(!Number.isInteger(index)||Number(index)<0||Number(index)>=texts.length)throw new Error('本地资料文本引用无效。');return texts[Number(index)];}
    if(Array.isArray(item))return item.map(decode);if(record(item))return Object.fromEntries(Object.entries(item).map(([key,value])=>[key,decode(value)]));return item;
  };return decode(value.data);
}
