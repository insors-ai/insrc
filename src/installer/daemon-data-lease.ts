/** Daemon-owned OS lease; deliberately separate from the manager operation lock. */
import { join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation } from './contracts.js';
import { assertLocalControlRoot } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller } from './schemas.js';

// Native external handles finalize on GC. Losing an application reference must
// never release its stores' lease. Retain through the daemon's actual exit:
// the legacy native close(void) cannot attest OS-handle release on every target.
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
  #resourcesClosed = false;
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
    if (!controlBinding().held(this.#handle)) throw new InstallerError('data-lease-lost', 'Original daemon data lease is unavailable; store ownership is uncertain');
    validateRoot(this.#location);
  }
  /** Complete only the application's real store/worker close barrier, never a
   * wire boolean. Success and failure both retain the native lease until exit.
   * We deliberately never call close(void) and mistake its return for proof.
   * Only the wrapper's observed actual exit can establish released ownership. */
  closeResources(closeOwnedResources: () => Promise<void>): Promise<void> {
    if (this.#resourcesClosed) return Promise.resolve();
    if (this.#closing) return this.#closing;
    const closing = (async () => {
      try {
        this.assertHeld();
        await closeOwnedResources();
        this.assertHeld();
        this.#resourcesClosed = true;
      } catch (cause) {
        throw new InstallerError('data-lease-release-uncertain', 'Owned store/worker closure is unconfirmed; retain the lease until exit', { cause });
      }
    })();
    this.#closing = closing;
    void closing.finally(() => { this.#closing = undefined; }).catch(() => {});
    return closing;
  }
}
