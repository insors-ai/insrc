import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewAttempt } from '../contracts.js';
import { ReviewProgressTracker } from '../progress.js';
import { ReviewProgressPersistence } from '../progress-persistence.js';

function fixture(fail = false) {
 const attempt = { 'review-response': {tasks: []} } as unknown as ReviewAttempt;
 const tracker = new ReviewProgressTracker();
 let tick: (()=>void)|undefined, tail=Promise.resolve(), writes=0;
 const disk: unknown[]=[];
 const persist=new ReviewProgressPersistence(attempt,tracker,{
  serial: work => { const next=tail.then(work); tail=next.catch(()=>{});return next; },
  save: async()=>{writes++;if(fail)throw Error('private disk error');disk.push(structuredClone(attempt));},
  timer: callback=>{tick=callback;return()=>{tick=undefined;};},
 });
 return {attempt,tracker,persist,disk,writes:()=>writes,tick:()=>{const callback=tick;tick=undefined;callback?.();},hasTimer:()=>!!tick};
}
test('Coalesces progress writes and fences stale generations without corrupting results',async()=>{
 const f=fixture();
 for(let i=0;i<10000;i++){f.tracker.phase(i%2?'tool_running':'task_review');f.persist.request();}
 assert.equal(f.writes(),0);f.tick();await f.persist.settled();assert.equal(f.writes(),1);
 assert.equal(f.attempt.progress!.sequence,10000);
 // A queued flush operates on current state; it cannot restore a stale tasks array.
 f.persist.request(true);f.attempt['review-response'].summary='durable result';await f.persist.settled();
 assert.equal((f.disk.at(-1) as ReviewAttempt)['review-response'].summary,'durable result');
 f.persist.request();assert.ok(f.hasTimer());f.persist.stop();assert.ok(!f.hasTimer());f.tick();await f.persist.settled();assert.equal(f.writes(),2);
 const g=fixture();g.persist.request(true);g.persist.stop();await g.persist.settled();assert.equal(g.writes(),0);
});
test('Retains durable feedback when progress persistence fails',async()=>{
 const f=fixture(true);const prior=f.tracker.snapshot();f.attempt.progress=prior;f.attempt['review-response'].summary='accepted feedback';
 f.tracker.phase('feedback_persistence');f.persist.request(true);await f.persist.settled();
 assert.deepEqual(f.attempt.progress,prior);assert.equal(f.attempt['review-response'].summary,'accepted feedback');assert.equal(f.persist.warning,'progress_persistence_failed');assert.equal(f.writes(),1);
 f.persist.boundary();assert.equal(f.attempt.progress!.phase,'feedback_persistence');f.persist.stop();
});
