/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PreparationObservation } from './preparation-observation.js';

/** Private execution persistence, installed for a dedicated review worker's
 * whole lifetime. Values here are family semantic projections, never a second
 * on-disk checkpoint authority. The owner encodes current-format history. */
export interface PreparationPersistence {
 readonly path: string;
 read(): Promise<unknown | undefined>;
 write(input: unknown): Promise<void>;
 observe(update: PreparationObservation): Promise<void>;
}
const active = new AsyncLocalStorage<PreparationPersistence>();
export function withPreparationPersistence<T>(owner: PreparationPersistence, work: () => T): T {
 if (active.getStore() === owner) return work();
 if (active.getStore()) throw new Error('Review preparation persistence already installed');
 return active.run(owner, work);
}
export function preparationPersistence(path: string): PreparationPersistence | undefined {
 const owner = active.getStore();
 if (owner && owner.path !== path) throw new Error('Foreign review preparation persistence path');
 return owner;
}
