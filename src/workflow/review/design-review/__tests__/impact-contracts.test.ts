import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN_LIMITS, DesignCheckpointSchema, DesignFindingDecisionSchema, DesignImpactOutputSchema, DesignImpactSchema, DesignReportImpactSchema, decodeDesign, parseDesignRequest } from '../contracts.js';
import { designFixture } from './fixtures.js';

const impact = () => ({baselineAttempt:1,mode:'affected_chunks',changes:['Contract corrected'],directChunkIds:['edited'],indirectChunkIds:[],rationale:'Review corrected contract and consistency',chunkMapping:[{priorIds:['old'],currentIds:['edited'],explanation:'Same contract concern'}],retainedCoverage:[],carriedFindingIds:[],consistencyChunkIds:['final']});
const plan = {chunks:[{id:'edited',title:'Contract',selectors:['/body/summary'],concerns:['correctness'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:['/body'],concerns:['consistency'],dependsOn:['edited'],purpose:'consistency'}],coverageExplanation:'Complete scope',finalConsistencyChunkId:'final',coverage:[{unitId:'/body/summary',chunkIds:['edited']}]};

test('strict impact/disposition/projection schemas reject extras, wrong branches and bounds', () => {
 const value=impact();assert.deepEqual(decodeDesign(DesignImpactSchema,value),value);
 for(const patch of [{extra:true},{baselineAttempt:0},{baselineAttempt:129},{mode:'guess'},{directChunkIds:['edited','edited']},{changes:['x'.repeat(DESIGN_LIMITS.text+1)]},{retainedCoverage:[{chunkId:'keep',fromAttempt:1,fromChunkId:'keep',justification:'safe',copiedResult:{}}]},{chunkMapping:Array.from({length:129},()=>({priorIds:[],currentIds:[],explanation:'mapping'}))}])assert.throws(()=>decodeDesign(DesignImpactSchema,{...value,...patch}));
 const source={attempt:1,chunkId:'old',findingId:'f1'},base={source,rationale:'Checked current contract',evidenceReferences:['docs/LLD.md']};
 for(const decision of [{...base,action:'carry'},{...base,action:'resolved',reviewedInChunkIds:['edited']},{...base,action:'superseded',reviewedInChunkIds:['edited'],supersededBy:{chunkId:'edited',findingId:'new'}}])assert.deepEqual(decodeDesign(DesignFindingDecisionSchema,decision),decision);
 for(const decision of [{...base,action:'resolved'},{...base,action:'carry',reviewedInChunkIds:['edited']},{...base,action:'superseded',reviewedInChunkIds:['edited']},{...base,action:'resolved',reviewedInChunkIds:['edited','edited']},{...base,action:'carry',evidenceReferences:[]},{...base,action:'carry',source:{...source,extra:true}}])assert.throws(()=>decodeDesign(DesignFindingDecisionSchema,decision));
 const projection={baselineAttempt:1,mode:'affected_chunks',coverageOrigins:[{chunkId:'edited',kind:'fresh'},{chunkId:'keep',kind:'retained',fromAttempt:1,fromChunkId:'keep',justification:'Unchanged concern'}],findingDecisions:[],effectiveFindingOrigins:[source]};
 assert.deepEqual(decodeDesign(DesignReportImpactSchema,projection),projection);
 for(const key of Object.keys(projection)){const missing={...projection} as Record<string,unknown>;delete missing[key];assert.throws(()=>decodeDesign(DesignReportImpactSchema,missing));}
 assert.equal(decodeDesign(DesignReportImpactSchema,{...projection,effectiveFindingOrigins:Array.from({length:257},(_,i)=>({...source,findingId:'f'+i}))}).effectiveFindingOrigins.length,257);
 assert.throws(()=>decodeDesign(DesignReportImpactSchema,{...projection,effectiveFindingOrigins:[{...source,attempt:129}]}));
 assert.throws(()=>decodeDesign(DesignReportImpactSchema,{...projection,coverageOrigins:[{chunkId:'keep',kind:'retained',fromAttempt:1,fromChunkId:'keep',justification:'safe',body:{}}]}));
 assert.deepEqual(decodeDesign(DesignImpactOutputSchema,{plan,impact:value}),{plan,impact:value});
 assert.equal(parseDesignRequest({phase:'impact',repo:'/project',reviewId:'r1',attempt:2,executionId:'e1',sequence:1,plan,impact:value}).phase,'impact');
});

test('old full checkpoints decode and new attempt metadata remains bounded and strict', t => {
 const {checkpoint}=designFixture(t);assert.deepEqual(decodeDesign(DesignCheckpointSchema,checkpoint),checkpoint);
 const a=checkpoint.attempts[0]!;a.preparationKind='impact';a.impact=decodeDesign(DesignImpactSchema,impact());
 a.current={kind:'impact',executionId:'e1',sequence:0,issuedAt:a.startedAt};
 a.progress.coverageProgress={plannedChunks:2,selectedChunks:2,reviewedChunks:0,retainedChunks:0,effectiveCompletedChunks:0};
 assert.deepEqual(decodeDesign(DesignCheckpointSchema,checkpoint),checkpoint);
 a.progress.coverageProgress.plannedChunks=129;assert.throws(()=>decodeDesign(DesignCheckpointSchema,checkpoint));
});
