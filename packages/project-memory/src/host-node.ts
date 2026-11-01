import type { MemoryFactory as FactoryContract, MemoryOptions } from './types.js';
import { MemoryError } from './errors.js';
/** Replaced by the composed Node host in t6; never reports fake readiness. */
export const MemoryFactory: FactoryContract = Object.freeze({
  async open(_options: MemoryOptions) { throw new MemoryError('NOT_READY', 'Memory foundation is not initialized.'); },
});
