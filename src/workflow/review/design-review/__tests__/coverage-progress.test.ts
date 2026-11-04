import test from 'node:test';
import assert from 'node:assert/strict';
import { DesignProgressTracker, observeDesignCheckpoint } from '../progress.js';
import { impactFixture } from './impact-fixtures.js';

test('fresh-only progress and pagination report retained scope without masking incomplete status',t=>{
 const f=impactFixture(t),a=f.current;a.plan=f.plan;a.impact=f.impact;a.status='running';f.checkpoint.attempts=[f.baseline,a];
 const tracker=new DesignProgressTracker(f.path);tracker.coverage(a);let v=observeDesignCheckpoint(f.checkpoint,{active:true,liveProgress:tracker.snapshot()});
 assert.deepEqual(v.coverageProgress,{plannedChunks:3,selectedChunks:2,reviewedChunks:0,retainedChunks:1,effectiveCompletedChunks:1});assert.equal(v.totalChunks,2);
 a.completedChunks.push(structuredClone(f.baseline.completedChunks[1]!));tracker.coverage(a);v=observeDesignCheckpoint(f.checkpoint,{active:true,liveProgress:tracker.snapshot(),includeResult:true});
 assert.equal(v.completedChunks,1);assert.equal(v.totalChunks,2);assert.equal(v.coverageProgress!.effectiveCompletedChunks,2);assert.deepEqual(v.completedResults.map(r=>r.chunkId),['edit']);
 a.completedChunks.push({...structuredClone(f.baseline.completedChunks[2]!),status:'incomplete',limitations:['Mandatory verification unavailable']});a.status='incomplete';
 v=observeDesignCheckpoint(f.checkpoint,{includeResult:true,afterCompletedChunk:1});assert.equal(v.status,'incomplete');assert.equal(v.completedChunks,2);assert.equal(v.totalChunks,2);assert.equal(v.coverageProgress!.effectiveCompletedChunks,3);assert.deepEqual(v.completedResults.map(r=>r.chunkId),['final']);
 assert.throws(()=>observeDesignCheckpoint(f.checkpoint,{afterCompletedChunk:3}),{code:'invalid_cursor'});
 const broken=structuredClone(f.checkpoint);broken.attempts[1]!.impact!.retainedCoverage=[];assert.throws(()=>observeDesignCheckpoint(broken),{code:'invalid_checkpoint'});
});

test('pre-plan and old full progress derive counts and impact tools return to impact phase',t=>{
 const f=impactFixture(t),tracker=new DesignProgressTracker(f.path);tracker.coverage(f.current);assert.equal(tracker.snapshot().coverageProgress,undefined);
 tracker.coverage(f.baseline);assert.deepEqual(tracker.snapshot().coverageProgress,{plannedChunks:3,selectedChunks:3,reviewedChunks:3,retainedChunks:0,effectiveCompletedChunks:3});
 tracker.unit('impact');tracker.activity({sessionId:'s1',sequence:1,kind:'session_started'});tracker.activity({sessionId:'s1',sequence:2,kind:'tool_started',toolId:'read'});assert.equal(tracker.snapshot().phase,'tool_running');tracker.activity({sessionId:'s1',sequence:3,kind:'tool_completed',toolId:'read'});assert.equal(tracker.snapshot().phase,'impact');
});
