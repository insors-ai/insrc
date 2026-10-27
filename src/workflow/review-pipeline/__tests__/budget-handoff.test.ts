import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { preflightProviderReviewBudget, reviewPromptChars, reviewWireSchemaJson } from '../../../agent/providers/review-budget.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import type { ReviewExecutionBudget } from '../../../shared/review-budget.js';
import { createReviewBudgetPolicy } from '../budget.js';
import { createReviewJob } from '../job.js';
import { runReviewJob } from '../driver.js';
import { atom, toyAdapter, toySnapshot, atomIdsIn, asSent } from './toy-adapter.js';
import type { ReviewAdapter } from '../types.js';
import type { ReviewCallEvent } from '../call-events.js';
import { controllerPolicy, admitControllerFrame } from '../controller.js';
import { CONTROLLER_DECLARATION } from '../../../daemon/steps/code-review-step/__tests__/controller-client.js';

test('assembled code design provider and controller boundaries enforce the same inclusive budget evidence timing and safe telemetry', async () => {
	for (const originalChars of [371253, 225429]) {
		for (const mode of ['structured', 'reviewer-session'] as const) {
			const profile = new CliProvider({ kind: 'codex', model: 'fixture' }).getReviewBudgetProfile(mode);
			const policy = createReviewBudgetPolicy(profile, mode);
			const atoms = Array.from({ length: 12 }, (_, index) => ({ ...atom(index + 1), text: 'PRIVATE_SOURCE_CANARY' + 'x'.repeat(Math.floor(originalChars / 12) - 21 + (index === 0 ? originalChars % 12 : 0)) }));
			assert.equal(atoms.reduce((sum, value) => sum + value.text.length, 0), originalChars);
			const snapshot = toySnapshot(atoms);
			const adapter = toyAdapter(snapshot, { execution: mode === 'structured' ? { mode, cwd: '/tmp', timeoutMs: 600000 } : { mode, cwd: '/tmp', deadlineMs: 600000 } }) as ReviewAdapter<unknown>;
			const job = createReviewJob(adapter, 'daemon', snapshot, 384000, { budgetPolicy: policy });
			const events: ReviewCallEvent[] = []; let active = 0, calls = 0;
			const answer = async (text: string, schema: StructuredSchema, opts: { reviewBudget?: ReviewExecutionBudget }) => {
				assert.equal(active++, 0, 'all dispatches remain serial'); calls++;
				try {
					const fields = schema as { properties: { callId: { const: string } } };
					assert.ok(opts.reviewBudget); assert.equal(opts.reviewBudget.policy.totalTokens, 128000);
					const messages: LLMMessage[] = [{ role: 'user', content: text }];
					const prepared = preflightProviderReviewBudget(opts.reviewBudget, profile, mode === 'reviewer-session' ? text.length : reviewPromptChars(profile, messages), reviewWireSchemaJson(profile, schema));
					assert.ok(prepared.schemaTokens > 0 && prepared.nativeReserveTokens > 0 && prepared.completionReserveTokens > 0);
					assert.ok(prepared.estimatedTotalTokens <= prepared.limitTokens);
					return { callId: fields.properties.callId.const, answer: { seen: atomIdsIn(text) } };
				} finally { active--; }
			};
			const provider = { getReviewBudgetProfile: () => profile,
				completeStructured: async (messages: readonly LLMMessage[], schema: StructuredSchema, opts: { reviewBudget?: ReviewExecutionBudget }) => answer(asSent(messages), schema, opts),
				runReviewSession: async (text: string, schema: StructuredSchema, opts: { reviewBudget?: ReviewExecutionBudget }) => answer(text, schema, opts),
			} as unknown as LLMProvider;
			const result = await runReviewJob(job, adapter, provider, { onCallEvent: event => events.push(event) }) as { seen: string[] };
			assert.deepEqual(new Set(result.seen), new Set(atoms.map(value => value.id)), 'all original source atoms survive');
			assert.ok(calls >= 1);
			if (originalChars === 371253 || mode === 'reviewer-session') assert.ok(calls > 1, 'complete reserves force partitioning when required'); assert.equal(events.filter(event => event.event === 'success').length, calls);
			for (const event of events) { assert.equal(event.timing.jobBudgetMs, event.timing.logicalWorkUnits * 600000); assert.ok(event.budget.estimatedTotalTokens <= 128000); }
			assert.ok(!JSON.stringify(events).includes('PRIVATE_SOURCE_CANARY'));
		}
	}
	const declaration = CONTROLLER_DECLARATION, policy = controllerPolicy(declaration).policy;
	const frame = { prompt: { user: 'complete assigned evidence' }, schema: { type: 'object', description: 'schema '.repeat(1000) }, state: 'x'.repeat(22) };
	const admitted = admitControllerFrame(frame, policy, declaration);
	assert.equal(admitted.schemaTokens, 0, 'embedded schemas are counted inside the full frame once');
	assert.equal(admitted.promptChars, JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(frame, null, 2) }] }).length);
	assert.equal(admitControllerFrame(frame, policy, { ...declaration, hostContextReserveTokens: 2000 }).estimatedTotalTokens - admitted.estimatedTotalTokens, 1000);
});

// Production adapters and schemas, with only the external model substituted.
// A large indivisible design request must refuse before dispatch; code material
// must partition without losing any symbol or bypassing final wire accounting.
test('original-size production code and design adapters retain full schemas and enforce inclusive dispatch', async () => {
 const { modelDimensionAdapter, codeReviewSnapshot } = await import('../code-review.js');
 const { adherenceSpec } = await import('../../code-review/dimensions/adherence.js');
 const { conventionsSpec } = await import('../../code-review/dimensions/conventions.js');
 const { coverageSpec } = await import('../../code-review/dimensions/coverage.js');
 const { qualitySpec } = await import('../../code-review/dimensions/quality.js');
 const { functionalCoverageSpec } = await import('../../code-review/dimensions/functional-coverage.js');
 const { designReviewSnapshot, premiseAdapter, templateAdapter } = await import('../design-review.js');
 const { reviewTemplateFor } = await import('../../review/template.js');
 const { ReviewBudgetError } = await import('../budget.js');
 type Subject = import('../../code-review/types.js').CodeReviewSubject;
 type Spec = import('../code-review.js').ModelDimensionSpec<unknown>;
 for (const originalChars of [371253, 225429]) {
  const signatures = Array.from({length:12}, (_,i) => `PRIVATE_SOURCE_CANARY_${i}` + 'x'.repeat(Math.floor(originalChars/12)-`PRIVATE_SOURCE_CANARY_${i}`.length+(i===0?originalChars%12:0)));
  assert.equal(signatures.reduce((n,s)=>n+s.length,0),originalChars);
  const subject: Subject = {repoPath:'/tmp',epicHash:'e1a2b3c4d5e6f708',storyId:'s1',changedFiles:['src/fixture.ts'],approvedLld:{body:{contractDetails:{api:[{name:'fixture',signature:'fixture(): void'}]},functionalDefinition:{requirements:[{id:'FR1',statement:'Retain every symbol.',scope:'doc'}]}}} as unknown as Subject['approvedLld'],approvedPlan:{body:{tasks:[{id:'t1',tests:[{name:'fixture test',level:'unit'}]}]}} as unknown as Subject['approvedPlan'],buildRecord:null};
  const grounding = {symbols:signatures.map((signature,i)=>({entityId:`fixture-${i}`,file:'src/fixture.ts',kind:'function',name:`fixture${i}`,signature,callers:[],callees:[],testsReaching:[]}))};
  for (const make of [adherenceSpec,conventionsSpec,coverageSpec,qualitySpec,functionalCoverageSpec]) {
   const spec = (make as (s:Subject)=>Spec)(subject);
   const mode = spec.sourceInspection?'reviewer-session':'structured';
   const profile = new CliProvider({kind:'codex',model:'fixture'}).getReviewBudgetProfile(mode);
   const policy = createReviewBudgetPolicy(profile,mode);
   const snapshot = codeReviewSnapshot(subject,grounding);
   const adapter = modelDimensionAdapter(spec,subject,snapshot,384000,'daemon',policy);
   const job = createReviewJob(adapter,'daemon',snapshot,384000,{budgetPolicy:policy});
   if(originalChars===371253) assert.equal(job.plan.single,false,`${spec.dimension} partitions oversized production prompts`);
   const held = new Set(job.plan.chunks.flatMap(c=>c.atomIds));
   if(!job.plan.single) assert.equal(held.size,12);
   const seen = new Set<string>(); let calls=0;
   const answer = async (text:string,schema:StructuredSchema,opts:{reviewBudget?:ReviewExecutionBudget}) => {
    calls++; assert.ok(opts.reviewBudget);
    const measured=preflightProviderReviewBudget(opts.reviewBudget,profile,mode==='structured'?reviewPromptChars(profile,[{role:'user',content:text}]):text.length,reviewWireSchemaJson(profile,schema));
    assert.ok(measured.schemaTokens>0 && measured.estimatedTotalTokens<=128000);
    const s=schema as {properties:{callId:{const:string},answer:{properties:Record<string,unknown>,required:string[]}}};
    const props=s.properties.answer.properties;
    const result:Record<string,unknown>={};
    for(const key of s.properties.answer.required ?? []) result[key]=[];
    const ids=[...text.matchAll(/"entityId":\s*"(fixture-\d+)"/g)].map(m=>m[1]!);
    for(const id of ids) seen.add(id);
    if(props['descriptions']) result['descriptions']=[...new Set(ids)].map(atomId=>({atomId,description:'A distinct fixture operation.'}));
    return {callId:s.properties.callId.const,answer:result};
   };
   const provider={getReviewBudgetProfile:()=>profile,completeStructured:async(messages:readonly LLMMessage[],schema:StructuredSchema,opts:{reviewBudget?:ReviewExecutionBudget})=>answer(asSent(messages),schema,opts),runReviewSession:answer} as unknown as LLMProvider;
   await runReviewJob(job,adapter,provider);
   assert.ok(calls>=1); if(!job.plan.single) assert.ok(calls>1); assert.equal(seen.size,12,`${spec.dimension} dispatched every original symbol`);
   const declaration=CONTROLLER_DECLARATION;
   const cp=controllerPolicy(declaration).policy;
   for(const call of job.pending) {
    const frame={next:'judge',state:'x'.repeat(22),prompt:{messages:call.messages},schema:call.schema};
    try {
     const b=admitControllerFrame(frame,cp,declaration);
     assert.ok(b.estimatedTotalTokens<=128000); assert.equal(b.schemaTokens,0);
    } catch(error) {
     assert.ok(error instanceof ReviewBudgetError && error.code==='controller-frame-over-budget','larger host envelope refuses explicitly without dropping production schema');
    }
   }
  }
  const snapshot=designReviewSnapshot('x'.repeat(originalChars));
  const adapters=[premiseAdapter(snapshot,{stage:'define',repo:'/tmp',readEntitiesForRepo:async()=>[]}),templateAdapter(snapshot,{template:reviewTemplateFor('spec'),stage:'design.story',repo:'/tmp',limitMs:600000,timedOut:()=>new Error('fixture timeout')})];
  for(const adapter of adapters) {
   const mode=adapter===adapters[0]?'structured':'reviewer-session';
   const policy=createReviewBudgetPolicy(new CliProvider({kind:'codex',model:'fixture'}).getReviewBudgetProfile(mode),mode);
   let job;
   try { job=createReviewJob(adapter,'daemon',snapshot,384000,{budgetPolicy:policy}); }
   catch(error) { assert.ok(error instanceof ReviewBudgetError); continue; }
   let calls=0;
   const profile=policy.profile;
   const dispatch=async(text:string,schema:StructuredSchema,opts:{reviewBudget?:ReviewExecutionBudget})=>{
    calls++; assert.ok(text.includes(snapshot.documentText!),'complete original document survives'); assert.ok(opts.reviewBudget);
    const b=preflightProviderReviewBudget(opts.reviewBudget,profile,mode==='structured'?reviewPromptChars(profile,[{role:'user',content:text}]):text.length,reviewWireSchemaJson(profile,schema));
    assert.ok(b.schemaTokens>0 && b.estimatedTotalTokens<=128000);
    const callId=(schema as {properties:{callId:{const:string}}}).properties.callId.const;
    const answer=mode==='structured'?{claims:[]}:{items:reviewTemplateFor('spec').items.map(item=>({item:item.id,premises:[{premise:'fixture premise',outcome:'holds',evidence:'fixture evidence',action:''}]}))};
    return {callId,answer};
   };
   await runReviewJob(job,adapter,{getReviewBudgetProfile:()=>profile,completeStructured:async(messages:readonly LLMMessage[],schema:StructuredSchema,opts:{reviewBudget?:ReviewExecutionBudget})=>dispatch(asSent(messages),schema,opts),runReviewSession:dispatch} as unknown as LLMProvider);
   assert.equal(calls,1);
  }
 }
});
