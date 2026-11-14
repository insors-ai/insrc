import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fixture } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { ReviewSourceSession, ReviewPreparationCapacity } from '../source-session.js';
import { PreparationProgress } from '../preparation-progress.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import type { ReviewRuntime } from '../../../shared/review-preparation.js';

test('preparation progress counts verified completed queries and cache hits without activity from polling',async t=>{
 const f=await fixture();const limits=reviewPreparationLimits(join(f.repo,'missing.json'));
 const session=await ReviewSourceSession.create({project:f.repo,family:'code',reviewId:'progress'},f.deps.sources,limits,new ReviewPreparationCapacity(limits.cacheMaxBytes));t.after(async()=>{try{await session.close();}finally{f.cleanup();}});
 let clock=100;const observations:NonNullable<ReviewRuntime['preparation']>[]=[],reporter=new PreparationProgress(async value=>{observations.push(value);},()=>clock);
 const stop=session.observe(snapshot=>reporter.report('fetch_sources',snapshot));t.after(stop);
 await session.file(f.packet.reviewRevision!,'source.js');clock+=100;await session.file(f.packet.reviewRevision!,'source.js');
 assert.equal(observations.length,2);assert.equal(observations[1]!.logicalCompleted,2);assert.equal(observations[1]!.physicalCompleted,1);assert.equal(observations[1]!.cacheHits,1);assert.equal(observations[1]!.total,null);
 clock+=1000;await reporter.report('fetch_sources',session.snapshot());session.snapshot();session.snapshot();assert.equal(observations.length,2);
 await reporter.report('build_views',session.snapshot());assert.equal(observations.length,3);assert.equal(observations[2]!.elapsedMs,1100);
});

test('failed source work does not advance completed preparation counters',async t=>{
 const f=await fixture();const limits=reviewPreparationLimits(join(f.repo,'missing.json'));
 const sources=new Proxy(f.deps.sources,{get(target,property){if(property==='file')return async()=>{throw Error('Injected fetch failure');};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
 const session=await ReviewSourceSession.create({project:f.repo,family:'code',reviewId:'failed-progress'},sources,limits,new ReviewPreparationCapacity(limits.cacheMaxBytes));t.after(async()=>{try{await session.close();}finally{f.cleanup();}});
 let updates=0;session.observe(async()=>{updates++;});await assert.rejects(session.file(f.packet.reviewRevision!,'source.js'),/Injected/);
 const metrics=session.snapshot();assert.equal(metrics.logicalQueries,1);assert.equal(metrics.physicalQueries,1);assert.equal(metrics.logicalCompleted,0);assert.equal(metrics.physicalCompleted,0);assert.equal(updates,0);
});
