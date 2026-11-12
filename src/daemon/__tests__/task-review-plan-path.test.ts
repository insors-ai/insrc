/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync,mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _setRepoSchemaGuardForTests } from '../repo-schema-guard.js';
import { startTaskReview } from '../task-review-rpc.js';
import { reviewHost,eventually } from '../../workflow/code-review/task-review/__tests__/controller-fixture.js';

const epicHash = '1111111111111111';
const oid = 'a'.repeat(40);
const request = (repo: string, documents: Record<string, unknown>) => ({
	repo, reviewId: 'review-plan-path', attempt: 1, epicHash,
	packet: {
		reviewRevision:oid,
		storyId: 's1', functionalSummary: 'Change behaviour', documents,
		reviewSet: [{ commit: oid, parent: null, files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }], tests: [],
	},
});

test('src/daemon/__tests__/task-review-plan-path.test.ts: the plan-path identity check rejects a wrong plan document and is skipped when the packet has none', async () => {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'task-review-plan-path-')));
	_setRepoSchemaGuardForTests(() => undefined);
	mkdirSync(join(repo,'.insrc/artifacts'),{recursive:true});
	writeFileSync(join(repo,`.insrc/artifacts/BUILD-${epicHash}-s1.json`),JSON.stringify({meta:{authoredBy:'controller'},body:{tasks:[{id:'s1'}]}}));
	const reviews=reviewHost(repo,()=>{throw Error('No provider allowed');});
	const context={connectionIdentity:'plan-test',daemonEpoch:'plan-epoch',connectionSignal:new AbortController().signal};
	try {
	 const check=async(id:string,documents:Record<string,unknown>)=>{
	  const ack=await startTaskReview({...request(repo,documents),reviewId:id},context) as {path:string};
	  const read=()=>JSON.parse(readFileSync(ack.path,'utf8')).attempts[0];
	  await eventually(()=>read().header.status==='failed');
	  return read().error;
	 };
	 const wrong=await check('wrong-plan',{lld:{path:'lld.json',commit:oid},plan:{path:'docs/WRONG.json',commit:oid}});
	 assert.equal(wrong.field,'documents.plan');assert.match(wrong.summary,/Plan identity must match review subject/);
	 const skipped=await check('no-plan',{lld:{path:'lld.json',commit:oid}});
	 // With no Plan pointer, admission reaches source validation (this bare
	 // fixture intentionally has no pinned Git objects).
	 assert.equal(skipped.field,'source');assert.doesNotMatch(skipped.summary,/Plan identity/);
	} finally { await reviews.close(); _setRepoSchemaGuardForTests(); rmSync(repo, { recursive: true, force: true }); }
});
