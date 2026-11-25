/** Bounded dependency evidence, without controller or daemon capabilities. */
import { Ajv } from 'ajv';
import { constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation } from './contracts.js';
import { assertLocalControlRoot, assertRelativeFile } from './location.js';
import { controlBinding } from './native.js';
import { flushDirectory, flushParents } from './durability.js';
import { readBoundedFile } from './safe-zip.js';
import { canonicalJson, digest } from './release-descriptor.js';
import type { PayloadInventory } from './release-descriptor.js';
import { devObjectSchema as object, devHashSchema as hash, devTokenSchema as token, parseDevRecord } from './dev.js';
import { installerSchemas } from './schemas.js';
import { closeOwnedDescriptor } from './owned-file.js';
import { createOllamaOffer, dependencyAttemptPaths, ollamaPayloadRelativePath, ollamaPolicySha256, parseOllamaPolicy, OLLAMA_LIMITS } from './ollama-policy.js';
import type { DependencyAttemptIdentity, OllamaAbsence, OllamaPolicy } from './ollama-policy.js';
export const DEPENDENCY_RECORD_LIMIT = 64 * 1024, DEPENDENCY_INVENTORY_LIMIT = 64 * 1024 * 1024;
interface AttemptIdentity { identity: DependencyAttemptIdentity; absence: OllamaAbsence; actor: 'in-process-preparation'; externalActors: 0 }
export type OllamaAttempt = AttemptIdentity & ({ schemaVersion: 1 } | { schemaVersion: 2; policy: OllamaPolicy;
  lockProtocol: 'in-process-native-v1'; lockIdentity: { device: string; inode: string } });
export interface OllamaClosure { schemaVersion: 1; identitySha256: string; closed: true; outcome: 'prepared' | 'failed' | 'cancelled'; inventorySha256?: string | undefined }
export interface OllamaReceipt { schemaVersion: 1; installationId: string; policySha256: string; assetSha256: string; version: string; target: OllamaPolicy['target']; inventorySha256: string }
const path = { type: 'string', minLength: 1, maxLength: 1024 };
const ajv = new Ajv({ strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const attemptProperties = { identity: object({ schemaVersion: { const: 1 }, installationId: token,
  operationId: token, attemptNonce: { type: 'string', pattern: '^[A-Za-z0-9_-]{32,128}$' }, offerId: hash, policySha256: hash,
  payloadRelativePath: path, stageRelativePath: path, recordRelativePath: path }),
  absence: object({ binary: { const: 'missing' }, endpoint: { const: 'refused' }, destination: { const: 'absent' }, searchSha256: hash }),
  actor: { const: 'in-process-preparation' }, externalActors: { const: 0 } };
const attemptValidator = ajv.compile<OllamaAttempt>({ oneOf: [
  object({ schemaVersion: { const: 1 }, ...attemptProperties }),
  object({ schemaVersion: { const: 2 }, ...attemptProperties, policy: { type: 'object' }, lockProtocol: { const: 'in-process-native-v1' },
    lockIdentity: object({ device: { type: 'string', pattern: '^[0-9]{1,32}$' }, inode: { type: 'string', pattern: '^[0-9]{1,32}$' } }) }),
] });
const closureValidator = ajv.compile<OllamaClosure>(object({ schemaVersion: { const: 1 }, identitySha256: hash, closed: { const: true },
  outcome: { enum: ['prepared', 'failed', 'cancelled'] }, inventorySha256: hash }, ['schemaVersion', 'identitySha256', 'closed', 'outcome']));
const receiptValidator = ajv.compile<OllamaReceipt>(object({ schemaVersion: { const: 1 }, installationId: token, policySha256: hash, assetSha256: hash,
  version: { type: 'string', minLength: 1, maxLength: 128 }, target: installerSchemas.target, inventorySha256: hash }));
const inventoryValidator = ajv.compile<PayloadInventory>(object({ schemaVersion: { const: 1 }, files: { type: 'array', maxItems: OLLAMA_LIMITS.files,
  items: object({ path, bytes: { type: 'integer', minimum: 0, maximum: OLLAMA_LIMITS.fileBytes }, sha256: hash, mode: { enum: [0o644, 0o755] } }) } }));
export const dependencyUncertain = (message: string, cause?: unknown) => new InstallerError('dependency-uncertain', message, { cause });
export function dependencyLockIdentity(file: string): { device: string; inode: string } {
  const info = lstatSync(file, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n
    || (process.platform !== 'win32' && (info.uid !== BigInt(process.getuid!()) || (info.mode & 0o077n)))
    || (process.platform === 'win32' && !controlBinding().safePath(file, false, false))) throw dependencyUncertain('Dependency lock is not private anchored evidence');
  return { device: info.dev.toString(), inode: info.ino.toString() };
}
export function dependencyPath(location: InstallationLocation, name: string): string {
  assertRelativeFile(name); const result = join(location.home, name), part = relative(location.home, result);
  if (part.startsWith('..') || part === '') throw dependencyUncertain('Dependency path escapes its selected home'); return result;
}
/** Never change permissions of an existing namespace. New directories alone are
 * protected, then checked through the platform-native admission on Windows. */
export function ensureDependencyDirectory(location: InstallationLocation, name: string, current: () => void): string {
  current(); checkDependencyParents(location, join(location.home, 'probe'));
  assertRelativeFile(name); let directory = location.home;
  for (const component of name.split('/')) {
    current(); directory = join(directory, component); let created = false;
    try { mkdirSync(directory, { mode: 0o700 }); created = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o077)))) throw dependencyUncertain('Dependency namespace is not a private owned real directory');
    if (created) controlBinding().protect(directory);
    if (process.platform === 'win32' && !controlBinding().safePath(directory, true, true)) throw dependencyUncertain('Dependency namespace has unsafe ACLs or a reparse point');
  }
  flushParents(directory, location.home); current(); return directory;
}
export function checkDependencyParents(location: InstallationLocation, file: string): void {
  assertLocalControlRoot(location.home, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
  const home = lstatSync(location.home);
  if (process.platform !== 'win32' && (home.uid !== process.getuid?.() || (home.mode & 0o022))) throw dependencyUncertain('Dependency home is not owned or admits foreign writes');
  if (process.platform === 'win32') for (let directory = location.home; ; directory = dirname(directory)) {
    if (!controlBinding().safePath(directory, true, false)) throw dependencyUncertain('Dependency home has a reparse ancestor');
    if (dirname(directory) === directory) break;
  }
  const part = relative(location.home, file); assertRelativeFile(part.replaceAll('\\', '/'));
  for (let directory = dirname(file); directory !== location.home; directory = dirname(directory)) {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o077)))
      || (process.platform === 'win32' && !controlBinding().safePath(directory, true, true))) throw dependencyUncertain('Dependency evidence has an unsafe parent');
  }
}
export async function readDependencyRecord(location: InstallationLocation, file: string, limit = DEPENDENCY_RECORD_LIMIT): Promise<Buffer> {
  checkDependencyParents(location, file);
  const info = lstatSync(file);
  if (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077))) throw dependencyUncertain('Dependency evidence is not private');
  if (process.platform === 'win32' && !controlBinding().safePath(file, false, false)) throw dependencyUncertain('Dependency evidence is a reparse point');
  return readBoundedFile(file, limit);
}
export function writeDependencyRecord(location: InstallationLocation, handle: object, file: string, value: unknown, limit = DEPENDENCY_RECORD_LIMIT): void {
  checkDependencyParents(location, file); const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded) > limit || existsSync(file)) throw dependencyUncertain('Dependency evidence is excessive or already admitted');
  const temp = `${file}.${randomUUID()}.tmp`, fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let closed = false;
  try {
    try { writeFileSync(fd, encoded); fsyncSync(fd); } finally { closeOwnedDescriptor(fd); closed = true; }
    // The native same-volume exclusive rename also accepts regular files.
    // A competing target can never be replaced, even after the existence check.
    controlBinding().publishDirectory(handle, temp, file); flushDirectory(dirname(file));
  } catch (cause) {
    if (closed && existsSync(temp)) { unlinkSync(temp); flushDirectory(dirname(file)); }
    if ((cause as { code?: string })?.code === 'resource-close-uncertain') throw cause;
    throw dependencyUncertain('Dependency record publication failed without replacing existing evidence', cause);
  }
}
export function parseOllamaAttempt(location: InstallationLocation, policy: OllamaPolicy, input: unknown): OllamaAttempt {
  const attempt = parseBoundOllamaAttempt(location, input), id = attempt.identity;
  const offer = createOllamaOffer(location, policy, attempt.absence);
  const expected: DependencyAttemptIdentity = { schemaVersion: 1, installationId: location.installationId, operationId: id.operationId, attemptNonce: id.attemptNonce,
    offerId: offer?.id ?? '', policySha256: ollamaPolicySha256(policy), payloadRelativePath: ollamaPayloadRelativePath(policy), ...dependencyAttemptPaths(id.operationId, id.attemptNonce) };
  if (!offer || canonicalJson(id) !== canonicalJson(expected)) throw dependencyUncertain('Dependency attempt identity differs from installation/policy'); return attempt;
}
/** A closed historical attempt need not retain its old shipped policy. This
 * grants closure inspection only, never payload reuse, deletion or startup. */
export function parseBoundOllamaAttempt(location: InstallationLocation, input: unknown): OllamaAttempt {
  const attempt = parseDevRecord(attemptValidator, input, DEPENDENCY_RECORD_LIMIT), id = attempt.identity;
  const paths = dependencyAttemptPaths(id.operationId, id.attemptNonce);
  if (id.installationId !== location.installationId || paths.recordRelativePath !== id.recordRelativePath || paths.stageRelativePath !== id.stageRelativePath
    || !/^deps\/ollama\/\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?\/(?:linux|darwin|win32)-(?:arm64|x64)\/[a-f0-9]{64}$/.test(id.payloadRelativePath)) throw dependencyUncertain('Dependency historical attempt binding differs');
  if (attempt.schemaVersion === 2) {
    attempt.policy = parseOllamaPolicy(attempt.policy);
    const offer = createOllamaOffer(location, attempt.policy, attempt.absence);
    if (!offer || offer.id !== id.offerId || ollamaPolicySha256(attempt.policy) !== id.policySha256
      || ollamaPayloadRelativePath(attempt.policy) !== id.payloadRelativePath) throw dependencyUncertain('Accepted historical policy differs from its attempt');
  }
  return attempt;
}
/** Current catalog is only a compatibility source for exactly matching v1 data. */
export function acceptedOllamaPolicy(attempt: OllamaAttempt, current?: OllamaPolicy): OllamaPolicy {
  if (attempt.schemaVersion === 2) return attempt.policy;
  if (current && ollamaPolicySha256(parseOllamaPolicy(current)) === attempt.identity.policySha256) return current;
  throw dependencyUncertain('Historical dependency policy is unavailable; retain its evidence');
}
export function parseOllamaClosure(identity: DependencyAttemptIdentity, input: unknown): OllamaClosure {
  const closure = parseDevRecord(closureValidator, input, DEPENDENCY_RECORD_LIMIT);
  if (closure.identitySha256 !== digest(canonicalJson(identity)) || (closure.outcome === 'prepared') !== !!closure.inventorySha256) throw dependencyUncertain('Dependency closure identity/outcome differs'); return closure;
}
export function parseOllamaReceipt(input: unknown): OllamaReceipt { return parseDevRecord(receiptValidator, input, DEPENDENCY_RECORD_LIMIT); }
export function parseOllamaInventory(input: unknown): PayloadInventory { return parseDevRecord(inventoryValidator, input, DEPENDENCY_INVENTORY_LIMIT); }
export const closurePath = (file: string) => file.replace(/\.json$/, '.closed.json');
