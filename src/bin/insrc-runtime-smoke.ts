/* Copyright (c) Procix Software India. Licensed under the MIT License. */
// Isolated source-candidate probe: no user store is opened or rewritten.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
const require = createRequire(import.meta.url);
export async function sourceRuntimeSmoke(candidateRoot?: string | undefined): Promise<void> {
 if(candidateRoot!==undefined&&!isAbsolute(candidateRoot))throw new Error('native smoke requires an absolute candidate root');
 const load=candidateRoot===undefined?require:createRequire(join(candidateRoot,'package.json'));
 for (const module of ['tree-sitter', 'lmdb', 'fs-ext', '@lancedb/lancedb', '@duckdb/node-api']) {
  load(module);
 }
 process.stdout.write(JSON.stringify({ node: process.versions.node, executable: process.execPath, modules: process.versions.modules, loaded: ['tree-sitter', 'lmdb', 'fs-ext', '@lancedb/lancedb', '@duckdb/node-api'] }) + '\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await sourceRuntimeSmoke(process.argv[2]);
