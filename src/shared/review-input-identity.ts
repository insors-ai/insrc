/** Pure, versioned review identity codec shared by the daemon and its IPC clients. No stores or filesystem access. */
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import type { ReviewInputFingerprint } from '../workflow/code-review/types.js';

export const REVIEW_INPUT_SCHEMA_VERSION = 1;

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const identityDigest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export function canonicalIdentityJson(value: unknown): string {
 const encoded = JSON.stringify(value, (_key, v: unknown) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
 if (encoded === undefined) throw new Error('Input has no canonical JSON representation');
 return encoded;
}
export function isReviewInputFingerprint(value: unknown): value is ReviewInputFingerprint {
 if (!object(value) || value['schemaVersion'] !== REVIEW_INPUT_SCHEMA_VERSION || typeof value['repoPath'] !== 'string' || !isAbsolute(value['repoPath']) || typeof value['epicHash'] !== 'string' || !/^[a-f0-9]{16}$/.test(value['epicHash']) || typeof value['storyId'] !== 'string' || !/^s[0-9]+$/i.test(value['storyId']) || typeof value['author'] !== 'string' || !['controller', 'daemon', 'unknown'].includes(value['author'])) return false;
 for (const key of ['digest', 'sourceDigest', 'contractDigest', 'buildDigest', 'testsDigest']) if (typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key])) return false;
 const { digest, ...payload } = value;
 return digest === identityDigest(canonicalIdentityJson(payload));
}
