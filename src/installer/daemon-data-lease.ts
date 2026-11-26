/** Daemon-owned OS lease; deliberately separate from the manager operation lock. */
import { join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation } from './contracts.js';
import { assertLocalControlRoot } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller } from './schemas.js';

// Native external handles finalize on GC. Losing an application reference must
// never release its stores' lease; retain until explicit confirmed disposal.
const retained = new Set<DaemonDataLease>();

function validateRoot(location: InstallationLocation): void {
  parseInstaller('location', location);
  const binding = controlBinding();
  assertLocalControlRoot(location.home, process.platform === 'win32' ? path => binding.localVolume(path) : undefined);
  for (const path of [location.home, join(location.home, 'install')]) {
    if (!binding.safePath(path, true, true)) throw new InstallerError('data-lease-root-invalid', 'Daemon data lease requires existing private, non-link installation roots');
  }
}

export class DaemonDataLease {
  readonly #handle: object;
  readonly #location: InstallationLocation;
  #closed = false;
  #closing: Promise<void> | undefined;
  private constructor(location: InstallationLocation, handle: object) {
    this.#location = structuredClone(location); this.#handle = handle;
  }
  /** No mkdir/enrollment, DB access, inherited handle, PID or age policy. */
  static acquire(location: InstallationLocation): DaemonDataLease {
    validateRoot(location);
    const lease = new DaemonDataLease(location, controlBinding().acquire(join(location.home, 'install', 'daemon-data.lock')));
    retained.add(lease); return lease;
  }
  assertHeld(): void {
    if (this.#closed || !controlBinding().held(this.#handle)) throw new InstallerError('data-lease-lost', 'Original daemon data lease is unavailable; store ownership is uncertain');
    validateRoot(this.#location);
  }
  /** The callback is the application's actual store/worker close barrier, never
   * a wire boolean. Failure retains the OS lock; process exit is the last resort.
   * Returning does NOT prove child exit or authorize a replacement daemon. */
  releaseAfterResources(closeOwnedResources: () => Promise<void>): Promise<void> {
    if (this.#closed) return Promise.resolve();
    if (this.#closing) return this.#closing;
    const closing = (async () => {
      try {
        this.assertHeld();
        await closeOwnedResources();
        this.assertHeld();
        controlBinding().close(this.#handle);
        this.#closed = true;
        retained.delete(this);
      } catch (cause) {
        throw new InstallerError('data-lease-release-uncertain', 'Owned store/worker or native lease closure is unconfirmed', { cause });
      }
    })();
    this.#closing = closing;
    void closing.finally(() => { this.#closing = undefined; }).catch(() => {});
    return closing;
  }
}
