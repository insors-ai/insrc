/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { Ajv } from 'ajv';
import { ledgerRecordV1Schema } from './schemas.js';
import { USAGE_LIMITS, USAGE_SOURCE_DOMAIN } from './types.js';

export class UsageInputError extends Error {
  constructor(readonly code: 'invalid-input' | 'resource-limit', readonly path: string) {
    super(`${code}: ${path || '/'}`);
    this.name = 'UsageInputError';
  }
}
const validShape = new Ajv({ strict: false, useDefaults: false, removeAdditional: false }).compile(ledgerRecordV1Schema);
const pointer = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1');

/**
 * Central object-to-JSON boundary. Bounds traversal, buffers and emitted bytes;
 * V8's initial own-key enumeration can allocate in proportion to the supplied
 * object's properties. Callers pass objects directly and must not pre-serialize.
 * Descriptors are inspected before any property value is read.
 */
export function canonicalData(value: unknown, maxBytes: number = USAGE_LIMITS.sourceBytes): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > USAGE_LIMITS.groupBytes) {
    throw new UsageInputError('resource-limit', '');
  }
  const chunks: string[] = [], active = new Set<object>();
  let bytes = 0, nodes = 0;
  const fail = (path: string): never => { throw new UsageInputError('invalid-input', path); };
  const limit = (path: string): never => { throw new UsageInputError('resource-limit', path); };
  const emit = (chunk: string, path: string): void => {
    bytes += Buffer.byteLength(chunk, 'utf8');
    if (bytes > maxBytes) limit(path);
    chunks.push(chunk);
  };
  const string = (part: string, path: string): void => {
    // Bound work before scanning Unicode or allocating an escaped string.
    if (part.length > maxBytes) limit(path);
    for (let i = 0; i < part.length; i++) {
      const unit = part.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = part.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) fail(path);
      } else if (unit >= 0xdc00 && unit <= 0xdfff) fail(path);
    }
    emit(JSON.stringify(part), path);
  };
  const visit = (item: unknown, depth: number, path: string): void => {
    if (++nodes > USAGE_LIMITS.nodes || depth > USAGE_LIMITS.depth) limit(path);
    if (item === null) { emit('null', path); return; }
    if (typeof item === 'string') { string(item, path); return; }
    if (typeof item === 'boolean') { emit(String(item), path); return; }
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) fail(path);
      emit(JSON.stringify(item), path); return;
    }
    if (typeof item !== 'object' || types.isProxy(item)) fail(path);
    const object = item as object;
    const array = Array.isArray(object);
    const prototype = Object.getPrototypeOf(object);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail(path);
    if (active.has(object)) fail(path);
    active.add(object);
    // Array length is a non-accessor own property. Reject oversized arrays
    // before enumerating their keys; arbitrary objects have no size primitive.
    if (array && Object.getOwnPropertyDescriptor(object, 'length')!.value > USAGE_LIMITS.referenceItems) limit(path);
    // Required to detect non-enumerable and symbol properties as well. The
    // engine allocation here is explicitly outside our bounded bookkeeping.
    const keys = Reflect.ownKeys(object);
    if (keys.length > USAGE_LIMITS.nodes) limit(path);
    let keyCharacters = 0;
    // A single bounded descriptor at a time avoids copying an oversized graph.
    const descriptors = new Map<string, PropertyDescriptor>();
    for (const key of keys) {
      if (typeof key !== 'string') return fail(path);
      // Check constant-time lengths before descriptor lookup, sorting, regexes
      // or path escaping can scan attacker-controlled property names.
      if (array) {
        if (key.length > maxBytes) limit(path);
        if (key !== 'length' && key.length > String(USAGE_LIMITS.referenceItems - 1).length) fail(path);
      } else {
        keyCharacters += key.length;
        if (keyCharacters > maxBytes) limit(path);
      }
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !('value' in descriptor) || (!(array && key === 'length') && !descriptor.enumerable)) fail(path);
      descriptors.set(key as string, descriptor!);
    }
    if (array) {
      const length = descriptors.get('length')!.value as number;
      if (length > USAGE_LIMITS.referenceItems) limit(path);
      if (keys.length !== length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length))) fail(path);
      emit('[', path);
      for (let i = 0; i < length; i++) {
        if (i) emit(',', path);
        visit(descriptors.get(String(i))!.value, depth + 1, `${path}/${i}`);
      }
      emit(']', path);
    } else {
      emit('{', path);
      let first = true;
      for (const key of (keys as string[]).sort()) {
        if (!first) emit(',', path);
        first = false;
        string(key, path); emit(':', path);
        visit(descriptors.get(key)!.value, depth + 1, `${path}/${pointer(key)}`);
      }
      emit('}', path);
    }
    active.delete(object);
  };
  visit(value, 0, '');
  return chunks.join('');
}

/** Safely copy the whole envelope before excluding the three service fields. */
export function canonicalSource(record: unknown): string {
  // The source has its own 16 KiB bound; the fixed service fields need a small
  // bounded allowance during the first traversal so an exactly-full source fits.
  const snapshot = JSON.parse(canonicalData(record, USAGE_LIMITS.sourceBytes + 1024)) as Record<string, unknown>;
  if (!validShape(snapshot)) throw new UsageInputError('invalid-input', validShape.errors?.[0]?.instancePath ?? '');
  delete snapshot.sequence;
  delete snapshot.recordedAt;
  delete snapshot.payloadDigest;
  return canonicalData(snapshot);
}

export function sourceDigest(record: unknown): string {
  return createHash('sha256').update(USAGE_SOURCE_DOMAIN, 'utf8').update(canonicalSource(record), 'utf8').digest('hex');
}

/** Equality is source equality, never server sequence/time ordering. */
export function sameSource(left: unknown, right: unknown): boolean {
  return canonicalSource(left) === canonicalSource(right);
}
