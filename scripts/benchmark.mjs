import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('.scratch/performance',{recursive:true});
await mkdir('.scratch/qa',{recursive:true});
await build({entryPoints:['tests/performance.ts'],outfile:'.scratch/performance/benchmark.mjs',bundle:true,platform:'node',format:'esm',packages:'external',target:'node24'});
const result=spawnSync(process.execPath,['.scratch/performance/benchmark.mjs'],{encoding:'utf8'});
if(result.stderr)process.stderr.write(result.stderr);
if(result.status===0){await writeFile('.scratch/qa/performance.json',result.stdout);process.stdout.write(result.stdout);}
process.exitCode=result.status??1;
