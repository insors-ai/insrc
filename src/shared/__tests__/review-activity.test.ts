import test from 'node:test';
import assert from 'node:assert/strict';
import { ReviewActivityMonitor, REVIEW_INACTIVITY_MS, ReviewActivityUnsupportedError, requireReviewActivity, validateReviewSessionOptions } from '../review-activity.js';
import type { ReviewActivityEvent, ReviewInactivityError, ReviewPressure } from '../review-activity.js';
import type { ActivityReviewSessionOpts, ReviewSessionOpts } from '../types.js';
import { OllamaProvider } from '../../agent/providers/ollama.js';

function clock(pressure: ReviewPressure = {eventLoopDelayMs:0,normalizedLoad:0}) {
 let time = 0, timer: (()=>void)|undefined, expired:ReviewInactivityError|undefined;
 const monitor = new ReviewActivityMonitor(error=>{expired=error;},{now:()=>time,pressure:()=>pressure,timer:(fn)=>{timer=fn;return()=>{if(timer===fn)timer=undefined;};}});
 return {monitor,advance:(ms:number)=>{time+=ms;},wake:()=>timer?.(),expired:()=>expired};
}
const event=(sequence:number,kind:ReviewActivityEvent['kind'],toolId?:string):ReviewActivityEvent=>({sessionId:'native-1',sequence,kind,...(toolId?{toolId}:{})});

test('activity monitor survives expected durations, ignores heartbeats/replays and expires after 30 quiet minutes',()=>{
 const c=clock();
 assert.equal(c.monitor.observe(event(1,'session_started')),true);
 for(let i=2;i<=8;i++){c.advance(600_000);assert.equal(c.monitor.observe(event(i,'model_output')),true);c.wake();assert.equal(c.expired(),undefined);}
 c.advance(REVIEW_INACTIVITY_MS-1);
 assert.equal(c.monitor.observe(event(9,'heartbeat')),false);
 assert.equal(c.monitor.observe(event(8,'model_output')),false);
 c.wake();assert.equal(c.expired(),undefined);
 c.advance(1);c.wake();assert.equal(c.expired()?.snapshot.activityAgeMs,REVIEW_INACTIVITY_MS);
 assert.equal(c.monitor.observe(event(10,'model_output')),false);
});
test('tool ages are independent, native sessions are fenced and a silent tool cannot renew inactivity',()=>{
 const c=clock();
 assert.equal(c.monitor.observe(event(2,'model_output')),false);
 c.monitor.observe(event(1,'session_started'));
 c.monitor.observe(event(2,'tool_started','tool-1'));
 c.advance(500_000);c.monitor.observe(event(3,'model_output'));
 assert.equal(c.monitor.snapshot().tools[0]?.elapsedMs,500_000);
 assert.equal(c.monitor.observe(event(4,'tool_started','tool-1')),false);
 assert.equal(c.monitor.observe(event(4,'tool_completed','missing')),false);
 c.advance(REVIEW_INACTIVITY_MS);c.wake();
 assert.equal(c.expired()?.snapshot.diagnostic,'tool_running_no_observed_progress');
 assert.equal(c.expired()?.snapshot.tools[0]?.elapsedMs,2_300_000);
});
test('fresh activity and stop fence delayed timer callbacks and tool IDs are bounded',()=>{
 const c=clock();c.monitor.observe(event(1,'session_started'));c.advance(REVIEW_INACTIVITY_MS-10);
 c.monitor.observe(event(2,'tool_started','tool'));c.wake();assert.equal(c.expired(),undefined);
 c.advance(10);assert.equal(c.monitor.observe(event(3,'tool_completed','tool')),true);
 assert.equal(c.monitor.snapshot().tools.length,0);
 assert.equal(c.monitor.observe(event(4,'tool_started','x'.repeat(257))),false);
 c.monitor.stop();c.advance(REVIEW_INACTIVITY_MS);c.wake();assert.equal(c.expired(),undefined);
});
test('inactivity diagnostics distinguish observed local pressure, remote wait and unknown without claiming a cause',()=>{
 for(const [pressure,diagnostic] of [
  [{eventLoopDelayMs:1000,normalizedLoad:0},'local_contention_observed'],
  [{eventLoopDelayMs:0,normalizedLoad:1},'local_contention_observed'],
  [{eventLoopDelayMs:0,normalizedLoad:0},'remote_or_model_wait_unconfirmed'],
  [{},'inactivity_cause_unknown'],
  [{eventLoopDelayMs:NaN,normalizedLoad:-1},'inactivity_cause_unknown'],
 ] as const){const c=clock(pressure);assert.equal(c.monitor.snapshot().diagnostic,diagnostic);c.monitor.stop();}
});
const activity=():ActivityReviewSessionOpts=>({mode:'activity',cwd:'/tmp',inactivityMs:1800000,signal:new AbortController().signal,internalRetry:false,onActivity:()=>{},onCandidate:async()=>({accepted:false})});
test('execution options reject mixed timers and unsupported providers before execution',async()=>{
 validateReviewSessionOptions({cwd:'/tmp',deadlineMs:1});validateReviewSessionOptions(activity());
 for(const extra of [{deadlineMs:1},{deadlineMs:undefined},{stallMs:1},{reviewBudget:{}},{internalRetry:true},{inactivityMs:1}]){
  assert.throws(()=>validateReviewSessionOptions({...activity(),...extra} as ReviewSessionOpts),TypeError);
 }
 assert.throws(()=>validateReviewSessionOptions({cwd:'/tmp',deadlineMs:Infinity}),TypeError);
 const provider=new OllamaProvider();let calls=0;provider.complete=async()=>{calls++;throw Error('Must not execute');};
 assert.throws(()=>requireReviewActivity(provider),ReviewActivityUnsupportedError);
 await assert.rejects(provider.runReviewSession('unused',{type:'object'},activity()),ReviewActivityUnsupportedError);
 assert.equal(calls,0);
});
