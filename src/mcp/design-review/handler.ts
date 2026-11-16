import type { Socket } from 'node:net';
import type { StepClient } from '../../shared/step-context.js';
import type { StepMcpEnvelope } from '../forward-step.js';
import { errorEnvelope } from '../forward-step.js';
import { reviewUnavailable } from '../../workflow/review-unavailable.js';

/** Compatibility only: unavailable calls never connect or resolve a repository. */
export class DesignReviewConnections {
 constructor(_deps: { connect?: (() => Socket) | undefined; resolveRepo?: ((repo: string | undefined) => Promise<string | undefined>) | undefined } = {}) {}
 close(): void {}
 async call(_raw: Record<string, unknown>, _client?: StepClient, _signal?: AbortSignal): Promise<StepMcpEnvelope> {
  try { return reviewUnavailable('design'); }
  catch (error) { return errorEnvelope('review-unavailable', 'DesignReviewError', (error as Error).message, false); }
 }
}
