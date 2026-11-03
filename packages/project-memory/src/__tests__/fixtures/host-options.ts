import type { Json, MemoryCommand, MemoryOptions } from '../../types.js';
import { options } from './options.js';

/** Trusted host fixture only; production applications must authenticate their
 * own capture routes and registered source lifecycles before attesting. */
export function attestHostEvent(event: Json): Json {
  const command = event as unknown as MemoryCommand;
  return { ...command, payload: { ...(command.payload as Record<string, Json>), policyAttestation: { version: 1, origin: 'user', policyVersion: 'host-fixture-v1', occurrenceTimeVerified: false } } } as unknown as Json;
}
export function hostOptions(dataDirectory: string): MemoryOptions {
  const config = options(dataDirectory);
  return { ...config, limits: { maxEventBytes: 32768, segmentBytes: 32768, maxPendingBytes: 2 * 1024 * 1024, modelTimeoutMs: 1000 }, policy: { ...config.policy, async admit(_binding, event) { return attestHostEvent(event); } } };
}
