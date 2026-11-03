import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { DESIGN_LIMITS } from '../contracts.js';
import { saveDesignCheckpoint, loadDesignCheckpoint, designCheckpointPath } from '../checkpoint.js';
import { DesignProgressTracker, observeDesignCheckpoint } from '../progress.js';
import { designFixture } from './fixtures.js';

test('atomic checkpoint failure preserves the last accepted snapshot and cleans its own temporary file',async t=>{
 const f=designFixture(t);await saveDesignCheckpoint(f.repo,f.checkpoint);const before=await fs.readFile(f.path,'utf8');
 const rename=fs.rename;t.mock.method(fs,'rename',async (...args:Parameters<typeof fs.rename>)=>{if(args[1]===f.path)throw new Error('simulated rename failure');return rename(...args);});
 const next=structuredClone(f.checkpoint);next.attempts[0]!.status='running';
 await assert.rejects(saveDesignCheckpoint(f.repo,next),/simulated rename failure/);
 assert.equal(await fs.readFile(f.path,'utf8'),before);assert.deepEqual((await fs.readdir(join(f.repo,'.insrc/tmp/design-review'))),['review-1.json']);
 assert.equal((await fs.stat(f.path)).mode&0o777,0o600);
});
test('bounded no-follow checkpoint loading retains corrupt foreign and oversized state',async t=>{
 const f=designFixture(t);assert.equal(await loadDesignCheckpoint(f.repo,'review-1'),undefined);await saveDesignCheckpoint(f.repo,f.checkpoint);
 await fs.writeFile(f.path,'not JSON');await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'));assert.equal(await fs.readFile(f.path,'utf8'),'not JSON');
 await assert.rejects(saveDesignCheckpoint(f.repo,f.checkpoint));
 const foreign=structuredClone(f.checkpoint);foreign.project='/foreign';await fs.writeFile(f.path,JSON.stringify(foreign));await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'),/identity/);
 await fs.truncate(f.path,DESIGN_LIMITS.checkpointBytes+1);await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'),/bounded regular/);
 await fs.unlink(f.path);await fs.writeFile(join(f.repo,'outside.json'),'{}');await fs.symlink(join(f.repo,'outside.json'),f.path);await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'));
 assert.throws(()=>designCheckpointPath(f.repo,'../escape'));
});
test('progress pages expose one result without baseline and polling does not renew activity',t=>{
 const f=designFixture(t);let now=0;const tracker=new DesignProgressTracker(f.path,{now:()=>now,wall:()=>new Date(1762128000000+now).toISOString()});
 tracker.unit('chunk_review','chunk-1',0,2);tracker.activity({sessionId:'session',sequence:1,kind:'session_started'});
 now=20;tracker.activity({sessionId:'session',sequence:2,kind:'tool_started',toolId:'tool'});const active=tracker.snapshot();assert.equal(active.activeToolCount,1);const last=active.lastMeaningfulActivityAt;
 now=5000;assert.equal(tracker.activity({sessionId:'session',sequence:3,kind:'heartbeat'}),false);assert.equal(tracker.snapshot().lastMeaningfulActivityAt,last);
 tracker.activity({sessionId:'session',sequence:4,kind:'tool_completed',toolId:'tool'});assert.equal(tracker.snapshot().activeToolCount,0);
 const attempt=f.checkpoint.attempts[0]!;attempt.status='running';attempt.progress=tracker.snapshot();
 attempt.completedChunks=[{chunkId:'a',status:'passed',summary:'Assessed',findings:[],inspectedReferences:['/body/summary'],limitations:[],advice:[]}];
 const normal=observeDesignCheckpoint(f.checkpoint,{active:true,liveProgress:tracker.snapshot()});assert.deepEqual(normal.completedResults,[]);assert.ok(!JSON.stringify(normal).includes('reviewedContent'));
 const page=observeDesignCheckpoint(f.checkpoint,{includeResult:true});assert.equal(page.completedResults.length,1);assert.equal(page.nextCompletedChunk,1);assert.equal(page.status,'interrupted');
 assert.deepEqual(observeDesignCheckpoint(f.checkpoint,{includeResult:true,afterCompletedChunk:1}).completedResults,[]);
 assert.throws(()=>observeDesignCheckpoint(f.checkpoint,{afterCompletedChunk:2}));assert.equal(tracker.snapshot().lastMeaningfulActivityAt,attempt.progress.lastMeaningfulActivityAt);
});
test('accepted feedback cannot be rewritten and oversized stored results cannot bypass paging limits',async t=>{
 const f=designFixture(t);const attempt=f.checkpoint.attempts[0]!;
 attempt.completedChunks=[{chunkId:'a',status:'passed',summary:'Accepted',findings:[],inspectedReferences:['/body/summary'],limitations:[],advice:[]}];
 await saveDesignCheckpoint(f.repo,f.checkpoint);
 const changed=structuredClone(f.checkpoint);changed.attempts[0]!.completedChunks[0]!.summary='Replacement';
 await assert.rejects(saveDesignCheckpoint(f.repo,changed),/replace completed/);
 const oversized=structuredClone(f.checkpoint);oversized.attempts[0]!.completedChunks[0]!.advice=Array.from({length:200},()=>'x'.repeat(8192));
 await fs.writeFile(f.path,JSON.stringify(oversized));await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'),/page limit/);
});
