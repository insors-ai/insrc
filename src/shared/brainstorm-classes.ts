/**
 * Brainstorm sub-category classification.
 *
 * Each category routes to a different sub-controller with category-
 * specific prompts and spec templates. The class list is fed to the
 * generic classifier; the type is the single source of truth shared
 * with daemon/controllers and agent/tasks/brainstorm.
 */

import type { ClassChoice } from './classify.js';

export type BrainstormCategory =
  | 'requirements'
  | 'design'
  | 'implementation'
  | 'testing'
  | 'general';

export interface BrainstormCategoryClass extends ClassChoice {
  readonly id: BrainstormCategory;
}

export const BRAINSTORM_CATEGORY_CLASSES: readonly BrainstormCategoryClass[] = [
  {
    id: 'requirements',
    description: 'user wants to brainstorm WHAT to build -- specs, user stories, acceptance criteria, scope decisions',
  },
  {
    id: 'design',
    description: 'user wants to brainstorm architectural shape -- modules, interfaces, data flow, API contracts, tradeoffs',
  },
  {
    id: 'implementation',
    description: 'user wants to brainstorm HOW to build it -- code approaches, libraries, refactor strategies, tasks / phases',
  },
  {
    id: 'testing',
    description: 'user wants to brainstorm how to test something -- scenarios, test types, assertions, coverage gaps, flaky risks',
  },
  {
    id: 'general',
    description: 'open-ended exploration that does not fit the four structured categories -- hackathon ideas, product direction, creative framing',
  },
];

const _exhaustivenessCheck: Record<BrainstormCategory, true> = {
  requirements: true, design: true, implementation: true, testing: true, general: true,
};
void _exhaustivenessCheck;
