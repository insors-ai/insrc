/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { CodePreparationCheckpoint, DesignPreparationCheckpoint } from './preparation-checkpoint-contract.js';
import type { StoredReviewCheckpoint } from '../code-review/task-review/contracts.js';
import type { StoredDesignCheckpoint } from './design-review/contracts.js';
export type SemanticPreparationHistory = StoredReviewCheckpoint | StoredDesignCheckpoint;
/** Internal semantic projection only. Operational references and migration
 * audit remain in the canonical record and its permanent preservation proof. */
export function preparationSemanticHistory(input: CodePreparationCheckpoint): StoredReviewCheckpoint;
export function preparationSemanticHistory(input: DesignPreparationCheckpoint): StoredDesignCheckpoint;
export function preparationSemanticHistory(input: CodePreparationCheckpoint | DesignPreparationCheckpoint): SemanticPreparationHistory;
export function preparationSemanticHistory(input: CodePreparationCheckpoint | DesignPreparationCheckpoint): SemanticPreparationHistory {
 const { runtime: _runtime, context: _context, migration: _migration, ...history } = structuredClone(input);
 return { ...history, schemaVersion: 2 } as SemanticPreparationHistory;
}
