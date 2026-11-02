import type { MemoryCommand, OperationReceipt, Scope } from '../types.js';

/** Private sc3 implementation types. Public sc1/sc2 stay unchanged. */
export interface QueueFrame {
  readonly formatVersion: 1;
  readonly recordType: 'event';
  readonly sequence: string;
  readonly operationId: string;
  readonly command: MemoryCommand;
  readonly checksum: string;
  readonly payloadHash: string;
  readonly queueId: string;
  readonly admittedAtMs: number;
  readonly scopeEpoch: string;
}
export type EventBody = Omit<QueueFrame, 'checksum'>;
export interface SegmentHeader {
  readonly formatVersion: 1;
  readonly recordType: 'segment';
  readonly queueId: string;
  readonly segmentId: string;
  readonly firstSequence: string;
}
export interface QueueCursor { readonly segmentId: string; readonly byteOffset: string; }
export interface QueueStats { readonly pendingBytes: number; readonly oldestPendingMs: number; readonly pendingEvents: number; }
export interface DurableQueue {
  append(command: MemoryCommand): Promise<OperationReceipt>;
  replay(): AsyncIterable<QueueFrame>;
  markResolved(operationId: string, generation: string): Promise<void>;
  stats(): QueueStats;
  seal(): Promise<void>;
  recycleResolvedSegments(): Promise<void>;
  close(): Promise<void>;
}
export interface StableIdentity { readonly version: 1; readonly projectId: string; readonly producerId: string; readonly eventId: string; }
export interface TerminalProof {
  readonly operationId: string;
  readonly identityDigest: string;
  readonly payloadHash: string;
  readonly scope: Scope;
  readonly scopeEpoch: string;
  readonly generation: string;
  readonly receipt: OperationReceipt;
  readonly queueTerminal: true;
}
export type ReceiptLookup = { readonly status: 'absent' } | { readonly status: 'unavailable' } | { readonly status: 'found'; readonly proof: TerminalProof };
/** Implemented by S3 later. No queue-to-store implementation import. */
export interface ReceiptVerifier {
  byIdentity(identity: StableIdentity): Promise<ReceiptLookup>;
  byOperation(operationId: string, requestedScope: Scope): Promise<ReceiptLookup>;
}
export const QUEUE_LIMITS = Object.freeze({
  maxEventBytes: 16 * 1024 * 1024,
  maxDepth: 32,
  maxNodes: 65_536,
  maxCalls: 64,
  maxFrames: 65_536,
  maxSegments: 65_536,
  checkpointBytes: 32 * 1024 * 1024,
  frameOverhead: 4096,
  headerBytes: 512,
  checkpointFixed: 65_536,
  checkpointPerFrame: 2048,
  checkpointPerSegment: 512,
});
