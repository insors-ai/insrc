/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assertPackagedRuntimeAssets, packageNodeRuntimeInstaller } from './node-runtime-assets.mjs';
import { syncNodeRuntimeAssets } from './sync-node-runtime-policy.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
syncNodeRuntimeAssets(true);
const client=process.argv[2];
if(!['vscode','jetbrains'].includes(client))throw new Error('expected vscode or jetbrains');
const destination=join(root,client==='vscode'?'vscode-plugin/assets':'jetbrains-plugin/build/generated-resources/insrc');
mkdirSync(destination,{recursive:true});
const installer=process.env.INSRC_PACKAGED_INSTALLER;
if(installer){
 const source=readFileSync(installer,'utf8');
 assertPackagedRuntimeAssets(source);
 writeFileSync(join(destination,'insrc-daemon-install.sh'),source,{mode:0o755});
}else writeFileSync(join(destination,'insrc-daemon-install.sh'),packageNodeRuntimeInstaller(readFileSync(join(root,'scripts/insrc-daemon-install.sh'),'utf8')),{mode:0o755});
copyFileSync(join(root,'src/prompts/steering-block.md'),join(destination,'steering-block.md'));
if(client==='vscode')copyFileSync(join(root,'src/assets/node-runtime-policy.json'),join(destination,'node-runtime-policy.json'));
else rmSync(join(destination,'node-runtime-policy.json'),{force:true}); // Already a checked main resource.
