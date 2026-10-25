import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('.scratch/tests',{recursive:true});
await build({entryPoints:['tests/core.test.ts'],outfile:'.scratch/tests/core.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.svg':'text','.css':'text'},target:'node24'});
const result=spawnSync(process.execPath,['--test','.scratch/tests/core.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status ?? 1;
