import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectionManagementEnablement, verifyConnectionManagementRelease } from '../../daemon/db/management-enablement.js';

const directory='docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005';
const json=(name:string)=>JSON.parse(readFileSync(join(directory,name),'utf8'));

test('CM-S5-GATE: default runtime policy preserves authorization and independent release-audit evidence',async()=>{
 const inventory=json('consumer-inventory.json');
 assert.equal(inventory.releaseEnabled,false);assert.equal(inventory.producerPolicyModified,true);assert.equal(inventory.runtimeEnabled,true);
 for(const [file,digest] of Object.entries(inventory.files)){
  assert.ok(existsSync(file),file);
  // The shared activation file also has independently owned in-flight changes.
  if(file!=='vscode-plugin/src/extension.ts')assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),digest,file);
 }
 for(const state of Object.values(inventory.externalPrerequisites))assert.match(String(state),/^pending/);
 const matrix=json('acceptance-matrix.json');assert.equal(matrix.subjects.length,20);assert.equal(matrix.manualAcceptance.owner,'user');assert.equal(matrix.manualAcceptance.status,'pending');assert.equal(matrix.releaseEnabled,false);assert.equal(matrix.runtimeEnabled,true);
 assert.equal((await connectionManagementEnablement()).ready,true);
 assert.equal((await connectionManagementEnablement(undefined,['sc5','sc6'])).ready,true);
 const temporary=mkdtempSync(join(tmpdir(),'s5-gate-'));
 try{
  const forged=join(temporary,'gates.json');writeFileSync(forged,JSON.stringify({...inventory,version:2,ready:true,scopes:['sc1','sc2','sc3','sc4','sc5','sc6','sc7','sc8']}));
  assert.equal((await verifyConnectionManagementRelease(pathToFileURL(forged),['sc5','sc6'])).ready,false,'consumer coverage cannot substitute for producer proofs');
 }finally{rmSync(temporary,{recursive:true,force:true});}
});

test('CM-S5-ARTIFACTS: final structured UX/interaction definitions and regenerated companions agree with implementation and honest acceptance limits',()=>{
 const definitions=json('implementation-definitions.json');
 assert.match(definitions.uxDefinition.narrative,/independent advertised-capability/);
 assert.match(definitions.uxDefinition.narrative,/user after plugin installation/);
 for(const component of definitions.componentDependencyDefinition.components)if(component.path)assert.ok(existsSync(component.path),component.path);
 const refs=json('implementation-companions.json');assert.equal(refs.length,3);
 for(const ref of refs){const html=readFileSync(ref.relPath,'utf8');assert.match(html,/Live acceptance pending user manual testing/);assert.match(html,/implementation-definitions.json/);assert.ok(html.length>1000);}
 assert.match(readFileSync(join(directory,'MANUAL-ACCEPTANCE.md'),'utf8'),/Tasks 26–29 remain pending/);
});
