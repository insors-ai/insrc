/**
 * Story E20260921ad0d45c9:S006 / t1 — the extension bundle step.
 *
 * esbuild bundles the two entry points into self-contained CommonJS so the .vsix
 * carries no `../../src` and no node_modules:
 *   - src/extension.ts   -> out/extension.js   (the `main`, S001)
 *   - src/uninstall.ts   -> out/uninstall.js   (the `vscode:uninstall` hook, S005)
 *
 * The cross-package `../../src/shared/ipc-client.js` is INLINED (k5: only the
 * thin socket client — node:net + pure types + paths — travels; no daemon
 * internals, indexer, or storage). `vscode` is marked EXTERNAL: the VS Code host
 * supplies it at runtime, so the compile-only src/vscode.d.ts shim suffices and
 * no @types/vscode dependency is needed. tsc --noEmit stays the typecheck gate
 * (run via the `vscode:prepublish` script before packaging).
 *
 * CommonJS (not ESM) because the VS Code extension host loads `main` via
 * require(); an ESM bundle under a type:module package is not reliably loaded.
 * CRUCIALLY: the package manifest declares `"type": "module"` (the dev/test
 * toolchain is ESM), which would make Node load a `.js` file under it as ESM and
 * the CJS bundle would crash at load. So the bundle also writes
 * `out/package.json` = { "type": "commonjs" } — the nearest-package.json marker
 * that pins everything under out/ to CommonJS regardless of the ESM root
 * manifest. Without it the packaged extension neither activates nor uninstalls.
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Bundle the two entry points into `outdir` as self-contained CJS + the CJS marker. */
export async function bundle(outdir) {
  await build({
    entryPoints: [join(here, 'src/extension.ts'), join(here, 'src/uninstall.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outdir,
    external: ['vscode'],
    // CJS has no real `import.meta.url`; esbuild would otherwise leave it empty.
    // Shim it to the emitted file's own file:// URL so the modules that
    // self-locate (uninstall.ts's argv[1] main-check + steering-body.ts's asset
    // resolution) keep working in the packaged bundle.
    define: { 'import.meta.url': 'import_meta_url' },
    banner: { js: "const import_meta_url = require('url').pathToFileURL(__filename).href;" },
    logLevel: 'silent',
  });
  // Pin out/ to CommonJS so the `.js` bundle loads as CJS under the ESM root
  // manifest (see the header). This file ships in the .vsix (out/ is kept by
  // .vscodeignore); vsce reads only the ROOT package.json for the manifest.
  writeFileSync(join(outdir, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
}

// Run as a script (`node esbuild.mjs`) -> bundle into ./out.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await bundle(join(here, 'out'));
  console.log('bundled -> out/extension.js + out/uninstall.js (CJS)');
}
