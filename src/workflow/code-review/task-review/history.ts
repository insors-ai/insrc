/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { artifactJsonPath, codeReviewArtifactId } from '../../storage.js';
import { reviewJsonLimit, requireReview } from './contracts.js';
import { validateTaskBody,hasPreservedReviewFailures } from './record.js';
import type { TaskReviewBody } from './record.js';

/** Permanent history only: safe after working checkpoint cleanup, with no
 * sources, inference, recovery or implicit format migration. */
export async function readTaskReviewHistory(project: string, hash: string, storyId: string): Promise<TaskReviewBody> {
 const file = await open(artifactJsonPath(project, codeReviewArtifactId(hash, storyId)), constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const stat = await file.stat(); requireReview(stat.isFile() && stat.size <= reviewJsonLimit(), 'CR', 'Expected bounded permanent CR');
  const raw = JSON.parse(await file.readFile('utf8')) as { meta?: { schemaVersion?: unknown }; body?: unknown };
  requireReview(raw.meta?.schemaVersion === 2 || raw.meta?.schemaVersion === 3, 'CR', 'Unsupported permanent CR version');
  const body = validateTaskBody(raw.body);
  requireReview(body.storyId === storyId && (raw.meta.schemaVersion === 3) === hasPreservedReviewFailures(body), 'CR', 'Permanent CR scope or capability mismatch');
  return body;
 } finally { await file.close(); }
}
