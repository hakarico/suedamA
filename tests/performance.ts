import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {archivedCards,isArchived,previewLayout} from '../src/topology';
import {cardChain} from './performance-data';

function median(run:()=>unknown){run();const samples=Array.from({length:5},()=>{const start=performance.now();run();return performance.now()-start;}).sort((a,b)=>a-b);return Number(samples[2]!.toFixed(3));}
const archive=[500,1500,3000].map(size=>{
  const cards=cardChain(size),values=Object.values(cards),before=()=>new Set(values.filter(c=>isArchived(c,cards)).map(c=>c.id)),after=()=>archivedCards(cards);
  assert.deepEqual([...after()].sort(),[...before()].sort());
  const beforeMs=median(before),afterMs=median(after);
  return {cards:size,beforeMs,afterMs,speedup:Number((beforeMs/afterMs).toFixed(1))};
});
const deep=cardChain(12000),previewMs=median(()=>assert.equal(previewLayout(Object.values(deep)).size,12000));
console.log(JSON.stringify({node:process.version,measuredAt:new Date().toISOString(),method:'Median of 5 runs after warmup. Synthetic single chain with short card payloads; topology calculation only, not whole-page frame rate.',archive,deepPreview:{cards:12000,medianMs:previewMs}},null,2));
