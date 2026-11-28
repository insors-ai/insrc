/** Publication-only terminal helper. Exact process exit is observed by the script. */
import { createReadStream } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import type { Target, RuntimeIdentity } from './contracts.js';
import { assertLocalControlRoot, assertToken, normalizeHome, resolveInstallationLocation } from './location.js';
import { parseInstaller } from './schemas.js';
import { ControllerStore } from './controller-store.js';
import { verifyBootstrapControl } from './bootstrap-control.js';
import { controlBinding } from './native.js';
import { runtimeArchive, runtimePolicy } from './runtime-policy.js';
import { ensurePrivateRuntime } from './runtime-install.js';
import type { DownloadTransport } from './download.js';
import { closedRuntimeOperation } from './runtime-acquire.js';
import { RUNTIME_LIMITS } from './runtime-metadata.js';

export async function publishBootstrapFoundation(targetInput: Target, args: string[], signal?: AbortSignal): Promise<void> {
  const target = structuredClone(parseInstaller('target', targetInput));
  if (process.version !== `v${PRIVATE_NODE_VERSION}` || target.os !== process.platform || target.arch !== process.arch) throw new InstallerError('runtime-invalid', 'Exact bootstrap target runtime required');
  if (args.length !== 5 || args.some(value => !value)) throw new InstallerError('schema-invalid', 'Bootstrap publication requires home, identity, work and control digests');
  const [home, id, workInput, bootstrapHash, nativeHash] = args as [string, string, string, string, string];
  const work = normalizeHome(workInput, target.os);
  assertToken(id);
  const location = resolveInstallationLocation(id, { home, ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) });
  if (dirname(work) !== join(location.home, 'install') || !/^bootstrap-stage\.[A-Za-z0-9-]+$/.test(basename(work))) throw new InstallerError('path-invalid', 'Bootstrap work must be its private script stage');
  assertLocalControlRoot(work, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
  const control = dirname(fileURLToPath(import.meta.url)), hashes = { bootstrap: bootstrapHash, native: nativeHash };
  const deadline = AbortSignal.timeout(RUNTIME_LIMITS.verificationMs), verification = signal ? AbortSignal.any([deadline, signal]) : deadline;
  // The shell verifies both files before execution. Read the helper's own
  // canonical control bytes once for independent verification and fresh copying.
  const bytes = await closedRuntimeOperation(verifyBootstrapControl(control, hashes, location.home, verification), verification);
  const store = ControllerStore.acquire(location);
  try {
    const archive = runtimeArchive(target), identity: RuntimeIdentity = { version: PRIVATE_NODE_VERSION, target, sha256: archive.sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
    const files = new Map([[archive.url, join(work, 'runtime.archive')], [runtimePolicy.supplemental.headers.url, join(work, 'headers.archive')], [runtimePolicy.supplemental.libraries[target.arch].url, join(work, 'node.lib')]]);
    const transport: DownloadTransport = async url => {
      const path = files.get(url.href); if (!path) throw new InstallerError('download-invalid', 'Bootstrap asset is not pinned');
      const body = createReadStream(path);
      return { status: 200, body, closed: new Promise<void>(resolve => body.once('close', resolve)) };
    };
    await ensurePrivateRuntime(store, identity, { signal, transport });
    const publicationDeadline = AbortSignal.timeout(RUNTIME_LIMITS.verificationMs);
    const publication = signal ? AbortSignal.any([publicationDeadline, signal]) : publicationDeadline;
    await closedRuntimeOperation(store.publishBootstrapControl(bytes, hashes, publication), publication);
    signal?.throwIfAborted();
  } finally { store.close(); }
}
