import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('.scratch/tests',{recursive:true});
await build({entryPoints:['tests/core.test.ts','tests/history.test.ts','tests/native-navigation.test.ts'],outdir:'.scratch/tests',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.svg':'text','.css':'text'},target:'node24'});
const result=spawnSync(process.execPath,['--test','.scratch/tests/core.test.mjs','.scratch/tests/history.test.mjs','.scratch/tests/native-navigation.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status ?? 1;
