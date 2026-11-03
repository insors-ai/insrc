import type { Scope } from '../types.js';
import { digest, snapshotJson } from './codec.js';
import type { FrameRecord } from './checkpoint.js';
import type { EventBody } from './types.js';

export interface IndexedFrame {
  readonly segmentId: string;
  readonly record: FrameRecord;
  readonly payloadHash: string;
  readonly identityDigest: string;
  readonly scope: Scope;
  readonly scopeEpoch: string;
  readonly eventId: string;
  readonly admittedAtMs: number;
}
export function indexFrame(body: EventBody, segmentId: string, record: FrameRecord): IndexedFrame {
  const { projectId } = body.command.scope, { producerId, eventId } = body.command.source;
  return { segmentId, record, payloadHash: body.payloadHash, identityDigest: digest(snapshotJson({ version: 1, projectId, producerId, eventId }, 16_384).text), scope: body.command.scope, scopeEpoch: body.scopeEpoch, eventId, admittedAtMs: body.admittedAtMs };
}
