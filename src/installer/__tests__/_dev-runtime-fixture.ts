/** Actual shared-store runtime for isolated dev fixtures; never the host daemon. */
import { createReadStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Target } from '../contracts.js';
import { ControllerStore } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { controlBinding } from '../native.js';
import { runtimeArchive } from '../runtime-policy.js';
import { officialInputs } from './_runtime-profile-fixture.js';
export async function devRuntimeFixture(home: string, target: Target, installationId = 'fixture') {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  controlBinding().protect(home);
  const location = resolveInstallationLocation(installationId, { home, ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) });
  const identity = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
  const store = ControllerStore.acquire(location); let inputs: string | undefined;
  try {
    const runtime = await store.ensureRuntime(identity, { transport: async url => {
      inputs ??= await officialInputs();
      const body = createReadStream(join(inputs, url.pathname.split('/v22.22.1/')[1]!));
      return { status: 200, body, closed: new Promise<void>(resolve => body.once('close', resolve)) };
    } });
    return { location, identity, runtime };
  } finally { store.close(); }
}
