/** Scope routing stays privileged in the extension host, never in renderer payloads. */
import type { ConnectionKey } from '../../../src/shared/connection-management.js';
import { ConnectionMutationController } from '../../../src/shared/connection-manager/controller.js';
import type { MutationPorts } from '../../../src/shared/connection-manager/controller.js';
import { decodeMutationOutcome } from '../../../src/shared/connection-manager/wire.js';
import { ConnectionsWorkbenchOwner, ConnectionOwnerError } from './session-owner.js';
import { ConnectionDraftTests } from '../../../src/shared/connection-manager/test-controller.js';
import { connectionMutationSupported } from '../../../src/shared/connection-manager/capabilities.js';

export function createConnectionsDraftTests(owner:ConnectionsWorkbenchOwner):ConnectionDraftTests {
 const tests=new ConnectionDraftTests({source:(key,epoch)=>owner.draftTestSource(key,epoch)});
 const invalidation=owner.onTemporaryInvalidated(()=>tests.endTemporary());
 const dispose=tests.dispose.bind(tests);tests.dispose=()=>{invalidation.dispose();dispose();};
 return tests;
}

export function createConnectionsMutationController(owner:ConnectionsWorkbenchOwner,timing:Pick<MutationPorts,'now'|'timer'>={}):ConnectionMutationController {
 let lifetime=0;
 const stamp=(key:ConnectionKey):string|null=>key.scope==='saved'?null:JSON.stringify([owner.view.daemonEpoch,lifetime]);
 const controller=new ConnectionMutationController({
  ...timing,
  sessionStamp:stamp,
  call:async(key,method,params,expected)=>{
   if(!connectionMutationSupported(owner.features(key.repoRoot),key.scope,method,params))throw new ConnectionOwnerError('upgrade-required');
   if(key.scope==='saved')return await owner.requestSaved(key.repoRoot,method,params);
   if(expected===null||stamp(key)!==expected)throw new ConnectionOwnerError('expired');
   // Only explicit recovery/status may resume a live owner. Never replay a mutation during reconnect.
   if(method.endsWith('.status')&&owner.view.status==='offline')await owner.selectRoot(key.repoRoot);
   if(stamp(key)!==expected)throw new ConnectionOwnerError('expired');
   const response=await owner.requestTemporary(key.repoRoot,owner.view,method,params);
   // An authenticated expiry response revokes inputs immediately, including on status/read-shaped calls.
   try{const result=decodeMutationOutcome(response,{key});if(result.status==='rejected'&&result.code==='session-expired')owner.expireTemporary();}catch{/* The effect's own strict decoder handles other reply shapes. */}
   return response;
  },
  refresh:async key=>{
   const view=await owner.selectRoot(key.repoRoot);
   return await owner.requestTemporary(key.repoRoot,view,'db.connections.v2.list',{repoRoot:key.repoRoot});
  },
  expireTemporary:()=>owner.expireTemporary(),
 });
 const invalidation=owner.onTemporaryInvalidated(()=>{lifetime++;controller.endTemporary();});
 const dispose=controller.dispose.bind(controller);
 controller.dispose=()=>{invalidation.dispose();dispose();};
 return controller;
}
