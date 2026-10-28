/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogFixture } from './ledger-fixtures.js';
import { buildLedgerBasis, initializeReviewLedger, appendImpactRequirements } from '../ledger-catalog.js';
import { identifySubject } from '../identity.js';
test('review-s2-ac1 complete catalog, legacy projection and planless obligations',()=>{
 const input=catalogFixture(),basis=buildLedgerBasis(input),ledger=initializeReviewLedger(basis);
 for(const category of ['task','acceptance','change','design','criterion'])assert.ok(ledger.coverage.some(r=>r.category===category));
 assert.equal(ledger.coverage.filter(r=>r.category==='change').length,1);assert.ok(ledger.coverage.every(r=>r.disposition==='pending'));
 assert.ok(basis.requirements.some(r=>r.requirementRef.includes('testStrategy')));
 assert.equal(initializeReviewLedger(buildLedgerBasis(input)).coverage.length,ledger.coverage.length);
 const extended=appendImpactRequirements(basis,[{category:'impact',requirementRef:'impact:caller-1',text:'Check caller',needs:'inspection',allowNotApplicable:false}]);
 assert.equal(extended.requirements.length,basis.requirements.length+1);assert.equal(basis.requirements.length,ledger.coverage.length);
 assert.throws(()=>buildLedgerBasis({...input,criteria:input.criteria.filter(c=>c.id!=='quality')}),{code:'unsupported-obligation'});
 const unknown={...input.lld!.artifact,body:{...input.lld!.artifact.body,unknownBehavior:'new contract'}};
 assert.throws(()=>buildLedgerBasis({...input,lld:{...input.lld!,artifact:unknown}}),{code:'unsupported-obligation'});
 const {subjectId:_,subjectDigest:__,...projection}=input.subject;
 const upstream={artifactId:'ISSUE-root',path:'docs/ISSUE.md',revision:1,contentDigest:'9'.repeat(64)};
 const subject=identifySubject({...projection,contracts:[upstream],taskBasis:'approved-upstream',tasks:[]});
 const planless=buildLedgerBasis({...input,subject,lld:null,plan:null,upstream:[{pin:upstream,text:'Fix data loss'}]});
 assert.ok(planless.requirements.some(r=>r.requirementRef.endsWith('/whole-contract')));assert.ok(!planless.requirements.some(r=>r.category==='task'));
 assert.throws(()=>buildLedgerBasis({...input,subject,lld:null,plan:null,upstream:[]}),{code:'unsupported-obligation'});
});
