import {createServer} from 'node:http';
import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
await mkdir('.scratch/dev',{recursive:true});
await build({entryPoints:['tests/browser-entry.ts'],outfile:'.scratch/dev/fixture.js',bundle:true,format:'esm',target:'chrome120',loader:{'.css':'text','.svg':'text'},define:{'process.env.NODE_ENV':'"development"'}});
if(process.argv.includes('--build-only'))process.exit(0);
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>suedamA 本地回归</title><style>body{margin:0;background:#161616;color:#ddd;font:15px/1.8 "Segoe UI","Microsoft YaHei",sans-serif}.fixture-native{max-width:740px;padding:30px;margin:auto auto 180px}[data-virtual-list-item-key]{margin:25px 0}.ds-collapsible-text{padding:16px 20px;background:#292929;border-radius:18px;white-space:pre-wrap}.ds-assistant-message-main-content{padding:8px}.ds-flex,.version-control{display:flex;gap:10px}button,[role=button]{color:#ccc;border:1px solid #555;background:#252525;cursor:pointer;border-radius:6px;padding:6px 12px}.fixture-composer{position:fixed;bottom:20px;left:15%;width:70%;background:#282828;padding:16px;border-radius:18px}textarea{color:#eee;background:#333;min-width:90%;min-height:55px;font:inherit}.version-control{align-items:center}.ds-button--disabled{opacity:.3}</style><body><script type="module" src="/fixture.js"></script></body></html>`;
const server=createServer(async(req,res)=>{
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(await readFile('.scratch/dev/fixture.js'));}
  else if(req.url==='/'||req.url?.startsWith('/a/chat/s/fixture-')){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);}
  else {res.statusCode=404;res.end('Not found');}
});
server.listen(3097,'127.0.0.1',()=>console.log('DOM regression page: http://127.0.0.1:3097/a/chat/s/fixture-study'));
