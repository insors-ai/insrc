/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuationFixture } from './continuation-fixtures.js';
import { assertInvestigationBindings, admitInvestigationRequest, createInvestigationPolicy } from '../continuation-policy.js';
test('sc3 bindings, backend qualification and inclusive continuation policy',()=>{
 const {context,turn,provider}=continuationFixture();assert.equal(assertInvestigationBindings(turn,context),300000);
 assert.throws(()=>assertInvestigationBindings({...turn,generation:2},context),{code:'invalid-binding'});
 assert.throws(()=>assertInvestigationBindings(turn,{...context,authorParty:'daemon'}),{code:'invalid-binding'});
 assert.throws(()=>assertInvestigationBindings(turn,{...context,backend:{...context.backend,qualification:{...context.backend.qualification,pinnedReads:false}}}),{code:'unsupported-backend'});
 assert.throws(()=>assertInvestigationBindings({...turn,assignment:['foreign']},context),{code:'invalid-binding'});
 assert.throws(()=>assertInvestigationBindings({...turn,limits:{...turn.limits,attemptMs:300001}},context),{code:'budget-refused'});
 const shortened={...context,state:{...context.state,consumedActiveMs:context.policy.activeLimitMs-1500}};
 assert.equal(assertInvestigationBindings({...turn,limits:{...turn.limits,attemptMs:1500,activeMsRemaining:1500}},shortened),1500);
 assert.throws(()=>admitInvestigationRequest(context.policy,{text:'x'.repeat(400000)},context.schema),{code:'budget-refused'});
 assert.throws(()=>createInvestigationPolicy(provider,{activeLimitMs:0}),{code:'invalid-binding'});
 const budget=admitInvestigationRequest(context.policy,context.seed,context.schema);assert.ok(budget.schemaTokens>0);assert.ok(budget.declaredToolsTokens>0);
});
