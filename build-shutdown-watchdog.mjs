/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createRequire, isBuiltin } from 'node:module';
import { renameSync } from 'node:fs';
// tsx already requires and pins esbuild. Resolve through that existing tool,
// including installations that keep its dependency nested rather than hoisted.
const { build } = createRequire(import.meta.resolve('tsx'))('esbuild');
const outfile = `out/bin/insrc-shutdown-watchdog.${process.pid}.tmp.mjs`;
const result = await build({ entryPoints: ['src/bin/insrc-shutdown-watchdog.ts'], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true });
for (const output of Object.values(result.metafile.outputs)) {
 for (const dependency of output.imports) if (!dependency.external || !isBuiltin(dependency.path)) throw new Error(`watchdog has a non-built-in runtime import: ${dependency.path}`);
}
renameSync(outfile, 'out/bin/insrc-shutdown-watchdog.js');
