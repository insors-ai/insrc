/** Private retained-service protocol. None of these types are daemon IPC. */
import { Ajv } from 'ajv';
import { canonicalJson, digest } from './release-descriptor.js';
import { devObjectSchema as object, devHashSchema as hash, parseDevRecord } from './dev.js';
import { installerSchemas } from './schemas.js';
import type { InstallationLocation } from './contracts.js';
import { parseOllamaPolicy } from './ollama-policy.js';
import type { OllamaPolicy } from './ollama-policy.js';
import { dependencyUncertain, parseOllamaAttempt } from './ollama-records.js';
import type { OllamaAttempt } from './ollama-records.js';

export interface OllamaServiceAdmission {
  schemaVersion: 1; kind: 'user-session-ollama'; identitySha256: string; policySha256: string;
  inventorySha256: string; nonce: string; retained: true;
}
export interface OllamaServiceFrame {
  schemaVersion: 1; location: InstallationLocation; policy: OllamaPolicy; attempt: OllamaAttempt; admission: OllamaServiceAdmission;
}
export interface OllamaServiceFact {
  schemaVersion: 1; admissionSha256: string; state: 'launch-admitted' | 'spawned' | 'not-started' | 'closed' | 'ready' | 'unverified';
  endpointOwnership: 'unproven'; code?: number | null | undefined; signal?: string | null | undefined;
}
export const SERVICE_FRAME_LIMIT = 1024 * 1024;
const ajv = new Ajv({ strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const admissionSchema = object({ schemaVersion: { const: 1 }, kind: { const: 'user-session-ollama' }, identitySha256: hash, policySha256: hash,
  inventorySha256: hash, nonce: hash, retained: { const: true } });
const frameValidator = ajv.compile<OllamaServiceFrame>(object({ schemaVersion: { const: 1 }, location: installerSchemas.location,
  policy: { type: 'object' }, attempt: { type: 'object' }, admission: admissionSchema }));
const admissionValidator = ajv.compile<OllamaServiceAdmission>(admissionSchema);
const factValidator = ajv.compile<OllamaServiceFact>(object({ schemaVersion: { const: 1 }, admissionSha256: hash,
  state: { enum: ['launch-admitted', 'spawned', 'not-started', 'closed', 'ready', 'unverified'] }, endpointOwnership: { const: 'unproven' },
  code: { type: ['integer', 'null'] }, signal: { type: ['string', 'null'], maxLength: 32 } }, ['schemaVersion', 'admissionSha256', 'state', 'endpointOwnership']));
export function servicePaths(record: string) {
  const base = record.replace(/\.json$/, '');
  return { admission: `${base}.service.json`, frame: `${base}.service-input.json`, lock: `${base}.service.lock`,
    launch: `${base}.service-launch.json`, running: `${base}.service-running.json`, exit: `${base}.service-exit.json`, result: `${base}.service-result.json`, logError: `${base}.service-log-error.json` };
}
export function serviceAdmission(attempt: OllamaAttempt, inventorySha256: string, nonce: string): OllamaServiceAdmission {
  return parseDevRecord(admissionValidator, { schemaVersion: 1, kind: 'user-session-ollama', identitySha256: digest(canonicalJson(attempt.identity)),
    policySha256: attempt.identity.policySha256, inventorySha256, nonce, retained: true });
}
export function parseServiceFrame(input: unknown): OllamaServiceFrame {
  const frame = parseDevRecord(frameValidator, input, SERVICE_FRAME_LIMIT);
  frame.policy = parseOllamaPolicy(frame.policy); frame.attempt = parseOllamaAttempt(frame.location, frame.policy, frame.attempt);
  const expected = serviceAdmission(frame.attempt, frame.admission.inventorySha256, frame.admission.nonce);
  if (canonicalJson(expected) !== canonicalJson(frame.admission)) throw dependencyUncertain('Retained service admission binding differs'); return frame;
}
export function serviceFact(admission: OllamaServiceAdmission, state: OllamaServiceFact['state'], extra: Pick<OllamaServiceFact, 'code' | 'signal'> = {}): OllamaServiceFact {
  return parseDevRecord(factValidator, { schemaVersion: 1, admissionSha256: digest(canonicalJson(admission)), state, endpointOwnership: 'unproven', ...extra });
}
export function parseServiceFact(admission: OllamaServiceAdmission, input: unknown): OllamaServiceFact {
  const fact = parseDevRecord(factValidator, input);
  if (fact.admissionSha256 !== digest(canonicalJson(admission))) throw dependencyUncertain('Retained service fact binding differs'); return fact;
}
export function serviceJson(bytes: Buffer): unknown {
  try { const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes), parsed: unknown = JSON.parse(value);
    if (canonicalJson(parsed) !== value) throw new Error('Noncanonical service evidence'); return parsed;
  } catch (cause) { throw dependencyUncertain('Malformed retained service evidence', cause); }
}
