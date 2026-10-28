/**
 * The callers that commit and push artifacts (Story s10): a denied commit stops the stage and posts no comment, handleResolveComment
 * answers its error result with the recorded count and never success, and an ordinary git failure is logged and the stage goes on.
 * Run: npx tsx --test-force-exit src/workflow/__tests__/commit-denial-callers.test.ts
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setApprovalGateForTests } from '../../daemon/tools/executor.js';
import { _resetRegistryForTests } from '../../daemon/tools/registry.js';
import type { ApprovalGate } from '../../daemon/tools/types.js';
import { cleanup } from '../../daemon/tools/__tests__/_proc.js';
import { installStandInBin } from '../../daemon/tools/__tests__/_bin.js';
import type { StandInBin } from '../../daemon/tools/__tests__/_bin.js';
import { _setWorkflowToolDepsForTests } from '../tracker/registry-table.js';
import { ToolDenied } from '../tracker/tool-denied.js';
import { handleResolveComment } from '../resolve-comment.js';
import type { RecordResolutionFn } from '../resolve-comment.js';
import { recordResolution } from '../questions.js';
import { ARTIFACTS_DIR, lldArtifactId } from '../storage.js';

const HASH = '238917216d8fd532';
const ID = `LLD-${HASH}-s4`;
const decline: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'decline' }; } };

let repo: string;
let ghBin: StandInBin | undefined;
beforeEach(() => {
	_resetRegistryForTests();
	repo = mkdtempSync(join(tmpdir(), 'insrc-commitden-'));
	mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
	writeFileSync(join(repo, ARTIFACTS_DIR, `${ID}.json`), JSON.stringify({ meta: {}, body: { openQuestions: [] } }, null, 2) + '\n');
	writeFileSync(join(repo, ARTIFACTS_DIR, `${ID}.md`), '# LLD\n');
});
afterEach(() => {
	_setApprovalGateForTests(undefined);
	_setWorkflowToolDepsForTests();
	ghBin?.restore(); if (ghBin) cleanup(ghBin.dir); ghBin = undefined;
	rmSync(repo, { recursive: true, force: true });
});

const recorder = (): RecordResolutionFn => (async () => ({
	jsonPath: join(repo, ARTIFACTS_DIR, `${ID}.json`), mdPath: join(repo, ARTIFACTS_DIR, `${ID}.md`),
	resolution: { question: '', status: 'resolved', resolvedAt: '' }, remainingOpen: [],
})) as unknown as RecordResolutionFn;
const params = { repo: undefined as unknown as string, artifactId: ID, comments: [{ id: 'c1', anchor: {}, body: 'please change this' }] };
const initGit = (): void => { execFileSync('git', ['init', '-q'], { cwd: repo }); execFileSync('git', ['config', 'user.email', 'a@b.c'], { cwd: repo }); execFileSync('git', ['config', 'user.name', 'a'], { cwd: repo }); };

describe('commit-denial-callers.test.ts: a denied commit posts no comment and handleResolveComment returns the error result; ordinary git failures are logged and the stage continues', () => {
	it('a denied commit makes handleResolveComment answer its error result with the recorded count, never success', async () => {
		initGit();
		_setWorkflowToolDepsForTests({ approvalMode: 'manual' });
		_setApprovalGateForTests(() => decline);
		const r = await handleResolveComment({ ...params, repo }, undefined, { record: recorder() });
		assert.ok('error' in r, JSON.stringify(r));
		assert.match((r as { error: string }).error, /recorded 1 of 1; the commit was denied/);
	});

	it('an ordinary git failure (not a work tree) is logged and the recording still succeeds', async () => {
		const r = await handleResolveComment({ ...params, repo }, undefined, { record: recorder() });
		assert.ok(!('error' in r), JSON.stringify(r));
		assert.equal((r as { recorded: number }).recorded, 1);
	});

	it('a denied commit makes recordResolution throw the denial and posts no tracker comment', async () => {
		initGit();
		writeFileSync(join(repo, 'github.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		const prior = process.env['INSRC_GITHUB_CONFIG'];
		process.env['INSRC_GITHUB_CONFIG'] = join(repo, 'github.json');
		try {
			ghBin = installStandInBin('gh', 'echo "gh was called: $*" >> "$(dirname "$0")/calls"; echo ok');
			const lld = join(repo, ARTIFACTS_DIR, `${lldArtifactId(HASH, 's4')}.json`);
			writeFileSync(lld, JSON.stringify({
				meta: { workflow: 'design.story', runId: 'l', schemaVersion: 1, epicHash: HASH, epicSlug: 's', createdAt: '2026-07-17T07:42:28.275Z', epicCreatedAt: '2026-07-17T07:42:28.275Z', storyId: 's4', hldBaseRunId: 'h', hldEffectiveHash: 'b', hldAmendmentsApplied: [] },
				body: {
					hldContextSlice: { frameworkSummary: 'fw', rolloutPhase: 'p1', ownedContracts: [], consumedContracts: [], boundary: { storyId: 's4', owns: [], depends: [], internal: 'x' }, nonFunctional: {} },
					contractDetails: { surfaceLevel: 'internal', api: [] }, dataModelChanges: [], interactionWithShared: [],
					errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] }, testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
					alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: [], cons: [], costEstimate: 'S' }], chosenAlternative: 'a1', openQuestions: ['[q1 / a] First?'],
				},
				citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'HLD' }],
			}));
			_setWorkflowToolDepsForTests({ approvalMode: 'manual' });
			_setApprovalGateForTests(() => decline);
			await assert.rejects(recordResolution(repo, 'lld', HASH, 's4', 'q1', 'resolved', 'yes'), (e: unknown) => e instanceof ToolDenied);
			assert.deepEqual(ghBin.calls(), [], 'no gh call was made after the denied commit');
		} finally { if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior; }
	});
});
