import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { IpcStreamMessage, LLMProvider } from '../../../shared/types.js';
import { codeReviewRunStart } from '../../../daemon/code-review-rpc.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult, ReviewDimension } from '../../code-review/types.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId, planArtifactId, testsArtifactId } from '../../storage.js';
import { approveWorkflowTarget } from '../../gates.js';
import { reviewArtifactFile } from '../../review/run-artifact.js';
import { LifecycleConflictError } from '../types.js';
import { LifecycleService } from '../lifecycle-service.js';
import { persistBuildRecord } from '../../runners/build/standalone-record.js';
import type { BuildRecord } from '../../runners/build/standalone-record.js';
import { persistTestRecordTask, testRecordPaths } from '../../runners/build/test-record.js';
import type { TestRecordTask } from '../../runners/build/test-record.js';
import type { RoundWriter } from '../../runners/build/round-writer.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { lifecycleFor, resetLifecycleRegistry, roundWriterFor } from '../../../daemon/lifecycle-registry.js';
import { persistStandaloneBuildRecord } from '../../runners/build/standalone-record.js';
import { H, alice, artifact } from './store-kit.js';
import { durableKit } from './durable-kit.js';
import type { DurableKit } from './durable-kit.js';
import { stubEvidence } from './lifecycle-kit.js';
import '../../__tests__/helpers/converted-repos.js';

const BUILD = buildArtifactId(H, 's1');
const TESTS = testsArtifactId(H, 's1');
const T1 = '2026-10-21T10:00:00.000Z';
const T2 = '2026-10-21T11:00:00.000Z';

const buildRec = (at: string, passed: boolean): BuildRecord => ({
	meta: { workflow: 'build', epicHash: H, storyId: 's1', createdAt: at, updatedAt: at },
	body: { tasks: [{ id: 't1', passed }] },
});
const testTask = (at: string, testsPassed: boolean): TestRecordTask => ({ taskId: 't1', ranAt: at, testsPassed, tests: [], files: [] });

async function seeded(): Promise<{ k: DurableKit; through: RoundWriter; service: LifecycleService }> {
	const k = durableKit();
	await k.store.write(artifact(`DEF-${H}`), alice);
	const service = new LifecycleService({ store: k.store, evidence: stubEvidence([]) });
	return { k, service, through: { writer: service, actor: { id: 'insrc:build', kind: 'system', properties: {} } } };
}
const logOf = async (k: DurableKit, id: string) => (await k.store.readWithHistory(id)).changeLog;
const bodyOf = async (k: DurableKit, id: string) => (await k.store.read(id)).payload.body as { tasks: { id?: string; taskId?: string; passed?: boolean; testsPassed?: boolean }[] };
