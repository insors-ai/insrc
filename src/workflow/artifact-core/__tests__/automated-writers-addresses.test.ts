/**
 * s5 t3: the automated content writers (the controller's and the daemon's review auto-fix, and the BUILD, TESTS and code-review
 * rounds) never address a person's feedback, whereas an ordinary revision addresses all of it.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifact-core/__tests__/automated-writers-addresses.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// The review reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => {
	await closeGraphStore();
	rmSync(STORE_DIR, { recursive: true, force: true });
});

import type { LLMMessage, LLMProvider, LLMResponse, StructuredCompletionOpts, StructuredSchema } from '../../../shared/types.js';
import { lifecycleFor, resetLifecycleRegistry, roundWriterFor } from '../../../daemon/lifecycle-registry.js';
import { reviewArtifactFile } from '../../review/run-artifact.js';
import { persistBuildRecord } from '../../runners/build/standalone-record.js';
import { persistTestRecordTask } from '../../runners/build/test-record.js';
import { storeRound } from '../../runners/build/round-writer.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId, testsArtifactId } from '../../storage.js';
import { History } from '../history.js';
import { FileSidecarStore } from '../sidecar-store.js';
import type { Actor, Feedback } from '../types.js';
import { H, alice, artifact } from './store-kit.js';
import '../../__tests__/helpers/converted-repos.js';

const PLAN = `PLAN-${H}-s1`;
const MD = `<!-- insrc:artifact ${PLAN} -->\n\n# Story s1\n\n- t1: extend the two exported constants in foo.\n`;
const reviewer: Actor = { id: 'github:carol', kind: 'person', properties: {} };
const CLAIMS = { claims: [{ id: 'c-inv', ref: 's1/t1', kind: 'inventory', text: 'There are exactly two exported constants in foo.', anchors: ['src/foo.ts'], probe: { greps: ['^export const'] } }] };
const FIX = { claimId: 'c-inv', severity: 'HIGH', evidence: 'ripgrep re-derived THREE `export const` sites.', action: 'Correct the count.', fixability: 'auto', proposedFix: { rationale: 'three', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] } };

const repos: string[] = [];

/** A request for change made before anything below is written, so a later revision would address it if it could. */
const feedback = (id: string): Feedback => ({ id, text: 'please change this', actor: reviewer, timestamp: '2026-01-01T00:00:00.000Z', feedback: [], kind: 'revision-request' });

async function repo(): Promise<{ dir: string; history: History }> {
	const dir = mkdtempSync(join(tmpdir(), 'automated-writers-'));
	repos.push(dir);
	mkdirSync(join(dir, 'src'), { recursive: true });
	writeFileSync(join(dir, 'src', 'foo.ts'), 'export const alpha = 1;\nexport const beta = 2;\nexport const gamma = 3;\n');
	await lifecycleFor(dir).store.write(artifact(`DEF-${H}`), alice);
	return { dir, history: new History(new FileSidecarStore(dir)) };
}
const open = async (h: History, id: string) => (await h.openFeedback(id)).map(f => f.id);
