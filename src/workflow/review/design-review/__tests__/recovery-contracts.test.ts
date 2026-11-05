import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDesign, parseDesignRequest, DesignCheckpointSchema, DesignProgressSchema, DesignRecoveryStateSchema, DesignReviewInputError, DESIGN_LIMITS } from '../contracts.js';
import { designFixture } from './fixtures.js';

test('recovery and failure envelopes strictly separate transport phase, operation and user direction',()=>{
 const identity={repo:'/project',reviewId:'review-1',attempt:1};
 const resume={phase:'recover',...identity,actionId:'resume-1',operation:'resume'};
 const decision={action:'restart_full',reason:'User approved the changed artifact restart',recordedAt:'2026-11-03T00:00:00.000Z'};
 assert.deepEqual(parseDesignRequest(resume),resume);
 assert.equal(parseDesignRequest({...resume,operation:'restart_full',userDecision:decision}).phase,'recover');
 assert.equal(parseDesignRequest({...resume,userDecision:{...decision,action:'retry_failed_unit'}}).phase,'recover');
 assert.equal(parseDesignRequest({...resume,operation:'retry_publication'}).phase,'recover');
 for(const patch of [{phase:'resume'},{operation:'unknown'},{attempt:0},{actionId:'../escape'},{actionId:''},{reviewId:''},{repo:'relative'},
  {operation:'restart_full'},{operation:'resume',userDecision:decision},{operation:'retry_publication',userDecision:decision},
  {userDecision:{...decision,action:'unknown'}},{userDecision:{...decision,action:'retry_failed_unit',reason:''}},
  {userDecision:{...decision,action:'retry_failed_unit',reason:'x'.repeat(DESIGN_LIMITS.text+1)}},{reviewer:'daemon'},{artifact:'copied content'}]){
  assert.throws(()=>parseDesignRequest({...resume,...patch}),DesignReviewInputError);
 }
 const failure={phase:'failure',...identity,executionId:'execution-1',sequence:1,failure:{code:'transport_failed',summary:'CLI connection closed'}};
 assert.deepEqual(parseDesignRequest(failure),failure);
 for(const patch of [{sequence:0},{executionId:'../escape'},{failure:{code:'changes_requested',summary:'A substantive finding'}},
  {failure:{code:'process_failed',summary:''}},{failure:{code:'invalid_output',summary:'Bad shape',raw:'transcript'}},{result:{}}]){
  assert.throws(()=>parseDesignRequest({...failure,...patch}),DesignReviewInputError);
 }
});

test('S1 checkpoints remain readable and bounded recovery metadata round-trips without content or transcripts',t=>{
 const f=designFixture(t),old=decodeDesign(DesignCheckpointSchema,f.checkpoint);
 assert.equal(old.attempts[0]!.unit,undefined);
 const time='2026-11-03T00:00:00.000Z';
 const failedUnit={unitId:'planning',phase:'planning',code:'invalid_output',summary:'Return the required tasks field',retriesUsed:3};
 const recovery={attempt:1,status:'paused',reason:'technical_retry_exhausted',failedUnit,completedChunkIds:[],requiresUserInput:true};
 const unit={unitId:'planning',phase:'planning',executionId:'execution-4',dispatches:4,retriesUsed:3,userDirectedDispatches:0,diagnostics:[{code:'invalid_output',summary:'Return the required tasks field'}]};
 const action={actionId:'resume-1',signature:'a'.repeat(64),operation:'resume',sourceAttempt:1,resultAttempt:1,acceptedAt:time};
 const summary={unitId:'planning',phase:'planning',automaticDispatches:4,retriesUsed:3,userDirectedDispatches:0,diagnostics:unit.diagnostics,actionIds:['resume-1']};
 const progress={...old.attempts[0]!.progress,status:'paused',requiresUserInput:true,recovery,retriesUsed:3,executionId:'execution-4',failedUnit};
 const attempt={...old.attempts[0]!,status:'paused',progress,recovery,unit,unitSummaries:[summary],actions:[action]};
 const checkpoint={...old,attempts:[attempt]};
 assert.deepEqual(decodeDesign(DesignCheckpointSchema,checkpoint),checkpoint);
 assert.deepEqual(decodeDesign(DesignProgressSchema,progress),progress);
 for(const patch of [{dispatches:5},{dispatches:0},{retriesUsed:4},{retriesUsed:-1},{userDirectedDispatches:129},
  {diagnostics:Array(5).fill(unit.diagnostics[0])},{rawTranscript:'private'},{artifactBody:'copied'}]){
  assert.throws(()=>decodeDesign(DesignCheckpointSchema,{...checkpoint,attempts:[{...attempt,unit:{...unit,...patch}}]}));
 }
 for(const patch of [{actions:Array(129).fill(action)},{unitSummaries:Array(130).fill(summary)}]){
  assert.throws(()=>decodeDesign(DesignCheckpointSchema,{...checkpoint,attempts:[{...attempt,...patch}]}));
 }
 assert.throws(()=>decodeDesign(DesignCheckpointSchema,{...checkpoint,attempts:Array(129).fill(attempt)}));
 assert.throws(()=>decodeDesign(DesignProgressSchema,{...progress,baseline:old.attempts[0]!.baseline}));
 for(const patch of [{requiresUserInput:false},{reason:'daemon_restarted'},{status:'passed'}]){
  assert.throws(()=>decodeDesign(DesignRecoveryStateSchema,{...recovery,...patch}));
 }
 assert.throws(()=>decodeDesign(DesignProgressSchema,{...progress,retriesUsed:4}));
});

test('design request validation names the phase and the first offending field, and lists the valid phases for an unknown one',()=>{
 const base={repo:'/x',reviewId:'review',attempt:1};
 assert.throws(()=>parseDesignRequest({phase:'result',...base}),(e:unknown)=>e instanceof DesignReviewInputError&&e.code==='invalid_schema'&&/^result request: \/executionId: /.test(e.message));
 assert.throws(()=>parseDesignRequest({phase:'recover',...base,operation:'resume'}),(e:unknown)=>e instanceof DesignReviewInputError&&e.code==='invalid_schema'&&/^recover request: \/actionId: /.test(e.message));
 for(const bad of [{phase:'nope',...base},{...base},null,'start'])
  assert.throws(()=>parseDesignRequest(bad),(e:unknown)=>e instanceof DesignReviewInputError&&e.code==='invalid_schema'&&/^phase: Expected one of start, progress, assignment, plan, impact, activity, result, recover, failure$/.test(e.message));
 assert.equal(parseDesignRequest({phase:'start',...base,attempt:2,artifactPath:'/x/y'}).phase,'start','a valid request stays valid');
});
