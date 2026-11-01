/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's request to review an existing design artifact (`workflow.review`).
 * (LLD-1716f77ba9ba017b-S001, test T12; plan task t5.)
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mock, test } from 'node:test';
import { after as afterAll } from 'node:test';
import { mkdtempSync as mkdtempSyncRaw, rmSync as rmSyncForStore } from 'node:fs';
import { tmpdir as tmpdirForStore } from 'node:os';
import { join as joinForStore } from 'node:path';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';

// This file reaches the graph store through code that takes no path. Give it a
// temporary one: the store at the default path belongs to the daemon alone
// (Epic c2ba6fa6, Story s4).
const STORE_DIR = mkdtempSyncRaw(joinForStore(tmpdirForStore(), 'insrc-test-store-'));
setGraphStorePath(joinForStore(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmSyncForStore(STORE_DIR, { recursive: true, force: true });
});


import type { IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import { WORKFLOW_REVIEW_HEARTBEAT_MS, workflowReviewStart } from '../workflow-review-rpc.js';
import { reviewArtifactFile } from '../../workflow/review/index.js';
import type { WorkflowReviewDeps, WorkflowReviewDone } from '../workflow-review-rpc.js';
import { lifecycleReviewOf } from '../../workflow/artifact-core/approval-view.js';
import '../../workflow/__tests__/helpers/converted-repos.js';

const HASH = 'abcd1234ef567890';

function fixture(kind: 'DEF' | 'LLD', authorMeta: Record<string, unknown>) {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-review-'));
	const id = kind === 'DEF' ? `DEF-${HASH}` : `LLD-${HASH}-s1`;
	const json = join(repo, '.insrc', 'artifacts', `${id}.json`);
	const md = join(repo, 'docs', 'epics', 'demo-E20261005abcd', kind === 'DEF' ? 'DEF.md' : join('S001', 'LLD.md'));
	mkdirSync(dirname(json), { recursive: true });
	mkdirSync(dirname(md), { recursive: true });
	writeFileSync(json, JSON.stringify({ meta: { workflow: kind === 'DEF' ? 'define' : 'design.story', epicHash: HASH, storyId: 's1', ...authorMeta }, body: { note: 'x' }, citations: [] }, null, 2) + '\n');
	writeFileSync(md, `<!-- insrc:artifact ${id} -->\n\n# ${kind}\n\nThe body.\n`);
	return { repo, md, json, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

async function run(params: unknown, deps: WorkflowReviewDeps): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await workflowReviewStart(params, (m) => frames.push(m), new AbortController().signal, deps);
	return frames;
}

const withProvider = (provider: LLMProvider): WorkflowReviewDeps => ({ resolveProvider: () => ({ provider, model: 'cli-claude:opus' }) });


test('failed daemon design reviews retain paired canonical call outcomes',async()=>{
 const f=fixture('LLD',{authoredBy:'controller'});
 try{
  await run({artifactPath:f.md,repo:f.repo},{resolveProvider:()=>({provider:{} as LLMProvider,model:'fixture'}),review:async opts=>{
   const event={event:'start',reviewId:'00000000-0000-0000-0000-000000000001',callId:'00000000-0000-0000-0000-000000000002'} as import('../../workflow/review-pipeline/call-events.js').ReviewCallEvent;
   opts.onProgress?.('call-event',event);opts.onProgress?.('call-event',{...event,event:'failure'});
   throw new Error('review failed');
  }});
  const dir=join(f.repo,'.insrc/review-runs');const files=readdirSync(dir);assert.equal(files.length,1);
  assert.deepEqual(readFileSync(join(dir,files[0]!),'utf8').trim().split('\n').map(s=>JSON.parse(s).event),['start','failure']);
 }finally{f.cleanup();}
});
