import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ToolFailure, ToolFailureKind } from '../../../daemon/tools/types.js';
import { GhCommandError } from '../github.js';
import { ToolDenied, bestEffortMaySwallow, errorOfFailure, isToolDenied, throwFailure } from '../tool-denied.js';

const KINDS: readonly ToolFailureKind[] = ['missing-tool', 'missing-signin', 'unreachable', 'timed-out', 'rejected', 'conversion-failed', 'schema-mismatch', 'denied'];
const failure = (kind: ToolFailureKind): ToolFailure => ({ kind, message: `m-${kind}`, ...(kind === 'denied' ? { denial: 'no-client' as const } : {}) });

describe('tool-denied: every ToolFailureKind maps to the old kind or ToolDenied; conversion-failed and schema-mismatch never become a best-effort value', () => {
	const expected: Record<string, string> = {
		'missing-tool': 'missing-tool', 'missing-signin': 'missing-signin', 'unreachable': 'unreachable', 'timed-out': 'unreachable',
		'rejected': 'rejected', 'conversion-failed': 'rejected', 'schema-mismatch': 'rejected',
	};

	for (const kind of KINDS.filter(k => k !== 'denied')) {
		it(`maps ${kind} to GhCommandError '${expected[kind]}' with the tool's message`, () => {
			const err = errorOfFailure('gh_issue_view', failure(kind));
			assert.ok(err instanceof GhCommandError);
			assert.equal(err.kind, expected[kind]);
			assert.equal(err.reason, `m-${kind}`);
		});
	}

	it('maps denied to a ToolDenied carrying the tool id and the denial reason', () => {
		const err = errorOfFailure('git_push', failure('denied'), { phase: 'push', committed: true });
		assert.ok(isToolDenied(err));
		assert.equal((err as ToolDenied).toolId, 'git_push');
		assert.equal((err as ToolDenied).reason, 'no-client');
		assert.equal((err as ToolDenied).detail.committed, true);
	});

	it('a denied failure without a denial field is reported as declined', () => {
		const err = errorOfFailure('git_push', { kind: 'denied', message: 'x' });
		assert.ok(isToolDenied(err));
		assert.equal((err as ToolDenied).reason, 'declined');
	});

	it('a best-effort row may swallow only the gh failures, never denied, conversion-failed or schema-mismatch', () => {
		const swallowed = KINDS.filter(k => bestEffortMaySwallow(failure(k)));
		assert.deepEqual(swallowed, ['missing-tool', 'missing-signin', 'unreachable', 'timed-out', 'rejected']);
	});

	it('every ToolFailureKind has a mapping', () => {
		for (const kind of KINDS) assert.doesNotThrow(() => errorOfFailure('t', failure(kind)));
	});

	it('throwFailure throws a ToolDenied carrying the reason for denied', () => {
		assert.throws(() => throwFailure('git_commit', failure('denied'), { phase: 'commit', stagedPaths: ['a.md'] }), (err: unknown) => {
			assert.ok(isToolDenied(err));
			assert.equal((err as ToolDenied).reason, 'no-client');
			assert.deepEqual((err as ToolDenied).detail.stagedPaths, ['a.md']);
			return true;
		});
	});

	it('throwFailure throws GhCommandError for every other kind, so no best-effort value can come from conversion-failed or schema-mismatch', () => {
		for (const kind of KINDS.filter(k => k !== 'denied')) {
			assert.throws(() => throwFailure('gh_issue_view', failure(kind)), (err: unknown) => err instanceof GhCommandError && err.kind === expected[kind]);
		}
	});
});
