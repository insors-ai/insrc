/** Private shipped policy/offer metadata only. No probes, filesystem writes or launches. */
import { Ajv } from 'ajv';
import { posix, win32 } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation, Target } from './contracts.js';
import type { DependencyOperationContext } from './peer-contracts.js';
import { assertRelativeFile, assertToken, normalizeHome } from './location.js';
import { canonicalJson, digest, httpsUrl } from './release-descriptor.js';
import { installerSchemas } from './schemas.js';
import { parseDevRecord } from './dev.js';
import { requireDependencyOperation } from './dependency-context.js';

export const OLLAMA_LIMITS = Object.freeze({ compressed: 16 * 1024 ** 3, expanded: 64 * 1024 ** 3,
  fileBytes: 8 * 1024 ** 3, files: 200_000, windowBytes: 2 ** 25 });
export interface OllamaPolicy {
  schemaVersion: 1; target: Target; version: string;
  asset: { url: string; sha256: string; bytes: number; format: 'tar.zst' | 'zip' };
  limits: { expandedBytes: number; fileBytes: number; files: number; windowBytes: number };
  layout: { executable: string; requiredFiles: string[]; aliases: Array<{ path: string; target: string; kind: 'file' | 'directory' }> };
  endpoint: string; modelsRelativePath: string; logsRelativePath: string; start: true;
  /** Native evidence binds the material policy; no target is enabled by default. */
  qualification?: { policySha256: string; native: true; evidence: string;
    checks: { version: true; readiness: true; reuse: true; decline: true; userOnly: true } } | undefined;
}
export interface OllamaAbsence { binary: 'missing'; endpoint: 'refused'; destination: 'absent'; searchSha256: string }
export interface OllamaOffer {
  id: string; installationId: string; home: string; target: Target; version: string;
  policySha256: string; destination: string; endpoint: string; modelsDirectory: string; logsDirectory: string;
  start: true; absence: OllamaAbsence;
}
export interface DependencyAttemptIdentity {
  schemaVersion: 1; installationId: string; operationId: string; attemptNonce: string; offerId: string;
  policySha256: string; payloadRelativePath: string; stageRelativePath: string; recordRelativePath: string;
}
const object = (properties: Record<string, object>, required = Object.keys(properties)) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const path = { type: 'string', minLength: 1, maxLength: 1024 };
const integer = (maximum: number) => ({ type: 'integer', minimum: 1, maximum });
const yes = { const: true };
const ajv = new Ajv({ strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const policyValidator = ajv.compile<OllamaPolicy>(object({ schemaVersion: { const: 1 }, target: installerSchemas.target,
  version: { type: 'string', maxLength: 128, pattern: '^\\d+\\.\\d+\\.\\d+(?:-[A-Za-z0-9.-]+)?$' },
  asset: object({ url: { type: 'string', minLength: 1, maxLength: 4096 }, sha256: hash,
    bytes: integer(OLLAMA_LIMITS.compressed), format: { enum: ['tar.zst', 'zip'] } }),
  limits: object({ expandedBytes: integer(OLLAMA_LIMITS.expanded), fileBytes: integer(OLLAMA_LIMITS.fileBytes),
    files: integer(OLLAMA_LIMITS.files), windowBytes: integer(OLLAMA_LIMITS.windowBytes) }),
  layout: object({ executable: path, requiredFiles: { type: 'array', minItems: 1, maxItems: 4096, uniqueItems: true, items: path },
    aliases: { type: 'array', maxItems: 4096, items: object({ path, target: path, kind: { enum: ['file', 'directory'] } }) } }),
  endpoint: { type: 'string', minLength: 1, maxLength: 256 }, modelsRelativePath: path, logsRelativePath: path, start: yes,
  qualification: object({ policySha256: hash, native: yes, evidence: path,
    checks: object({ version: yes, readiness: yes, reuse: yes, decline: yes, userOnly: yes }) }),
}, ['schemaVersion', 'target', 'version', 'asset', 'limits', 'layout', 'endpoint', 'modelsRelativePath', 'logsRelativePath', 'start']));
const absenceValidator = ajv.compile<OllamaAbsence>(object({ binary: { const: 'missing' }, endpoint: { const: 'refused' },
  destination: { const: 'absent' }, searchSha256: hash }));

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** Reuse the installer's bounded, strict copied-record parser. */
function bounded<T>(validator: import('ajv').ValidateFunction<T>, input: unknown): T {
  try { return parseDevRecord(validator, input, 1024 * 1024); }
  catch (cause) { throw new InstallerError('dependency-policy-invalid', 'Invalid bounded dependency policy metadata', { cause }); }
}
export function ollamaPolicySha256(input: Omit<OllamaPolicy, 'qualification'>): string {
  // Qualification cannot hash itself. All effective install/start side effects remain bound.
  const { qualification: _qualification, ...material } = input as OllamaPolicy;
  return digest(canonicalJson(material));
}
export function ollamaEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new InstallerError('dependency-policy-invalid', 'Expected a local Ollama HTTP endpoint'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !url.port
    || /[\u0000-\u0020\u007f]/.test(value)) throw new InstallerError('dependency-policy-invalid', 'Ollama endpoint must be explicit loopback HTTP');
  return url.origin;
}
export function parseOllamaPolicy(input: unknown): OllamaPolicy {
  const policy = bounded(policyValidator, input), url = httpsUrl(policy.asset.url);
  const assetName = url.pathname.split('/').at(-1) ?? '';
  if (url.origin !== 'https://github.com' || url.search || url.href !== policy.asset.url
    || url.pathname !== `/ollama/ollama/releases/download/v${policy.version}/${assetName}`
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(assetName)
    || (policy.target.os === 'linux') !== (policy.asset.format === 'tar.zst')
    || !url.pathname.endsWith(policy.asset.format === 'zip' ? '.zip' : '.tar.zst')
    || policy.limits.fileBytes > policy.limits.expandedBytes) {
    throw new InstallerError('dependency-policy-invalid', 'Expected an exact official target payload and consistent limits');
  }
  const names = new Map<string, string>();
  for (const file of policy.layout.requiredFiles) {
    assertRelativeFile(file); const key = file.normalize('NFC').toLowerCase();
    if (names.has(key)) throw new InstallerError('dependency-policy-invalid', 'Colliding required payload paths'); names.set(key, file);
  }
  assertRelativeFile(policy.layout.executable);
  if (!policy.layout.requiredFiles.includes(policy.layout.executable)) throw new InstallerError('dependency-policy-invalid', 'Policy must require its executable');
  const aliases = new Map<string, string>();
  for (const alias of policy.layout.aliases) {
    assertRelativeFile(alias.path); assertRelativeFile(alias.target);
    const key = alias.path.normalize('NFC').toLowerCase();
    if (key === alias.target.normalize('NFC').toLowerCase() || aliases.has(key)
      || (names.has(key) && names.get(key) !== alias.path)) throw new InstallerError('dependency-policy-invalid', 'Conflicting archive alias');
    aliases.set(key, alias.target.normalize('NFC').toLowerCase());
  }
  for (const first of aliases.keys()) {
    const seen = new Set<string>(); let next: string | undefined = first;
    while (next && aliases.has(next)) {
      if (seen.has(next) || seen.size >= 32) throw new InstallerError('dependency-policy-invalid', 'Cyclic or excessive archive alias chain');
      seen.add(next); next = aliases.get(next);
    }
  }
  for (const [file, prefix] of [[policy.modelsRelativePath, 'deps/ollama/data/'], [policy.logsRelativePath, 'deps/ollama/logs/']] as const) {
    assertRelativeFile(file); if (!file.startsWith(prefix)) throw new InstallerError('dependency-policy-invalid', 'Dependency data/logs must stay in their private namespace');
  }
  if (policy.endpoint !== ollamaEndpoint(policy.endpoint)) throw new InstallerError('dependency-policy-invalid', 'Expected canonical endpoint');
  if (policy.qualification) {
    assertRelativeFile(policy.qualification.evidence);
    if (policy.qualification.policySha256 !== ollamaPolicySha256(policy)) throw new InstallerError('dependency-policy-invalid', 'Qualification does not bind this exact policy');
  }
  return freeze(policy);
}
export function ollamaPayloadRelativePath(policy: OllamaPolicy): string {
  const value = `deps/ollama/${policy.version}/${policy.target.os}-${policy.target.arch}/${policy.asset.sha256}`;
  assertRelativeFile(value); return value;
}
/** Called only with the selected shipped policy and freshly observed absence. */
export function createOllamaOffer(location: InstallationLocation, input: unknown, observation: unknown): OllamaOffer | undefined {
  const policy = parseOllamaPolicy(input), absence = bounded(absenceValidator, observation);
  if (!policy.qualification) return undefined;
  assertToken(location.installationId);
  const home = normalizeHome(location.home, policy.target.os), path = policy.target.os === 'win32' ? win32 : posix;
  const material = { installationId: location.installationId, home, target: policy.target, version: policy.version,
    policySha256: ollamaPolicySha256(policy), destination: path.join(home, ollamaPayloadRelativePath(policy)),
    endpoint: policy.endpoint, modelsDirectory: path.join(home, policy.modelsRelativePath), logsDirectory: path.join(home, policy.logsRelativePath),
    start: policy.start, absence };
  return freeze({ id: digest(canonicalJson(material)), ...material });
}
export function dependencyAttemptIdentity(location: InstallationLocation, policyInput: unknown,
  offer: OllamaOffer, context?: DependencyOperationContext): DependencyAttemptIdentity {
  const operation = requireDependencyOperation(location, context), policy = parseOllamaPolicy(policyInput);
  const expected = createOllamaOffer(location, policy, offer.absence);
  if (!expected || canonicalJson(expected) !== canonicalJson(offer)) throw new InstallerError('dependency-offer-stale', 'Dependency offer differs from its policy/installation');
  const stageRelativePath = `deps/ollama/.staging/${operation.operationId}/${operation.attemptNonce}`;
  const recordRelativePath = `deps/ollama/.attempts/${operation.operationId}/${operation.attemptNonce}.json`;
  assertRelativeFile(stageRelativePath); assertRelativeFile(recordRelativePath);
  return freeze({ schemaVersion: 1, installationId: location.installationId, operationId: operation.operationId,
    attemptNonce: operation.attemptNonce, offerId: offer.id, policySha256: offer.policySha256,
    payloadRelativePath: ollamaPayloadRelativePath(policy), stageRelativePath, recordRelativePath });
}
