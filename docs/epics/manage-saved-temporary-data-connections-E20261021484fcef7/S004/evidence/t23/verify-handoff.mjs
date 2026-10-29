/** Run from the repository root with Node22 --import tsx. No service or mutation admission. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {removalConfirmation,removalDecision,removalInProgress,projectRemovalState,projectRemovalRejection} from '../../../../../../src/shared/connection-removal.ts';
const folder='docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004';
const cases=[];
for(const scope of ['saved','temporary']){
 const key={repoRoot:'/example/repo',scope,id:'example'},expectedRevision='33333333-3333-4333-8333-333333333333';
 const operationId=scope==='saved'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222';
 // Pure projection input only. Never a signed capability or a usable live ticket.
 const ticket={operationId,lookupRoot:key.repoRoot,scope,connectionId:key.id,mode:'remove',issuedAt:'2026-10-29T00:00:00.000Z',expiresAt:'2026-10-30T00:00:00.000Z',signature:'unsigned-contract-fixture'};
 const confirmation=removalConfirmation(key,expectedRevision);assert.equal(removalDecision(confirmation,'cancel'),undefined);
 cases.push({scope,phase:'confirming',confirmation,operationIssuedBeforeConfirmation:false,cancelCommand:null,confirmedSelection:removalDecision(confirmation,'confirm')});
 cases.push({scope,phase:'removing',state:removalInProgress(ticket)});
 for(const code of ['busy','conflict'])cases.push({scope,phase:code,state:projectRemovalRejection(ticket,code)});
 for(const status of ['not-seen','pending','reconciliation-required'])cases.push({scope,phase:'unknown',genericStatus:status,state:projectRemovalState(ticket,{status})});
 const outcome={operationId,revision:'44444444-4444-4444-8444-444444444444',registration:'removed',activation:'not-applicable',credentialCleanup:'complete'};
 for(const [credentialCleanup,resourceCleanup] of scope==='saved'?[['pending','complete'],['complete','pending'],['pending','pending'],['complete','complete']]:[['complete','pending'],['complete','complete']]){
  const state=projectRemovalState(ticket,{status:'committed',value:{...outcome,credentialCleanup}},resourceCleanup);
  cases.push({scope,phase:state.state,state});
 }
}
const expected={version:1,protocolVersion:2,purpose:'S005 response/copy fixtures; no live tickets, credentials, endpoints or session capabilities.',releaseEnabled:false,clients:{vscode:{rendering:'pending',keyboard:'pending'},jetbrains:{rendering:'pending',keyboard:'pending'}},requests:{ticket:{fields:['key','mode'],mode:'remove'},mutate:{requiredFields:['ticket','operationId','key','mode','expectedRevision'],mode:'remove',forbiddenFields:['publicPatch','credentials']},removalState:{method:'db.connections.v2.removalState',fields:['ticket']},retryRemovalCleanup:{method:'db.connections.v2.retryRemovalCleanup',fields:['ticket']}},cases};
const fixturePath=join(folder,'consumer-contract-fixtures.json');
if(process.argv.includes('--write'))writeFileSync(fixturePath,JSON.stringify(expected,null,2)+'\n');
assert.deepEqual(JSON.parse(readFileSync(fixturePath,'utf8')),expected);
const artifactPath='.insrc/artifacts/LLD-484fcef7efaf229e-s4.json',lld=JSON.parse(readFileSync(artifactPath,'utf8'));
assert.ok(lld.meta.approvedAt);assert.ok(JSON.stringify(lld.body.contractDetails).includes('prepareRemoval'));
assert.equal(lld.body.erDefinition.classes.ConnectionKey.attributes.receipts.range,'RemovalReceipt');assert.equal(lld.body.erDefinition.classes.ConnectionKey.attributes.receipts.multivalued,true);assert.equal(lld.body.erDefinition.classes.RemovalReceipt.attributes.retired.multivalued,true);
assert.equal(lld.body.sequenceDefinition.participants.length,6);assert.equal(lld.body.sequenceDefinition.messages.length,11);
const companions={};
for(const companion of lld.body.companions){
 const html=readFileSync(companion.relPath,'utf8');assert.match(html,/mermaid/i);assert.doesNotMatch(html,/<script\b[^>]*\bsrc\s*=/i);assert.ok(html.includes(lld.body.erDefinition.id)||html.includes(lld.body.sequenceDefinition.id)||html.includes('RemovalReceipt')||html.includes('Authenticated v2 adapter'));
 companions[companion.relPath]=createHash('sha256').update(html).digest('hex');
}
const handoff=readFileSync(join(folder,'S005-HANDOFF.html'),'utf8');
for(const text of ['retireRemoved','prepareRemoval','cancelRemoval','No data rewrite','nonrollbackable','S005','unverified','SQL Server','provider','6,713','8 fail','134 skip','3 TODO'])assert.ok(handoff.includes(text),'Missing handoff requirement: '+text);
assert.equal(cases.filter(c=>c.phase==='confirming').length,2);assert.equal(cases.filter(c=>c.phase==='removed').length,2);assert.equal(cases.filter(c=>c.phase==='removed-cleanup-pending').length,4);
const result={subject:'CM-S4-CLIENT',result:'backend-contract-smoke-pass',cases:cases.length,clients:expected.clients,releaseEnabled:false,approvedLldSha256:createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),approvedPlanSha256:createHash('sha256').update(readFileSync('.insrc/artifacts/PLAN-484fcef7efaf229e-s4.json')).digest('hex'),companions,sourceInspection:true,nativeChromeAccessibility:'ER page loaded with five entities and generated Mermaid text; later screenshot/window observation showed another tab.',visualRenderingVerified:false,visualLimit:'Browser automation inventory is empty. Native Chrome accessibility preview succeeded for ER content, but the screenshot returned an unrelated GitHub tab; no layout verification or sequence graphical verification is claimed.',erratum:'Approved LLD section 3.4 retains an outdated illustrative retireRemoved name. The approved section 2.6 and implemented contract use prepareRemoval/commitRemoval/cancelRemoval; the handoff clarifies this without silently changing the approved plan basis.',historicalDiagramEvidencePreserved:'evidence/diagram-source-check.json',historicalS003SweepPreserved:'../S003/evidence/full-sweep-20261029'};
writeFileSync(join(folder,'evidence/t23/contract-and-artifact-smoke.json'),JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result)+'\n');
