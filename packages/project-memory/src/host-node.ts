import type { MemoryFactory as FactoryContract, MemoryOptions } from './types.js';
import { validateOptions } from './configuration.js';
import { acquireOwnership } from './ownership.js';
import { ModelDispatcher } from './model-dispatcher.js';
import { EmbeddedMemoryService } from './runtime.js';
import { validateQueueLimits } from './queue/codec.js';
import { FileQueue } from './queue/file-queue.js';
import { QueueAdmission } from './queue/admission.js';
import { OwnedLanceStore } from './store/lance-store.js';
import { StoreOwnedWork, rollbackStartup } from './store/lifecycle.js';
import { embeddingProfile } from './store/embedding-profile.js';
import { admissionTransforms } from './store/admission-policy.js';
/** Explicit open is the only entry that performs I/O or loads native code. */
export const MemoryFactory: FactoryContract = Object.freeze({
  async open(options: MemoryOptions) {
    const config = validateOptions(options);
    validateQueueLimits(config.limits); // Pure queue-specific validation before ownership/I/O.
    const profile = embeddingProfile(config.models.embeddingModel, config.models.embeddingDimension);
    const owner = await acquireOwnership(config);
    let queue: FileQueue | undefined;
    let store: OwnedLanceStore | undefined;
    try {
      store = await OwnedLanceStore.open(owner, profile, {}, config.limits, config.policy);
      queue = new FileQueue(owner, owner.directory, config.limits, {}, store.receiptVerifier());
      await queue.start();
      const admission = new QueueAdmission(queue, config.policy, admissionTransforms(config.limits.maxEventBytes));
      const models = new ModelDispatcher(config.models, config.limits.modelTimeoutMs);
      const ownedQueue = queue;
      const ownedStore = store;
      const ingress = { ready: () => ownedQueue.isAvailable() && ownedStore.isAvailable(), submit: admission.append.bind(admission), operation: admission.operation.bind(admission) };
      return new EmbeddedMemoryService(owner, models, config.logger, [queue, new StoreOwnedWork(store)], ingress);
    } catch (error) {
      return rollbackStartup(owner, [...(queue ? [queue] : []), ...(store ? [new StoreOwnedWork(store)] : [])], error);
    }
  },
});
