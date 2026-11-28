import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
let bytes: Promise<Uint8Array> | undefined;
/** Same fixed entry/platform/format as the production named CJS entry. Each
 * fixture writes these trusted bytes into its own temporary extension tree. */
export function scratchHostWorkerBytes(): Promise<Uint8Array> {
  return bytes ??= build({ entryPoints: [fileURLToPath(new URL('../../scratch-validation-host-worker.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', write: false, logLevel: 'silent' })
    .then(result => result.outputFiles![0]!.contents);
}
