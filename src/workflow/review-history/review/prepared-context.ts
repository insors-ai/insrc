/** Read-only historical review compatibility. No live review execution. */
import { createHash } from 'node:crypto';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export function preparationDigest(value: unknown): string {
    return hash(JSON.stringify(value, (_key, v: unknown) => v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
}
