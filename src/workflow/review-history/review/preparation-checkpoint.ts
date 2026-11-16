/** Read-only historical review compatibility. No live review execution. */
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
export { CodePreparationCheckpointSchema, DesignPreparationCheckpointSchema } from "./preparation-checkpoint-contract.js";
export type { CodePreparationCheckpoint, DesignPreparationCheckpoint } from "./preparation-checkpoint-contract.js";
import { CodePreparationCheckpointSchema, DesignPreparationCheckpointSchema } from "./preparation-checkpoint-contract.js";
import type { CodePreparationCheckpoint, DesignPreparationCheckpoint } from "./preparation-checkpoint-contract.js";
import { Value } from '@sinclair/typebox/value';
import { reviewJsonLimit } from "../../../config/review.js";
import type { ReviewKey } from "../shared/review-resources.js";
import { ReviewKeySchema, validateReviewResourceGuard } from "../shared/review-resources.js";
import { decodeStoredCheckpoint } from "../code-review/task-review/admission-checkpoint.js";
import { decodeStoredDesignCheckpoint } from "./design-review/admission-checkpoint.js";
/** Read-only discriminating codec. Existing execution consumers still refuse
 * v3 until the coordinated cutover; this does not introduce another engine. */
export function decodePreparationCheckpoint(input: unknown, key: ReviewKey) {
    if (!Value.Check(ReviewKeySchema, key))
        throw new Error('Invalid preparation checkpoint key');
    const bytes = JSON.stringify(input);
    if (bytes === undefined || Buffer.byteLength(bytes) > reviewJsonLimit() || !input || typeof input !== 'object')
        throw new Error('Invalid preparation checkpoint');
    const version = Reflect.get(input, 'schemaVersion');
    const current = version === 3;
    if (![1, 2, 3].includes(version))
        throw new Error('Unsupported preparation checkpoint version');
    if (current && !Value.Check(key.family === 'code' ? CodePreparationCheckpointSchema : DesignPreparationCheckpointSchema, input))
        throw new Error('Invalid version-3 checkpoint');
    const { runtime: _runtime, context: _context, migration: _migration, ...history } = input as Record<string, unknown>;
    const legacyInput = current ? { ...history, schemaVersion: 2 } : input;
    const decoded = key.family === 'code' ? decodeStoredCheckpoint(legacyInput) : decodeStoredDesignCheckpoint(legacyInput);
    if (decoded.project !== key.project || decoded.reviewId !== key.reviewId)
        throw new Error('Foreign preparation checkpoint');
    if (current) {
        const migration = (input as CodePreparationCheckpoint | DesignPreparationCheckpoint).migration;
        if (migration) {
            const seen = new Set<number>();
            for (const row of migration.guards) {
                validateReviewResourceGuard(row.guard, key);
                if (seen.has(row.attempt) || row.attempt > decoded.attempts.length || row.guard.openLeases.length)
                    throw new Error('Invalid historical migration guard audit');
                seen.add(row.attempt);
            }
        }
    }
    return current ? { format: 'current' as const, checkpoint: input as CodePreparationCheckpoint | DesignPreparationCheckpoint } : { format: 'historical' as const, checkpoint: decoded };
}
