/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Exact JSON byte count for owned JSON metadata, without constructing a whole
 * escaped record. This intentionally refuses source bytes and custom objects. */
export function reviewMetadataJsonBytes(value: unknown): number {
 const ancestors = new Set<object>();
 function text(value: string): number {
  let bytes = 2;
  for (let i = 0; i < value.length; i++) {
   const c = value.charCodeAt(i);
   if (c === 34 || c === 92 || [8, 9, 10, 12, 13].includes(c)) bytes += 2;
   else if (c < 32) bytes += 6;
   else if (c < 128) bytes++;
   else if (c < 2048) bytes += 2;
   else if (c >= 0xd800 && c <= 0xdbff) {
    const next = value.charCodeAt(i + 1);
    if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; i++; } else bytes += 6;
   } else bytes += c >= 0xdc00 && c <= 0xdfff ? 6 : 3;
  }
  return bytes;
 }
 function visit(value: unknown, depth: number): number | undefined {
  if (depth > 128) throw new Error('Review metadata exceeds JSON depth bound');
  if (value === null) return 4;
  if (typeof value === 'string') return text(value);
  if (typeof value === 'number') return JSON.stringify(value).length;
  if (typeof value === 'boolean') return value ? 4 : 5;
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || value instanceof Uint8Array || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || ancestors.has(value)) throw new Error('Expected acyclic review JSON metadata');
  ancestors.add(value);
  try {
   let bytes = 2, count = 0;
   if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { bytes += (count++ ? 1 : 0) + (visit(value[i], depth + 1) ?? 4); }
   } else for (const key in value) if (Object.hasOwn(value, key)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor)) throw new Error('Review JSON accessors are forbidden');
    const size = visit(descriptor.value, depth + 1); if (size !== undefined) bytes += (count++ ? 1 : 0) + text(key) + 1 + size;
   }
   if (!Number.isSafeInteger(bytes)) throw new Error('Review JSON size exceeds representation');
   return bytes;
  } finally { ancestors.delete(value); }
 }
 const size = visit(value, 0); if (size === undefined) throw new Error('Expected review JSON value'); return size;
}
