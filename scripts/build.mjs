import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
await mkdir('dist', { recursive: true });
const common = { bundle: true, target: 'chrome120', minify: true, legalComments: 'eof', define: {'process.env.NODE_ENV': '"production"'} };
await build({...common, entryPoints: ['src/content.tsx'], outfile: 'dist/content.js', format: 'iife', loader: {'.css': 'text', '.svg': 'text'}});
await build({...common, entryPoints: ['src/background.ts'], outfile: 'dist/background.js', format: 'iife'});
await copyFile('manifest.json', 'dist/manifest.json');
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
await copyFile('README.md', 'dist/README.md');
await mkdir('dist/licenses',{recursive:true});
for(const [name,file]of [['react','LICENSE'],['react-dom','LICENSE'],['@xyflow/react','LICENSE'],['marked','LICENSE.md'],['dompurify','LICENSE'],['roughjs','LICENSE'],['katex','LICENSE']]) {
  await copyFile(join('node_modules',name,file),join('dist/licenses',name.replaceAll('/','-')+'.txt'));
}
const roughRequire=createRequire(createRequire(import.meta.url).resolve('roughjs'));
for(const name of ['hachure-fill','path-data-parser','points-on-curve','points-on-path'])await copyFile(join(dirname(roughRequire.resolve(name+'/package.json')),'LICENSE'),join('dist/licenses',name+'.txt'));
await writeFile('dist/INSTALL.txt', 'Chrome / Edge → 扩展管理 → 开发者模式 → 加载已解压的扩展 → 选择包含 manifest.json 的文件夹。\n只作用于 https://chat.deepseek.com/，安装后刷新网页。详见 README.md。\n\nChrome / Edge → Extensions → Developer mode → Load unpacked → Select the folder containing manifest.json.\nWorks on https://chat.deepseek.com/ only. Refresh the page after installation. See README.md.\n');
console.log('Built unpacked extension: dist/');
