import type { Table } from '@lancedb/lancedb';
import { MemoryError } from '../errors.js';
import type { Reservation } from '../queue/codec.js';
import { decodeRow, STORE_LIMITS } from './codec.js';
import { domainId, rowIdPredicate } from './plan.js';
import type { PinnedReader } from './reads.js';
import type { EmbeddingProfile, StoreRow } from './types.js';

const SCALARS = ['rowId', 'rowKind', 'projectId', 'namespaceKey', 'scopeEpoch', 'sessionId', 'branch', 'environment', 'entityId', 'revisionId', 'sourceId', 'operationId', 'payloadHash', 'identityDigest', 'generation', 'status', 'validFrom', 'validUntil', 'payload'];
function unavailable(): never { throw new MemoryError('STORE_UNAVAILABLE', 'Pinned memory data could not be verified.'); }
function overflow(): never { throw new MemoryError('CONTEXT_OVERFLOW', 'Pinned memory data exceeds its read bound.'); }
function namespaces(values: readonly string[]): string {
  if (!values.length || values.length > 8 || values.some(v => !/^[a-f0-9]{64}$/.test(v))) unavailable();
  return "namespaceKey IN (" + values.map(v => "'" + v + "'").join(',') + ')';
}
function clock(value: number): string { if (!Number.isSafeInteger(value) || value < 0) unavailable(); return String(value); }
/** Native handle stays private; the manager receives scalar projections only. */
export class NativePinnedReader implements PinnedReader {
  readonly #profile: EmbeddingProfile;
  readonly #version: number;
  readonly #owned: () => Promise<void>;
  readonly #beforeClose: () => Promise<void>;
  readonly #released: (reader: NativePinnedReader) => void;
  #table: Table | undefined;
  #closing: Promise<void> | undefined;
  constructor(table: Table, profile: EmbeddingProfile, version: number, owned: () => Promise<void>, beforeClose: () => Promise<void>, released: (reader: NativePinnedReader) => void) {
    this.#table = table; this.#profile = profile; this.#version = version; this.#owned = owned; this.#beforeClose = beforeClose; this.#released = released;
  }
  async #run<T>(work: (table: Table) => Promise<T>): Promise<T> {
    try {
      if (this.#closing || !this.#table) unavailable();
      await this.#owned(); if (await this.#table.version() !== this.#version) unavailable();
      const result = await work(this.#table);
      await this.#owned(); if (await this.#table.version() !== this.#version) unavailable(); return result;
    } catch (error) {
      if (error instanceof MemoryError && ['BACKPRESSURE', 'CONTEXT_OVERFLOW'].includes(error.code)) throw error;
      unavailable();
    }
  }
  get(id: string, reservation: Reservation, maxBytes: number): Promise<StoreRow | null> {
    return this.#run(async table => {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > STORE_LIMITS.maxBytes) overflow();
      const where = rowIdPredicate(id);
      // Check string bytes natively before transferring/decoding an untrusted
      // payload. IDs are enumerated separately; never collect thousands of large
      // payload strings merely to discover a result/dependency overflow.
      const metadata = await table.query().where(where).select(new Map([['rowId', 'rowId'], ['payloadBytes', 'octet_length(payload)']])).limit(2).toArray();
      if (metadata.length > 1) unavailable(); if (!metadata.length) return null;
      const size = Number(metadata[0]?.payloadBytes);
      if (!Number.isSafeInteger(size) || size < 0) unavailable(); if (size > maxBytes) overflow();
      const rows = await table.query().where(where).select(SCALARS).limit(2).toArray();
      if (rows.length !== 1) unavailable();
      // Vector columns are intentionally omitted for scalar eligibility/projection.
      // Schema/profile was verified by the owner; no vector is inferred or changed.
      const value: Record<string, unknown> = { ...rows[0], embedding: null };
      for (const key of ['validFrom', 'validUntil']) if (typeof value[key] === 'bigint') value[key] = Number(value[key]);
      return decodeRow(value, this.#profile, maxBytes, reservation);
    });
  }
  #keys(where: string, limit: number): Promise<readonly string[]> {
    return this.#run(async table => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > STORE_LIMITS.maxReferences + 1) unavailable();
      const rows = await table.query().where(where).select(['rowId']).limit(limit).toArray();
      return Object.freeze(rows.map(row => { const id: unknown = row.rowId; if (typeof id !== 'string') unavailable(); rowIdPredicate(id); return id; }));
    });
  }
  currentKeys(values: readonly string[], at: number, limit: number): Promise<readonly string[]> {
    const time = clock(at);
    return this.#keys("rowKind = 'current' AND status = 'active' AND " + namespaces(values) + ' AND (validFrom IS NULL OR CAST(validFrom AS BIGINT) <= ' + time + ') AND (validUntil IS NULL OR CAST(validUntil AS BIGINT) > ' + time + ')', limit);
  }
  protectionKeys(values: readonly string[], limit: number): Promise<readonly string[]> { return this.#keys("rowKind = 'tombstone' AND " + namespaces(values), limit); }
  evidenceKeys(namespace: string, revision: string, limit: number): Promise<readonly string[]> {
    domainId('revision', revision);
    return this.#keys("rowKind = 'evidence' AND " + namespaces([namespace]) + " AND revisionId = '" + revision + "'", limit);
  }
  async receiptKey(operation: string): Promise<string | null> {
    if (!/^[a-f0-9]{64}$/.test(operation)) unavailable();
    const keys = await this.#keys("rowKind = 'receipt' AND operationId = '" + operation + "'", 2);
    if (keys.length > 1) unavailable(); return keys[0] ?? null;
  }
  nextStart(values: readonly string[], after: number): Promise<number | null> {
    return this.#run(async table => {
      const rows = await table.query().where("rowKind = 'current' AND status = 'active' AND " + namespaces(values) + ' AND CAST(validFrom AS BIGINT) > ' + clock(after)).select(['validFrom']).orderBy({ columnName: 'validFrom', ascending: true, nullsFirst: false }).limit(1).toArray();
      if (!rows.length) return null;
      const value = Number(rows[0]?.validFrom); if (!Number.isSafeInteger(value) || value < 0) unavailable(); return value;
    });
  }
  close(): Promise<void> {
    this.#closing ??= (async () => {
      try { await this.#beforeClose(); this.#table?.close(); this.#table = undefined; this.#released(this); }
      catch { unavailable(); }
    })();
    return this.#closing;
  }
}
