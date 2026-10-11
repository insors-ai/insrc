/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import type { GuidanceRecord, ReleaseManifest, ValidationIssue } from './contracts.js';

export const CORPUS_LIMITS = Object.freeze({ recordBytes: 1024 * 1024, packageBytes: 64 * 1024 * 1024, files: 10_000, depth: 64 });
export class CorpusInputError extends Error {
  constructor(readonly code: ValidationIssue['code'], readonly path: string, message: string) { super(message); }
}
const pointer = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function validUnicode(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

/** insrc canonical JSON v1, not an RFC canonicalization implementation. Never invokes toJSON/getters. */
export function canonicalJson(value: unknown, maxBytes = CORPUS_LIMITS.recordBytes): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > CORPUS_LIMITS.packageBytes) {
    throw new CorpusInputError('limit.exceeded', '', 'Invalid canonical byte limit.');
  }
  const chunks: string[] = [], active = new Set<object>();
  let bytes = 0, nodes = 0;
  const fail = (path: string, message: string): never => { throw new CorpusInputError('schema.invalid', path, message); };
  const emit = (part: string, path: string) => {
    bytes += Buffer.byteLength(part, 'utf8');
    if (bytes > maxBytes) throw new CorpusInputError('limit.exceeded', path, 'Canonical JSON exceeds byte limit.');
    chunks.push(part);
  };
  const string = (part: string, path: string) => {
    if (part.length > maxBytes || Buffer.byteLength(part, 'utf8') > maxBytes) {
      throw new CorpusInputError('limit.exceeded', path, 'String exceeds byte limit.');
    }
    if (!validUnicode(part)) fail(path, 'String contains an unpaired surrogate.');
    emit(JSON.stringify(part), path);
  };
  const visit = (item: unknown, depth: number, path: string): void => {
    if (depth > CORPUS_LIMITS.depth || ++nodes > maxBytes) throw new CorpusInputError('limit.exceeded', path, 'JSON traversal limit exceeded.');
    if (item === null) { emit('null', path); return; }
    if (typeof item === 'string') { string(item, path); return; }
    if (typeof item === 'boolean') { emit(String(item), path); return; }
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Math.abs(item) > Number.MAX_SAFE_INTEGER) fail(path, 'Number is not finite or safely representable.');
      emit(JSON.stringify(item), path); return;
    }
    if (typeof item !== 'object') fail(path, 'Expected a JSON value.');
    const obj = item as object;
    const array = Array.isArray(obj);
    if (!array && Object.getPrototypeOf(obj) !== Object.prototype && Object.getPrototypeOf(obj) !== null) fail(path, 'Expected a plain object.');
    if (active.has(obj)) fail(path, 'Cyclic JSON value.');
    active.add(obj);
    const keys = Reflect.ownKeys(obj);
    if (keys.length > maxBytes) throw new CorpusInputError('limit.exceeded', path, 'Too many JSON properties.');
    const descriptors = Object.getOwnPropertyDescriptors(obj);
    for (const key of keys) {
      if (typeof key !== 'string') fail(path, 'Symbol properties are not JSON.');
      const descriptor = descriptors[key as string];
      if (!descriptor || !('value' in descriptor) || (!(array && key === 'length') && !descriptor.enumerable)) fail(path, 'Only enumerable data properties are JSON.');
    }
    if (array) {
      const length = (obj as unknown[]).length;
      if (length > maxBytes) throw new CorpusInputError('limit.exceeded', path, 'Array exceeds traversal limit.');
      if (keys.length !== length + 1 || keys.some(k => k !== 'length' && (typeof k !== 'string' || !/^(0|[1-9]\d*)$/.test(k) || Number(k) >= length))) fail(path, 'Sparse arrays and extra array properties are not JSON.');
      emit('[', path);
      for (let i = 0; i < length; i++) { if (i) emit(',', path); visit(descriptors[String(i)]!.value, depth + 1, `${path}/${i}`); }
      emit(']', path);
    } else {
      emit('{', path);
      (keys as string[]).sort(compare).forEach((key, i) => {
        if (i) emit(',', path);
        string(key, path); emit(':', path); visit(descriptors[key]!.value, depth + 1, `${path}/${pointer(key)}`);
      });
      emit('}', path);
    }
    active.delete(obj);
  };
  visit(value, 0, '');
  return chunks.join('');
}

export const hashBytes = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const hashCanonical = (value: unknown, maxBytes = CORPUS_LIMITS.recordBytes): string => hashBytes(canonicalJson(value, maxBytes));

/** Validates before reading/spreading fields, including fields excluded from the hash. */
export function recordContentDigest(record: GuidanceRecord): string {
  const copy = JSON.parse(canonicalJson(record)) as Record<string, unknown>;
  delete copy['recordVersion']; delete copy['review'];
  return hashCanonical(copy);
}
export function candidateContentDigest(manifest: ReleaseManifest): string {
  const copy = JSON.parse(canonicalJson(manifest, CORPUS_LIMITS.packageBytes)) as ReleaseManifest;
  return hashCanonical({
    records: copy.records.map(({ recordId, recordVersion }) => ({ recordId, recordVersion }))
      .sort((a, b) => compare(a.recordId, b.recordId) || compare(a.recordVersion, b.recordVersion)),
    files: copy.files.filter(f => f.path !== copy.coveragePath).map(({ path, digest }) => ({ path, digest }))
      .sort((a, b) => compare(a.path, b.path)),
  }, CORPUS_LIMITS.packageBytes);
}
export const reviewContentDigest = (envelope: unknown): string => hashCanonical(envelope, CORPUS_LIMITS.packageBytes);
export function releaseContentDigest(manifest: ReleaseManifest): string {
  const copy = JSON.parse(canonicalJson(manifest, CORPUS_LIMITS.packageBytes)) as Record<string, unknown> & ReleaseManifest;
  delete (copy as Record<string, unknown>)['releaseId'];
  copy.records.sort((a, b) => compare(a.recordId, b.recordId) || compare(a.recordVersion, b.recordVersion));
  copy.files.sort((a, b) => compare(a.path, b.path));
  return hashCanonical(copy, CORPUS_LIMITS.packageBytes);
}
