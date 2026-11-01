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
    const native = await loadNative();
    const root = await prepareRoot(config);
    const owner = await acquireOwnership(root, native);
    try { return new EmbeddedMemoryService(owner, new ModelDispatcher(config.models, config.limits.modelTimeoutMs), config.logger); }
    catch {
      await owner.close();
      throw new MemoryError('NOT_READY', 'Memory foundation could not be initialized.');
    }
  },
});
