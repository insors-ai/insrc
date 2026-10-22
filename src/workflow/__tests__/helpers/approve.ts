/**
 * TEST HELPER: approve the artifact at `jsonPath` through the lifecycle of the repository that holds it, as the CLI and the daemon do.
 */

import { dirname } from 'node:path';

import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { approveArtifactByJsonPath } from '../../gates.js';
import type { ApprovalResult } from '../../gates.js';

/** The repository root of a head at `<repo>/.insrc/artifacts/<id>.json`. */
export const repoOfHead = (jsonPath: string): string => dirname(dirname(dirname(jsonPath)));

export function approveJson(jsonPath: string, overrideReview?: string): Promise<ApprovalResult> {
	return approveArtifactByJsonPath(jsonPath, { lifecycle: createRepoLifecycle(repoOfHead(jsonPath)).service, ...(overrideReview !== undefined ? { overrideReview } : {}) });
}
