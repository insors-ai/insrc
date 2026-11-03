import { MemoryError } from '../errors.js';
import type { Json, MemoryCommand } from '../types.js';
import type { AdmissionTransforms } from '../queue/admission.js';
import { boundedString, digest, snapshotJson } from '../queue/codec.js';
import { record, shape } from '../queue/shape.js';

const invalid = (): never => { throw new MemoryError('INVALID_REQUEST', 'Invalid memory source input.'); };
const denied = (): never => { throw new MemoryError('POLICY_DENIED', 'Memory source attestation was refused.'); };
type Source = { text: string; reference: string | null; occurredAt: number | null };
function source(value: unknown, kind: MemoryCommand['kind'], reject: () => never): asserts value is Source | null {
  if (value === null) { if (['capture', 'correct', 'resolve'].includes(kind)) reject(); return; }
  shape(reject, value, ['text', 'reference', 'occurredAt']);
  if (typeof value.text !== 'string' || !value.text.length || !(value.reference === null || typeof value.reference === 'string' && value.reference.length > 0)
    || !(value.occurredAt === null || Number.isSafeInteger(value.occurredAt) && (value.occurredAt as number) >= 0)) reject();
}

/** Pure trust-boundary refinement. The injected host authenticates origins and
 * source lifecycles; the module never guesses authority from producer labels. */
export function admissionTransforms(maxEventBytes: number): AdmissionTransforms {
  return Object.freeze<AdmissionTransforms>({
    validateInput(command: MemoryCommand): void {
      const payload = command.payload;
      shape(invalid, payload, ['schemaVersion', 'input', 'source']);
      if (payload.schemaVersion !== 1) invalid();
      source(payload.source, command.kind, invalid);
    },
    finalize(_binding, original, output): MemoryCommand {
      const payload = output.payload;
      record(denied, payload);
      if (!Object.hasOwn(payload, 'policyAttestation')) throw new MemoryError('NOT_READY', 'Memory source attestation is unavailable.');
      shape(denied, payload, ['schemaVersion', 'input', 'source', 'policyAttestation']);
      if (payload.schemaVersion !== 1) denied();
      source(payload.source, output.kind, denied);
      shape(denied, payload.policyAttestation, ['version', 'origin', 'policyVersion', 'occurrenceTimeVerified']);
      const attestation = payload.policyAttestation;
      if (attestation.version !== 1 || !['user', 'host-policy', 'artifact', 'assistant', 'tool', 'document'].includes(attestation.origin as string)
        || !boundedString(attestation.policyVersion) || typeof attestation.occurrenceTimeVerified !== 'boolean') denied();
      const inputSource = payload.source;
      const occurredAt = inputSource !== null && attestation.occurrenceTimeVerified ? inputSource.occurredAt : null;
      const finalSource = inputSource === null ? null : { ...inputSource, occurredAt };
      return { ...output, payload: {
        schemaVersion: 1, input: payload.input as Json, source: finalSource,
        admitted: { version: 1, origin: attestation.origin as string, policyVersion: attestation.policyVersion as string,
          requestHash: digest(snapshotJson(original, maxEventBytes).text), contentHash: inputSource === null ? null : digest(inputSource.text), occurredAt },
      } };
    },
  });
}
