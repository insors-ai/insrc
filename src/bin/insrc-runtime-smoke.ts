/* Copyright (c) Procix Software India. Licensed under the MIT License. */
// Isolated source-candidate probe: no user store is opened or rewritten.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
export async function sourceRuntimeSmoke(): Promise<void> {
 for (const module of ['tree-sitter', 'lmdb', 'fs-ext', '@lancedb/lancedb', '@duckdb/node-api']) {
  require(module);
 }
 process.stdout.write(JSON.stringify({ node: process.versions.node, executable: process.execPath, modules: process.versions.modules, loaded: ['tree-sitter', 'lmdb', 'fs-ext', '@lancedb/lancedb', '@duckdb/node-api'] }) + '\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await sourceRuntimeSmoke();
