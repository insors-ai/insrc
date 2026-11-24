/** Private dev-delivery metadata. No application boot, filesystem writes or Git. */
import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { posix, win32 } from 'node:path';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import type { Delivery, HookReference, ReleaseManifest, RuntimeIdentity, Target } from './contracts.js';
import type { PreparedCandidate } from './bundle.js';
import { assertRelativeFile, normalizeHome } from './location.js';
import { BUNDLE_LIMITS, canonicalJson, digest, parseInventory } from './release-descriptor.js';
import type { PayloadInventory } from './release-descriptor.js';
import { installerSchemas, parseInstaller, parseReleaseManifest } from './schemas.js';
import { runtimeArchive } from './runtime-policy.js';

export interface DevSourceIntent {
  kind: 'dev-source'; delivery: Extract<Delivery, { mode: 'dev' }>; sourceCommit: string;
  target: Target; runtime: RuntimeIdentity; recipeVersion: 'dev-v1';
}
export interface DevSourceOffer extends DevSourceIntent { releaseId: string; sourceSha256: string }
export interface DevPreparationRecord {
  schemaVersion: 1; installationId: string; operationId: string; sourceOffer: DevSourceOffer;
  predecessorId?: string | undefined; attemptId: string; workerNonce: string;
  checkoutRelativePath: string; stageRelativePath: string; coordinatorRunId?: string | undefined;
  stage: 'accepted' | 'building' | 'prepared' | 'failed' | 'cancelled'; resultRelativePath?: string | undefined;
}
export interface PreparationContext {
  operationId: string; signal?: AbortSignal | undefined;
  readCheckpoint(): DevPreparationRecord | undefined;
  checkpoint(record: DevPreparationRecord): void;
}
export interface DevReleaseReceipt {
  schemaVersion: 1; mode: 'dev'; sourceOffer: DevSourceOffer; manifest: ReleaseManifest;
  inventorySha256: string; checkoutRelativePath: string;
}

export const devHashSchema = { type: 'string', pattern: '^[a-f0-9]{64}$' };
export const devTokenSchema = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' };
export const devNonceSchema = { type: 'string', minLength: 32, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' };
export const devObjectSchema = (properties: Record<string, object>, required = Object.keys(properties)) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const pathSchema = { type: 'string', minLength: 1, maxLength: 1024 };
const intentProperties = {
  kind: { const: 'dev-source' }, delivery: installerSchemas.delivery,
  sourceCommit: { type: 'string', pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' },
  target: installerSchemas.target, runtime: installerSchemas.runtime, recipeVersion: { const: 'dev-v1' },
};
export const devSourceOfferSchema = devObjectSchema({ ...intentProperties, releaseId: devTokenSchema, sourceSha256: devHashSchema });
const checkpointProperties = {
  schemaVersion: { const: 1 }, installationId: devTokenSchema, operationId: devTokenSchema,
  sourceOffer: devSourceOfferSchema, predecessorId: devTokenSchema, attemptId: devTokenSchema, workerNonce: devNonceSchema,
  checkoutRelativePath: pathSchema, stageRelativePath: pathSchema, coordinatorRunId: devTokenSchema,
  stage: { enum: ['accepted', 'building', 'prepared', 'failed', 'cancelled'] }, resultRelativePath: pathSchema,
};
export const devPreparationSchema = devObjectSchema(checkpointProperties,
  Object.keys(checkpointProperties).filter(key => !['predecessorId', 'coordinatorRunId', 'resultRelativePath'].includes(key)));
const ajv = new Ajv({ strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const intentValidator = ajv.compile<DevSourceIntent>(devObjectSchema(intentProperties));
const offerValidator = ajv.compile<DevSourceOffer>(devSourceOfferSchema);
const checkpointValidator = ajv.compile<DevPreparationRecord>(devPreparationSchema);
const pathIdentityValidator = ajv.compile(devObjectSchema({ operationId: devTokenSchema, attemptId: devTokenSchema }));
const receiptValidator = ajv.compile<DevReleaseReceipt>(devObjectSchema({ schemaVersion: { const: 1 }, mode: { const: 'dev' },
  sourceOffer: devSourceOfferSchema, manifest: installerSchemas.manifest, inventorySha256: devHashSchema, checkoutRelativePath: pathSchema }));
const hooksValidator = ajv.compile<{ schemaVersion: 1; migrations: HookReference[] }>(devObjectSchema({
  schemaVersion: { const: 1 }, migrations: { type: 'array', maxItems: 512, items: installerSchemas.hook },
}));

/** Copy validated input so the caller cannot mutate an accepted identity later. */
export function parseDevRecord<T>(validator: ValidateFunction<T>, input: unknown, limit = MAX_CONTROL_BYTES): T {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(input); } catch { throw new InstallerError('schema-invalid', 'Expected bounded dev metadata'); }
  if (!encoded || Buffer.byteLength(encoded) > limit) throw new InstallerError('schema-invalid', 'Dev metadata exceeds its byte limit');
  const value: unknown = JSON.parse(encoded);
  if (!validator(value)) throw new InstallerError('schema-invalid', `Invalid dev metadata: ${ajv.errorsText(validator.errors)}`);
  return value;
}

/** Argument-array Git sources only: no helpers, options, credentials or relative paths. */
export function parseDevDelivery(input: unknown): Extract<Delivery, { mode: 'dev' }> {
  const delivery = structuredClone(parseInstaller('delivery', input));
  if (delivery.mode !== 'dev') throw new InstallerError('source-invalid', 'Expected explicit development delivery');
  const { repository, branch } = delivery;
  if (/^[\s-]|[\u0000-\u001f\u007f]/.test(repository) || repository.includes('::')) throw new InstallerError('source-invalid', 'Unsupported Git source');
  if (/^[a-z]:[\\/]/i.test(repository) || repository.startsWith('/')) {
    delivery.repository = normalizeHome(repository, /^[a-z]:/i.test(repository) ? 'win32' : 'linux');
  } else if (/^[^/@:]+@[^/:]+:[^\s]+$/.test(repository)) {
    // Ordinary scp-style SSH Git source. Credentials remain with Git/SSH.
  } else {
    if (/\s/.test(repository)) throw new InstallerError('source-invalid', 'Unsupported Git source');
    let url: URL;
    try { url = new URL(repository); } catch { throw new InstallerError('source-invalid', 'Git source must be an absolute local path, HTTPS or SSH'); }
    if (!['https:', 'ssh:'].includes(url.protocol) || !url.hostname || url.password || url.hash || url.search
      || (url.protocol === 'https:' && url.username) || url.pathname === '/') throw new InstallerError('source-invalid', 'Unsupported Git source URL');
  }
  if (branch.startsWith('-') || branch.startsWith('/') || branch.endsWith('/') || branch.endsWith('.')
    || /[\u0000-\u0020\u007f~^:?*\[\\]/.test(branch) || branch.includes('..') || branch.includes('@{') || branch.includes('//')
    || branch.split('/').some(part => part.startsWith('.') || part.endsWith('.lock'))) throw new InstallerError('source-invalid', 'Expected a branch name, not a Git option or revision expression');
  return delivery;
}

function parseIntent(input: unknown): DevSourceIntent {
  const intent = parseDevRecord(intentValidator, input);
  intent.delivery = parseDevDelivery(intent.delivery);
  // Reuse manifest validation for exact target/runtime correspondence and executable layout.
  parseReleaseManifest({ schemaVersion: 1, releaseId: 'dev-validation', sourceCommit: intent.sourceCommit,
    target: intent.target, runtime: intent.runtime, payloadSha256: '0'.repeat(64), daemonEntry: 'out/daemon/index.js',
    managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors: [], migrations: [] });
  if (intent.runtime.sha256 !== runtimeArchive(intent.target).sha256) throw new InstallerError('runtime-invalid', 'Dev runtime differs from the pinned target archive');
  return intent;
}

export function createDevSourceOffer(input: DevSourceIntent): DevSourceOffer {
  const intent = parseIntent(input), sourceSha256 = digest(canonicalJson(intent));
  return { ...intent, sourceSha256, releaseId: `dev-${sourceSha256.slice(0, 48)}` };
}
export function parseDevSourceOffer(input: unknown): DevSourceOffer {
  const value = parseDevRecord(offerValidator, input);
  const { releaseId, sourceSha256, ...intent } = value, expected = createDevSourceOffer(intent);
  if (releaseId !== expected.releaseId || sourceSha256 !== expected.sourceSha256) throw new InstallerError('identity-mismatch', 'Dev source digest or release identity differs');
  return expected;
}

export function devPreparationPaths(operationId: string, attemptId: string): { checkoutRelativePath: string; stageRelativePath: string; resultRelativePath: string } {
  // Parse tokens via the same bounded schema used by checkpoints before interpolating.
  parseDevRecord(pathIdentityValidator, { operationId, attemptId });
  const checkoutRelativePath = `dev/checkouts/${attemptId}`;
  const paths = { checkoutRelativePath, stageRelativePath: `install/staging/${operationId}-${attemptId}`,
    resultRelativePath: `${checkoutRelativePath}/.insrc/tmp/dev-preparation/result.json` };
  for (const path of Object.values(paths)) assertRelativeFile(path);
  return paths;
}
export function parseDevPreparation(input: unknown): DevPreparationRecord {
  const record = parseDevRecord(checkpointValidator, input);
  record.sourceOffer = parseDevSourceOffer(record.sourceOffer);
  const paths = devPreparationPaths(record.operationId, record.attemptId);
  for (const key of ['checkoutRelativePath', 'stageRelativePath', 'resultRelativePath'] as const) {
    if (record[key] !== undefined && record[key] !== paths[key]) throw new InstallerError('identity-mismatch', 'Preparation path differs from its owned attempt');
  }
  if (record.stage !== 'accepted' && (!record.coordinatorRunId || !record.resultRelativePath)) throw new InstallerError('schema-invalid', 'Admitted preparation requires run and result identity');
  if (record.predecessorId === record.sourceOffer.releaseId) throw new InstallerError('source-incompatible', 'Candidate cannot be its own predecessor');
  return record;
}

export function parseDevHooks(input: unknown): HookReference[] {
  if (input === undefined) return [];
  const value = parseDevRecord(hooksValidator, input), seen = new Set<string>();
  for (const hook of value.migrations) {
    parseInstaller('hook', hook); const identity = `${hook.id}\0${hook.version}`;
    if (seen.has(identity)) throw new InstallerError('manifest-invalid', 'Duplicate commit migration reference');
    seen.add(identity);
  }
  return value.migrations;
}

export function parseDevReleaseReceipt(input: unknown): DevReleaseReceipt {
  const receipt = parseDevRecord(receiptValidator, input, BUNDLE_LIMITS.descriptorBytes);
  receipt.sourceOffer = parseDevSourceOffer(receipt.sourceOffer);
  const offer = receipt.sourceOffer, manifest = parseReleaseManifest(receipt.manifest, { target: offer.target });
  assertRelativeFile(receipt.checkoutRelativePath);
  if (!/^dev\/checkouts\/[^/]+$/.test(receipt.checkoutRelativePath)) throw new InstallerError('path-invalid', 'Dev receipt must name one retained checkout');
  const attemptId = receipt.checkoutRelativePath.split('/')[2]!;
  devPreparationPaths('receipt', attemptId);
  if (manifest.releaseId !== offer.releaseId || manifest.sourceCommit !== offer.sourceCommit
    || canonicalJson(manifest.runtime) !== canonicalJson(offer.runtime) || manifest.payloadSha256 !== receipt.inventorySha256
    || manifest.compatiblePredecessors.includes(manifest.releaseId)) throw new InstallerError('candidate-conflict', 'Dev receipt source, manifest or inventory identity differs');
  return receipt;
}

/** Pure metadata reconstruction. Actual immutable file/runtime verification belongs to delivery.open. */
export function devCandidateFromReceipt(directory: string, input: unknown, inventoryInput: unknown): PreparedCandidate {
  const receipt = parseDevReleaseReceipt(input), inventory: PayloadInventory = parseInventory(inventoryInput);
  if (Buffer.byteLength(canonicalJson(inventory)) > BUNDLE_LIMITS.inventoryBytes || inventory.files.some(file => file.path === '.dev-release.json')
    || digest(canonicalJson(inventory)) !== receipt.inventorySha256) throw new InstallerError('candidate-conflict', 'Dev inventory differs from its receipt');
  const root = normalizeHome(directory, receipt.manifest.target.os);
  const path = receipt.manifest.target.os === 'win32' ? win32 : posix;
  if (path.basename(root) !== receipt.manifest.releaseId) {
    throw new InstallerError('candidate-conflict', 'Dev release directory differs from its identity');
  }
  return { releaseId: receipt.manifest.releaseId, directory: root, manifest: receipt.manifest,
    descriptorSha256: digest(canonicalJson(receipt)), payloadSha256: receipt.inventorySha256, inventorySha256: receipt.inventorySha256 };
}

/** Strict mode dispatch shared with installed manager loading in t8. */
export function installedReceiptMode(bundlePresent: boolean, devPresent: boolean): 'bundle' | 'dev' {
  if (bundlePresent === devPresent) throw new InstallerError('candidate-conflict', 'A release must contain exactly one receipt mode');
  return devPresent ? 'dev' : 'bundle';
}
