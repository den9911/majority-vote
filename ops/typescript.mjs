import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const mappings = JSON.parse(await readFile('ops/typescript-output.json', 'utf8'));
await rm('.build', {recursive:true, force:true});
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], {stdio:'inherit'});
if(result.status !== 0) process.exit(result.status ?? 1);
for(const [source, destination] of Object.entries(mappings)) {
  const content = await readFile(`.build/${source}`, 'utf8');
  if(process.argv.includes('--check')) {
    if(content !== await readFile(destination, 'utf8')) throw new Error(`Stale generated file: ${destination}. Run npm run build.`);
  } else {
    await mkdir(dirname(destination), {recursive:true}); await writeFile(destination,content);
  }
}
await rm('.build', {recursive:true, force:true});
