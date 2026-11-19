import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,join,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const licenseNames=['@xyflow-react','dompurify','hachure-fill','katex','marked','path-data-parser','points-on-curve','points-on-path','react-dom','react','roughjs'];
export const releaseFiles=['background.js','content.js','history.js','INSTALL.txt','LICENSE','manifest.json','README.md','THIRD_PARTY_NOTICES.md',...licenseNames.map(name=>`licenses/${name}.txt`)];
const dist=join(project,'dist'),findings=[];
async function filesIn(directory){const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Release must not contain symbolic links');if(entry.isDirectory())files.push(...await filesIn(path));else files.push(relative(dist,path).replaceAll('\\','/'));}return files;}
const files=(await filesIn(dist)).sort();
for(const name of files)if(!releaseFiles.includes(name))findings.push({file:name,rule:'unexpected release file'});
for(const name of releaseFiles)if(!files.includes(name))findings.push({file:name,rule:'missing release file'});
const identity=key=>spawnSync('git',['config','--get',key],{cwd:project,encoding:'utf8'}).stdout?.trim();
const personalMarkers=[process.env.USERNAME,process.env.USERPROFILE,identity('user.email'),identity('user.name')].filter(value=>value&&value.length>=4).map(value=>value.toLowerCase());
const patterns=[
  ['local absolute path',/\b[A-Z]:[\\/](?:Users|E[\\/]codex)[\\/]|\/(?:Users|home)\/[a-z0-9_.-]+\//i],
  ['private key',/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ['credential token',/\b(?:sk-(?:proj-|ant-)?[a-z0-9_-]{24,}|gh[pousr]_[a-z0-9]{24,}|github_pat_[a-z0-9_]{24,}|AKIA[A-Z0-9]{16})\b/i],
  ['test or debug content',/fixture-stress|suedama\.fixture|qaCommits|sourceMappingURL=/],
];
for(const name of files){
  if(!releaseFiles.includes(name))continue;
  if((await stat(join(dist,name))).size>5_000_000){findings.push({file:name,rule:'unexpectedly large file'});continue;}
  const text=await readFile(join(dist,name),'utf8'),lower=text.toLowerCase();
  const identityText=name==='LICENSE'?lower.replace(/^copyright \(c\) [^\r\n]*$/m,''):lower;
  if(personalMarkers.some(marker=>identityText.includes(marker)))findings.push({file:name,rule:'local account identity'});
  for(const [rule,pattern]of patterns)if(pattern.test(text))findings.push({file:name,rule});
}
const manifest=JSON.parse(await readFile(join(dist,'manifest.json'),'utf8')),pkg=JSON.parse(await readFile(join(project,'package.json'),'utf8'));
if(manifest.version!==pkg.version)findings.push({file:'manifest.json',rule:'version mismatch'});
if(JSON.stringify([...new Set(manifest.content_scripts?.flatMap(item=>item.matches))])!==JSON.stringify(['https://chat.deepseek.com/*']))findings.push({file:'manifest.json',rule:'unexpected site access'});
console.log(JSON.stringify({version:manifest.version,files:files.length,findings},null,2));
process.exitCode=findings.length?1:0;
