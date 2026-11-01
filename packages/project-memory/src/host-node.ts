import type { MemoryFactory as FactoryContract, MemoryOptions } from './types.js';
import { MemoryError } from './errors.js';
import { validateOptions, validateRuntime, prepareRoot } from './configuration.js';
import { loadNative } from './native.js';
import { acquireOwnership } from './ownership.js';
import { ModelDispatcher } from './model-dispatcher.js';
import { EmbeddedMemoryService } from './runtime.js';
/** Explicit open is the only entry that performs I/O or loads native code. */
export const MemoryFactory: FactoryContract = Object.freeze({
  async open(options: MemoryOptions) {
    const config = validateOptions(options);
    validateRuntime();
    const root = await prepareRoot(config);
    const native = await loadNative();
    const owner = await acquireOwnership(root, native);
    try { return new EmbeddedMemoryService(owner, new ModelDispatcher(config.models, config.limits.modelTimeoutMs), config.logger); }
    catch {
      // A cleanup failure takes priority: ownership release is then unverified.
      // Do not expose the original construction/native exception to the host.
      try { await owner.close(); }
      catch { throw new MemoryError('STORE_UNAVAILABLE', 'Failed startup cleanup could not be verified.'); }
      throw new MemoryError('NOT_READY', 'Memory foundation could not be initialized.');
    }
  },
});
