/** Manager-owned in-process dependency capability. No controller or process access. */
import { InstallerError } from './contracts.js';
import type { InstallationLocation, Target } from './contracts.js';
import type { DependencyOperationContext } from './peer-contracts.js';
import { assertToken, normalizeHome } from './location.js';

const owners = new WeakMap<DependencyOperationContext, { home: string; installationId: string; os: Target['os'] }>();

/** Called by the lock owner, with its retained live-owner assertion. */
export function createDependencyOperationContext(location: InstallationLocation, os: Target['os'],
  input: DependencyOperationContext): DependencyOperationContext {
  assertToken(location.installationId); assertToken(input.operationId);
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(input.attemptNonce)
    || typeof input.assertCurrent !== 'function' || typeof input.progress !== 'function') {
    throw new InstallerError('dependency-context-invalid', 'Expected a bound dependency operation');
  }
  const home = normalizeHome(location.home, os), { operationId, attemptNonce, signal } = input;
  // Capture callbacks, not the caller's mutable container.
  const current = input.assertCurrent.bind(input), progress = input.progress.bind(input);
  const check = () => {
    current();
    if (signal?.aborted) throw new InstallerError('cancelled', 'Dependency operation cancelled');
  };
  check();
  const context: DependencyOperationContext = Object.freeze({ operationId, attemptNonce, signal,
    assertCurrent: check,
    progress(stage: string, detail: string) {
      check();
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(stage) || detail.length > 2048 || /[\u0000-\u001f\u007f]/.test(detail)) {
        throw new InstallerError('dependency-context-invalid', 'Dependency progress exceeds its bound');
      }
      progress(stage, detail);
    },
  });
  owners.set(context, { home, installationId: location.installationId, os });
  return context;
}

/** A forged marker or a structurally similar object is not a manager capability. */
export function requireDependencyOperation(location: InstallationLocation,
  context?: DependencyOperationContext): DependencyOperationContext {
  const owner = context && owners.get(context);
  if (!owner || !context || owner.installationId !== location.installationId
    || owner.home !== normalizeHome(location.home, owner.os)) {
    throw new InstallerError('dependency-context-invalid', 'A live same-installation manager context is required');
  }
  context.assertCurrent(); return context;
}
