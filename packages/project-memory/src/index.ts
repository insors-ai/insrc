import type { MemoryFactory as FactoryContract, MemoryOptions } from './types.js';
export type * from './types.js';
export { MemoryError } from './errors.js';
/** Importing this entry does no I/O and does not load native dependencies. */
export const MemoryFactory: FactoryContract = Object.freeze({
  async open(options: MemoryOptions) { return (await import('./host-node.js')).MemoryFactory.open(options); },
});
