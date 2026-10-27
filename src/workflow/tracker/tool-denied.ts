/**
 * The denial carrier and the failure mapping for workflow code that calls registry tools (Story s10).
 *
 * A call the user (or a missing client) denied is NOT a gh failure: it is thrown as ToolDenied so that no
 * catch-all on the way (best-effort rows, guarded pushes, fallbacks) can turn it into a value. Every other
 * ToolFailureKind maps to the kind of GhCommandError the old wrappers threw.
 */

import type { ToolDenialReason, ToolFailure, ToolFailureKind } from '../../daemon/tools/types.js';
import { GhCommandError, type GhFailureKind } from './github.js';

/** How far a commit-and-push got when a call was denied. */
export type CommitPhase = 'rev-parse' | 'stage' | 'diff' | 'commit' | 'push';

export interface ToolDeniedDetail {
	/** Reconciliation progress made before the denial (created, changed, withdrawn, added Task ids). */
	readonly partial?: unknown;
	/** Commit-and-push only: the phase that was denied. */
	readonly phase?: CommitPhase | undefined;
	/** Commit-and-push only: true when git_commit had already succeeded. */
	readonly committed?: boolean | undefined;
	/** Commit-and-push only: the paths left staged. */
	readonly stagedPaths?: readonly string[] | undefined;
}

export class ToolDenied extends Error {
	readonly toolId:  string;
	readonly reason:  ToolDenialReason;
	readonly detail:  ToolDeniedDetail;
	constructor(toolId: string, reason: ToolDenialReason, detail: ToolDeniedDetail = {}) {
		super(`${toolId} was denied (${reason})`);
		this.name   = 'ToolDenied';
		this.toolId = toolId;
		this.reason = reason;
		this.detail = detail;
	}
}

export const isToolDenied = (err: unknown): err is ToolDenied => err instanceof ToolDenied;

/** The kinds a best-effort row may turn into its old false, null, [] or undefined: only the gh failures. */
const GH_KIND: Readonly<Record<ToolFailureKind, GhFailureKind | 'denied'>> = {
	'missing-tool':      'missing-tool',
	'missing-signin':    'missing-signin',
	'unreachable':       'unreachable',
	'timed-out':         'unreachable',   // a killed gh was 'unreachable' (classifyGhFailure)
	'rejected':          'rejected',
	'conversion-failed': 'rejected',
	'schema-mismatch':   'rejected',
	'denied':            'denied',
};

/** The error a failed call becomes: ToolDenied for a denial, otherwise the old GhCommandError kind. */
export function errorOfFailure(toolId: string, failure: ToolFailure, detail: ToolDeniedDetail = {}): GhCommandError | ToolDenied {
	const kind = GH_KIND[failure.kind];
	if (kind === 'denied') return new ToolDenied(toolId, failure.denial ?? 'declined', detail);
	return new GhCommandError(kind, failure.message);
}

/** May a best-effort row swallow this failure? Never a denial, a conversion failure or a schema mismatch. */
export function bestEffortMaySwallow(failure: ToolFailure): boolean {
	return failure.kind !== 'denied' && failure.kind !== 'conversion-failed' && failure.kind !== 'schema-mismatch';
}

/** Throw the error a failed call becomes: a denial is thrown as ToolDenied, every other kind as the old GhCommandError. */
export function throwFailure(toolId: string, failure: ToolFailure, detail: ToolDeniedDetail = {}): never {
	throw errorOfFailure(toolId, failure, detail);
}
