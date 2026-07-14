/**
 * Scope classification -- single-item vs batch-scope requests.
 * Drives the Pair (single) vs Delegate (batch) agent routing.
 */

import type { ClassChoice } from './classify.js';

export type Scope = 'single' | 'batch';

export interface ScopeClass extends ClassChoice {
  readonly id: Scope;
}

export const SCOPE_CLASSES: readonly ScopeClass[] = [
  {
    id: 'single',
    description: 'a single focused change -- one function, one file, one bug fix, one refactor target. The request names a specific thing to work on.',
  },
  {
    id: 'batch',
    description: 'a request that spans multiple items -- "all files", "every module", "each function", "across the codebase", project-wide cleanup, multi-file lists of 3+ items. Use this when the work requires iterating over many things rather than operating on one.',
  },
];

const _exhaustivenessCheck: Record<Scope, true> = {
  single: true,
  batch: true,
};
void _exhaustivenessCheck;
