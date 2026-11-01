import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewProgressTracker, ProgressSchema } from '../progress.js';
import { Type } from '@sinclair/typebox';
import { CheckpointSchema, decodeReview } from '../contracts.js';

test('Projects sanitized bounded phases and meaningful activity with unknown-safe elapsed', () => {
 let now = 0; const tracker = new ReviewProgressTracker({now:()=>now,wall:()=>new Date(now).toISOString()});
 assert.equal(tracker.snapshot().taskElapsedMs,null);
 tracker.task({id:'t1',title:'Task\n'+ 'x'.repeat(300)},1,2,0);
 assert.equal(tracker.snapshot().task!.name.length,256);
 tracker.activity({sessionId:'secret',sequence:1,kind:'session_started'},0);
 now=1000; tracker.activity({sessionId:'secret',sequence:2,kind:'heartbeat'},0);
 assert.equal(tracker.snapshot().lastMeaningfulActivityAt,null);
 tracker.activity({sessionId:'secret',sequence:3,kind:'tool_started',toolId:'private command'},1);
 const value=tracker.snapshot(); assert.equal(value.phase,'tool_running'); assert.equal(value.taskElapsedMs,1000);
 assert.equal(value.lastMeaningfulActivityAt,new Date(now).toISOString()); assert.ok(!JSON.stringify(value).includes('secret'));assert.ok(!JSON.stringify(value).includes('private command'));
 decodeReview(ProgressSchema,value);
});
test('Reads checkpoints with optional progress and rejects malformed metadata', () => {
 const value=new ReviewProgressTracker().snapshot();decodeReview(ProgressSchema,value);
 const optional=Type.Object({progress:CheckpointSchema.properties.attempts.items.properties.progress},{additionalProperties:false});
 assert.deepEqual(decodeReview(optional,{}),{});decodeReview(optional,{progress:value});
 assert.throws(()=>decodeReview(ProgressSchema,{...value,rawOutput:'private'}));
 assert.throws(()=>decodeReview(ProgressSchema,{...value,activeToolCount:129}));
 assert.throws(()=>decodeReview(ProgressSchema,{...value,reviewElapsedMs:-1}));
});
