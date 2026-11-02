import { realpath } from 'node:fs/promises';
import type { MemoryFactory as FactoryContract, MemoryOptions } from './types.js';
import { MemoryError } from './errors.js';
import { validateOptions } from './configuration.js';
import { acquireOwnership } from './ownership.js';
import { ModelDispatcher } from './model-dispatcher.js';
import { EmbeddedMemoryService } from './runtime.js';
import { validateQueueLimits } from './queue/codec.js';
import { FileQueue } from './queue/file-queue.js';
import { QueueAdmission } from './queue/admission.js';
/** Explicit open is the only entry that performs I/O or loads native code. */
export const MemoryFactory: FactoryContract = Object.freeze({
  async open(options: MemoryOptions) {
    const config = validateOptions(options);
    validateQueueLimits(config.limits); // Pure queue-specific validation before ownership/I/O.
    const owner = await acquireOwnership(config);
    let queue: FileQueue | undefined;
    try {
      queue = new FileQueue(owner, await realpath(config.dataDirectory), config.limits);
      await queue.start();
      const admission = new QueueAdmission(queue, config.policy);
      const models = new ModelDispatcher(config.models, config.limits.modelTimeoutMs);
      const ownedQueue = queue;
      const ingress = { ready: () => ownedQueue.isAvailable(), submit: admission.append.bind(admission), operation: admission.operation.bind(admission) };
      return new EmbeddedMemoryService(owner, models, config.logger, [queue], ingress);
    } catch (error) {
      // Never release the OS guard before partial queue startup resources close.
      try { await queue?.close(); }
      catch { throw new MemoryError('STORE_UNAVAILABLE', 'Failed startup cleanup could not be verified.'); }
      try { await owner.close(); }
      catch { throw new MemoryError('STORE_UNAVAILABLE', 'Failed ownership cleanup could not be verified.'); }
      if (error instanceof MemoryError) throw error;
      throw new MemoryError('NOT_READY', 'Memory could not be initialized.');
    }
  },
});
