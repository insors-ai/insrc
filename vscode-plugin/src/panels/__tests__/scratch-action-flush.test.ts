import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScratchActionFlush } from '../scratch-action-flush.js';
import { ScratchIdleValidation } from '../scratch-idle-validation.js';

const settle = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test('Captured Save Send Undo Redo lock barriers and native Save reentrancy', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let state = {sequence:1,pending:true,unavailable:false}, now = 0;
  const starts: number[] = [];
  const scheduler = new ScratchIdleValidation<number, boolean>({now:()=>now,source:()=>({version:1,digest:'base',markdown:'source'}),eligible:()=>true,
    validate: async seq => {starts.push(seq); return true;},complete:()=>{},failed:()=>{},dispose:()=>{}});
  scheduler.stage(1);
  const flusher = new ScratchActionFlush(()=>state,seq=>scheduler.expedite(candidate=>candidate === seq));
  const first = flusher.flush(); assert.equal(flusher.flush(),first,'Native/explicit requests for the SAME capture share a barrier');
  t.mock.timers.tick(0); await settle(); assert.deepEqual(starts,[1],'Explicit action cancels the 300ms delay');
  let finished = false; void first.then(()=>{finished=true;}); await settle(); assert.equal(finished,false,'Validation alone is not canonical acknowledgement');
  state = {...state,pending:false}; flusher.changed(); assert.deepEqual(await first,{draftSeq:1});
  for (const action of ['save','send','undo','redo','lock','native-save']) assert.deepEqual(await flusher.flush(),{draftSeq:1},action);
  state = {sequence:2,pending:true,unavailable:false}; scheduler.stage(2);
  const stale = flusher.flush(), rejected = assert.rejects(stale,/changed/);
  state = {...state,sequence:3}; scheduler.stage(3); flusher.changed(); await rejected;
  t.mock.timers.tick(0); await settle(); assert.deepEqual(starts,[1], 'A stale flush never forces its replacement generation');
  now = 300; t.mock.timers.tick(300); await settle(); assert.deepEqual(starts,[1,3]);
  const timed = flusher.flush(), timedRejection = assert.rejects(timed,/Timed out/);
  now += 20_000; t.mock.timers.tick(20_000); await timedRejection;
  const closed = flusher.flush(), closedRejection = assert.rejects(closed,/closed/); flusher.dispose(); await closedRejection;
  await assert.rejects(flusher.flush(),/cannot be confirmed/);
  scheduler.dispose(); assert.equal(flusher.waiting,false);
});
