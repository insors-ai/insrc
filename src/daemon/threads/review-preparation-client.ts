/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { MessagePort } from 'node:worker_threads';
import { HubClient } from './channel.js';
import type { SourceCapacity } from '../../workflow/review/source-session.js';
import type { PreparedSourceIdentity, ReadyContextReceipt } from '../../workflow/review/prepared-context.js';
import type { PreparationAccess, ReviewRuntime } from '../../shared/review-preparation.js';
import type { HistoryBoundaryReceipt } from '../../workflow/review/history-binding.js';
import type { PublicationProof } from '../../workflow/review/publication-proof.js';

/** The caller receives this port only in private worker bootstrap data. */
export class ReviewPreparationClient implements SourceCapacity {
 private readonly hub: HubClient;
 constructor(port: MessagePort) { this.hub = new HubClient(port); }
 reserve(bytes: number): Promise<string> { return this.hub.request('capacity.reserve', { bytes }); }
 commit(token: string, bytes: number): Promise<void> { return this.hub.request('capacity.commit', { token, bytes }); }
 split(token: string, bytes: readonly number[]): Promise<readonly string[]> { return this.hub.request('capacity.split', { token, bytes }); }
 combine(tokens: readonly string[]): Promise<string> { return this.hub.request('capacity.combine', { tokens }); }
 release(token: string): Promise<void> { return this.hub.request('capacity.release', { token }); }
 qualify(identity: PreparedSourceIdentity, receipt: ReadyContextReceipt): Promise<void> { return this.hub.request('context.qualify', { identity, receipt }); }
 borrow(identity: PreparedSourceIdentity): Promise<{ access: PreparationAccess; receipt: ReadyContextReceipt }> { return this.hub.request('context.borrow', { identity }); }
 resolve(access: PreparationAccess): Promise<ReadyContextReceipt> { return this.hub.request('context.resolve', { access }); }
 releaseBorrow(access: PreparationAccess): Promise<void> { return this.hub.request('context.release', { access }); }
 invalidate(access: PreparationAccess): Promise<void> { return this.hub.request('context.invalidate', { access }); }
 progress(value: Pick<ReviewRuntime, 'progress' | 'preparation'>): Promise<void> { return this.hub.request('runtime.progress', value); }
 acceptHistory(access: PreparationAccess, receipt: HistoryBoundaryReceipt): Promise<void> { return this.hub.request('runtime.history', { access, receipt }); }
 publication(access: PreparationAccess, receipt: HistoryBoundaryReceipt): Promise<PublicationProof> { return this.hub.request('runtime.publication', { access, receipt }); }
}
