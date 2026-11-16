/** Read-only historical review compatibility. No live review execution. */
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import type { Hash } from 'node:crypto';
/** Existing task-identity canonical bytes, streamed. Large committed document
 * strings must not be copied into one escaped JSON string merely to hash them.
 * Source bodies are never valid identity metadata. */
function string(hash: Hash, value: string): void {
    hash.update('"');
    for (let offset = 0; offset < value.length;) {
        let end = Math.min(value.length, offset + 2048);
        if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff)
            end++;
        hash.update(JSON.stringify(value.slice(offset, end)).slice(1, -1));
        offset = end;
    }
    hash.update('"');
}
function update(hash: Hash, value: unknown): void {
    if (typeof value === 'string') {
        string(hash, value);
        return;
    }
    if (value instanceof Uint8Array)
        throw new Error('Task identity cannot serialize source bytes');
    if (Array.isArray(value)) {
        hash.update('[');
        for (let i = 0; i < value.length; i++) {
            if (i)
                hash.update(',');
            update(hash, value[i]);
        }
        hash.update(']');
        return;
    }
    if (value !== null && typeof value === 'object') {
        hash.update('{');
        let first = true;
        for (const key of Object.keys(value).sort((a, b) => a < b ? -1 : a > b ? 1 : 0)) {
            const child: unknown = Reflect.get(value, key);
            if (child === undefined)
                continue;
            if (!first)
                hash.update(',');
            first = false;
            string(hash, key);
            hash.update(':');
            update(hash, child);
        }
        hash.update('}');
        return;
    }
    // Match the prior canonical array join semantics for undefined entries.
    if (value !== undefined)
        hash.update(JSON.stringify(value));
}
export function canonicalTaskDigest(value: unknown): string {
    if (value === undefined)
        throw new TypeError('Cannot hash undefined task metadata');
    const hash = createHash('sha256');
    update(hash, value);
    return hash.digest('hex');
}
