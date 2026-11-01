import { existsSync, readFileSync } from 'node:fs';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId } from '../storage.js';
import { inspectTaskCompletion } from './task-review/completion.js';
import { reviewUnavailable } from '../review-unavailable.js';
export interface GateCounts { readonly high: number; readonly med: number; readonly low: number; }
export type CodeReviewGateResult =
 | { readonly status: 'no-review' }
 | { readonly status: 'pass'; readonly counts: GateCounts }
 | { readonly status: 'warn'; readonly counts: GateCounts; readonly message: string; readonly advisory?: boolean }
 | { readonly status: 'blocked'; readonly verdict: 'block'; readonly counts: GateCounts; readonly message: string }
 | { readonly status: 'overridden'; readonly verdict: 'block'; readonly counts: GateCounts; readonly overrideReason: string; readonly at: string };
export interface CodeReviewGateOpts { readonly overrideReview?: string | undefined; readonly checkBuildFreshness?: boolean | undefined; }
/** Only the current task-review record can satisfy this gate. No old-engine fallback. */
export function enforceCodeReviewGate(repoPath: string, epicHash: string, storyId: string, opts?: CodeReviewGateOpts): CodeReviewGateResult {
 const path = artifactJsonPath(repoPath, codeReviewArtifactId(epicHash, storyId));
 if (!existsSync(path)) return { status: 'no-review' };
 const parsed = JSON.parse(readFileSync(path, 'utf8')) as {meta?: {schemaVersion?: unknown}; body?: {format?: unknown}};
 if (parsed.meta?.schemaVersion === 1 || parsed.body?.format !== 'task-based' && parsed.meta?.schemaVersion === undefined) return reviewUnavailable();
 let counts: GateCounts = {high:0,med:0,low:0}; let message: string | undefined;
 try {
  const buildPath = artifactJsonPath(repoPath, buildArtifactId(epicHash, storyId));
  const build = existsSync(buildPath) ? JSON.parse(readFileSync(buildPath, 'utf8')) : undefined;
  const result = inspectTaskCompletion(parsed, build, epicHash, storyId); counts = result.counts; message = result.gap;
 } catch(error) { message = `Invalid task-based CR: ${error instanceof Error ? error.message : String(error)}`; }
 if (!message) return {status:'pass',counts};
 if (opts?.overrideReview?.trim()) return {status:'overridden',verdict:'block',counts,overrideReason:opts.overrideReview,at:new Date().toISOString()};
 return {status:'blocked',verdict:'block',counts,message};
}
