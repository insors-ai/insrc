import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, existsSync, writeFileSync } from 'node:fs';
import { relative, join } from 'node:path';
import { impactFixture } from './impact-fixtures.js';
import { publishDesignReview } from '../publication.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import { consolidateDesignReview } from '../results.js';
import { reviewRecordOf, isStoredDesignReview, reviewReference } from '../../report-log.js';
import { readReviewRecordOf } from '../../report-file.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import { saveDesignCheckpoint } from '../checkpoint.js';
import { handleArtifactContent } from '../../../artifact-content.js';
import { loadArtifactRecordSet } from '../../../delivery/load.js';
import { buildWorkItemGraph } from '../../../delivery/graph.js';
import { deriveGates } from '../../../delivery/gate.js';
import { reviewFindings } from '../../../../cli/services/workflow.js';
import { createDocsReviewClient } from '../../../../../vscode-plugin/src/chat/docs-review-client.js';
import { parseDesignRequest } from '../contracts.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { recordReviewSync, reviewedMeta } from '../../../__tests__/lifecycle-fixtures.js';
import type { ReviewReport } from '../../types.js';

async function fixture(t:Parameters<typeof impactFixture>[0]){
 const f=impactFixture(t);const finding={id:'real-finding',severity:'MED' as const,location:'/body/summary',message:'Real chunk concern',evidenceReferences:[f.md]};
 f.baseline.completedChunks[0]!.findings=[finding];f.baseline.completedChunks[0]!.status='changes_requested';f.baseline.status='changes_requested';
 f.baseline.report=consolidateDesignReview('review-1',1,f.prepared.subject,f.baseline.baseline.contentIdentity,f.plan,f.baseline.completedChunks);
 f.checkpoint.attempts=[f.baseline];await saveDesignCheckpoint(f.repo,f.checkpoint);const receipt=await publishDesignReview(f.checkpoint);return {...f,receipt};
}
test('versioned readers preserve legacy shape and expose real chunk feedback through current common fields',async t=>{
 const f=await fixture(t),log=await createRepoLifecycle(f.repo).history.log(f.id);
 const loaded=reviewRecordOf(log,f.id,{report:reviewReference(f.id,f.receipt.artifactHistoryEntryId!)});
 assert.ok(loaded&&isStoredDesignReview(loaded));assert.equal(loaded.report.counts.MED,1);assert.equal('claims' in loaded.report,false);
 const legacyReport={legacy:'unchanged'};
 const legacy=reviewRecordOf([{id:'old',operation:'review',actor:{id:'agent:old',kind:'agent',properties:{}},timestamp:'2026-01-01',outcome:{result:'pass',summary:'Old',data:{kind:'review',report:legacyReport,resolutions:{}}}}],f.id,{report:reviewReference(f.id,'old')});
 assert.deepEqual(legacy,{report:legacyReport,resolutions:{}});
 const malformed=structuredClone(log);(malformed.find(e=>e.id===f.receipt.artifactHistoryEntryId)!.outcome!.data as {schemaVersion:number}).schemaVersion=2;
 assert.throws(()=>reviewRecordOf(malformed,f.id,{report:reviewReference(f.id,f.receipt.artifactHistoryEntryId!)}));
 assert.equal(readReviewRecordOf(f.json)!.kind,'design-chunk-review');
 const content=await handleArtifactContent({repo:f.repo,mdPath:relative(f.repo,f.md)},undefined);
 assert.ok(!('error' in content));assert.equal(content.renderedMarkdown,readFileSync(f.md,'utf8'));assert.equal(content.approvable,false);
 assert.equal(content.designReview!.counts.MED,1);assert.equal(content.designFindings![0]!.finding.message,'Real chunk concern');
 const cli=reviewFindings(f.json);assert.equal(cli.verdict,'block');assert.match(cli.designMarkdown!,/Real chunk concern/);assert.deepEqual(cli.pending,[]);
 const records=loadArtifactRecordSet(f.repo),gates=deriveGates(buildWorkItemGraph(records),records);
 const gate=gates.artifacts.get(f.id)!;assert.equal(gate.review!.counts.med,1);assert.equal(gate.review!.effectiveVerdict,'block');
 const client=createDocsReviewClient({rpc:async()=>content} as unknown as import('../../../../shared/ipc-client.js').IpcClient);
 const view=await client.content(f.md);assert.equal(view.markdown,content.renderedMarkdown);assert.equal(view.blocked,true);assert.deepEqual(view.designReview,content.designReview);assert.deepEqual(view.designFindings,content.designFindings);
});
test('fresh coordinator retrieves permanent pages without checkpoint, scan or provider and requires an exact artifact locator',async t=>{
 const f=await fixture(t);unlinkSync(f.path);
 writeFileSync(join(f.repo,'.insrc/artifacts/LLD-bbbbbbbbbbbbbbbb-s1.log.jsonl'),'corrupt unrelated history');
 const c=new DesignReviewCoordinator({provider:()=>{throw Error('No model');}});
 const scan=t.mock.method(fs,'readdirSync',()=>{throw Error('Permanent history lookup must not enumerate directories');});syncBuiltinESMExports();
 t.after(()=>{scan.mock.restore();syncBuiltinESMExports();});
 assert.equal(parseDesignRequest({phase:'progress',repo:f.repo,reviewId:'review-1',attempt:1,artifactPath:f.json}).phase,'progress');
 await assert.rejects(c.progress(f.repo,'review-1',1),{code:'artifact-reference-required'});
 const result=await c.progress(f.repo,'review-1',1,{artifactPath:f.json,includeResult:true});
 assert.equal(result.source,'history');assert.equal(result.status,'changes_requested');assert.equal(result.completedResults.length,1);assert.equal(result.report!.counts.MED,1);
 assert.equal(result.publication!.artifactHistoryEntryId,f.receipt.artifactHistoryEntryId);assert.equal(existsSync(f.path),false);
 const next=await c.progress(f.repo,'review-1',1,{artifactPath:f.md,includeResult:true,afterCompletedChunk:result.nextCompletedChunk});
 assert.equal(next.completedResults[0]!.chunkId,'edit');
 assert.equal((await c.progress(f.repo,'review-1',1)).source,'history');
 await assert.rejects(c.progress(f.repo,'other-review',1,{artifactPath:f.json}),{code:'missing_review_history'});
 assert.equal(existsSync(f.path),false);
});
test('legacy display stays unchanged and read-only across artifact content delivery and CLI',async t=>{
 const f=impactFixture(t),raw=JSON.parse(readFileSync(f.json,'utf8'));
 const report:ReviewReport={artifact:f.id,stage:'design.story',verdict:'block',reviewedAt:'2026-11-01T00:00:00Z',model:'historical-model',reviewedBy:'daemon',counts:{high:0,med:1,low:0},findings:[{claimId:'legacy-id',kind:'semantic',severity:'MED',premise:'Historical concern',evidence:'Historical evidence',action:'Historical correction',fixability:'manual'}]};
 const ref=recordReviewSync(f.repo,f.id,report);
 writeFileSync(f.json,JSON.stringify({...raw,meta:{...raw.meta,...reviewedMeta({verdict:'block',counts:report.counts,report:ref})}}));
 const logPath=join(f.repo,`.insrc/artifacts/${f.id}.log.jsonl`),before=[f.json,f.md,logPath].map(p=>readFileSync(p,'utf8'));
 const view=await handleArtifactContent({repo:f.repo,mdPath:relative(f.repo,f.md)},undefined);assert.ok(!('error' in view));
 assert.equal(view.renderedMarkdown,before[1]);assert.equal(view.approvable,false);assert.equal(view.designReview,undefined);
 const cli=reviewFindings(f.json);assert.equal(cli.verdict,'block');assert.equal(cli.pending[0]!.claimId,'legacy-id');assert.equal(cli.designMarkdown,undefined);
 const records=loadArtifactRecordSet(f.repo),gate=deriveGates(buildWorkItemGraph(records),records).artifacts.get(f.id)!;
 assert.equal(gate.review!.counts.med,1);assert.equal(gate.review!.effectiveVerdict,'block');
 assert.deepEqual([f.json,f.md,logPath].map(p=>readFileSync(p,'utf8')),before);
});
test('shared current IDE wire fixture preserves common fields and versioned chunk data',async()=>{
 // This exact fixture is also consumed by ArtifactContentTest in the JetBrains gateway.
 const wire=JSON.parse(readFileSync(new URL('./fixtures/artifact-review-wire.json',import.meta.url),'utf8'));
 const client=createDocsReviewClient({rpc:async()=>wire} as unknown as import('../../../../shared/ipc-client.js').IpcClient);
 const result=await client.content('docs/LLD.md');
 assert.equal(result.markdown,wire.renderedMarkdown);assert.equal(result.blocked,!wire.approvable);assert.deepEqual(result.openQuestions,[]);
 assert.deepEqual(result.designReview,wire.designReview);assert.deepEqual(result.designFindings,wire.designFindings);
 assert.equal('claims' in result.designReview!,false);
});
