import type { ConnectionScope } from '../connection-management.js';

/** Advertised metadata is a client admission check; daemon authorization remains authoritative. */
export type ConnectionAction = 'create'|'update'|'remove'|'test'|'status'|'activation'|'cleanup'|'read';
export const CONNECTION_MANAGER_BASE = ['safe-read','driver-descriptors','workbench-sessions','session-delegation'] as const;
const signedSaved = ['operation-tickets','operation-status','immutable-credentials','full-use-leases','memory-only-files'];
export function connectionActionSupported(features:readonly string[],scope:ConnectionScope,action:ConnectionAction,mode:'create'|'update'|'remove'='create'):boolean {
  if((scope!=='saved'&&scope!=='temporary')||!['create','update','remove'].includes(mode))return false;
  const has=(required:readonly string[])=>required.every(feature=>features.includes(feature));
  if(!has(CONNECTION_MANAGER_BASE))return false;
  switch(action){
    case 'read':return true;
    case 'create':case 'update':return scope==='temporary'||has([...signedSaved,`saved-${action}`]);
    case 'remove':return has([`${scope}-remove`,'removal-state','removal-cleanup-retry',...scope==='saved'?signedSaved:[]]);
    case 'test':return has(['draft-test','test-cancellation']);
    case 'status':return scope==='temporary'||has(['operation-status']);
    case 'activation':return scope==='temporary'||has(['activation-retry']);
    case 'cleanup':return mode==='remove'?has(['removal-state','removal-cleanup-retry']):connectionActionSupported(features,scope,'status');
  }
  return false;
}
export function connectionOperationSupported(features:readonly string[],scope:ConnectionScope,mode:'create'|'update'|'remove',action:string):boolean {
  if(action==='dismiss')return true;
  const mapped=action==='reconcile'?'status':action==='replay'?mode:action==='refresh'?'read':action;
  return ['create','update','remove','test','status','activation','cleanup','read'].includes(mapped)&&connectionActionSupported(features,scope,mapped as ConnectionAction,mode);
}
export function connectionMutationSupported(features:readonly string[],scope:ConnectionScope,method:string,params:unknown):boolean {
  if(!method.startsWith('db.connections.v2.'))return false;
  const action=method.slice('db.connections.v2.'.length);
  if(action==='status'||action==='activate')return connectionActionSupported(features,scope,action==='status'?'status':'activation');
  if(action==='removalState')return connectionActionSupported(features,scope,'read')&&features.includes('removal-state');
  if(action==='retryRemovalCleanup')return connectionActionSupported(features,scope,'cleanup','remove');
  const mode=(params as {mode?:unknown})?.mode;
  return (action==='ticket'||action==='mutate')&&(mode==='create'||mode==='update'||mode==='remove')&&connectionActionSupported(features,scope,mode);
}
export interface ConnectionControls {readonly save:boolean;readonly test:boolean;readonly remove:boolean;readonly operations:Readonly<Record<string,readonly string[]>>}
