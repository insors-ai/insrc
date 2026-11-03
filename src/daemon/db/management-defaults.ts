/** Default daemon-owned initialization. Existing legacy registries require offline adoption. */
import { randomUUID, createHash } from 'node:crypto';
import { lstat, realpath, link, unlink, chmod, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { lookupRepoId } from '../../db/repos.js';
import { connectionsPath } from './config.js';
import { privateDirectory, writeProtected, syncDirectory } from './management-files.js';
import { ManagementOwnerLease } from './management-owner-lease.js';
import { ManagementStateFile } from './management-state.js';
import { ManagedStoreError, managementMarkerExists, managementStateDirectory, readRegistrySnapshot, registryAnchor, proveProtectedRegistry, proveWriterFence } from './managed-store.js';
import { SavedTicketAuthority } from './management-tickets.js';
import { credentialKeystore } from './secrets.js';
import { connectionManagementEnablement } from './management-enablement.js';
import { openManagedRoot } from './management-startup.js';
import type { StartupPorts } from './management-startup.js';
import { savedManagementFor } from './management.js';

/** Publish a new read-only registry exclusively; never overwrite or migrate existing data. */
export async function initializeFreshManagedRoot(root:string, ports:StartupPorts):Promise<void>{
 if(process.getuid?.()===undefined||process.getuid()===0||process.geteuid?.()!==process.getuid()||await realpath(root)!==root||!await ports.isRegistered(root))throw new ManagedStoreError('recovery-required');
 const policy=await (ports.enablement??connectionManagementEnablement)();if(!policy.ready)throw new ManagedStoreError('recovery-required');
 const path=connectionsPath(root),parentPath=dirname(path),directory=managementStateDirectory(path);
 const before=await readRegistrySnapshot(path,true);
 if(!before.missing||await managementMarkerExists(path))throw new ManagedStoreError('recovery-required');
 // Only an absent registry can take this path. No legacy writable inode is adopted.
 await mkdir(dirname(parentPath),{recursive:true,mode:0o700});
 const ancestor=await lstat(dirname(parentPath));if(!ancestor.isDirectory()||ancestor.isSymbolicLink()||ancestor.uid!==process.getuid())throw new ManagedStoreError('recovery-required');
 const parent=await lstat(parentPath).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return undefined;throw error;});
 if(parent&&(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid()))throw new ManagedStoreError('recovery-required');
 if(parent)await chmod(parentPath,0o700);
 await privateDirectory(parentPath);await proveWriterFence(parentPath);
 // Atomic mkdir is the cross-process claim. Partial initialization remains a recovery marker.
 await mkdir(directory,{mode:0o700});await syncDirectory(parentPath);
 const lease=await ManagementOwnerLease.acquire(join(directory,'owner.json'),root);
 let temporary:string|undefined;
 try{
  if(!(await readRegistrySnapshot(path,true)).missing)throw new ManagedStoreError('recovery-required');
  const registryId=randomUUID(),initialGeneration=randomUUID(),snapshotName=`snapshot-${randomUUID()}.json`;
  await writeProtected(join(directory,snapshotName),Buffer.alloc(0),true);
  await writeProtected(join(directory,'preparing.json'),JSON.stringify({version:2,root,registryId,initialGeneration,snapshotName,baselineDigest:before.digest}),true);
  const tickets=await SavedTicketAuthority.open({root,registryId,adopted:false,keystore:ports.keystore??credentialKeystore,isRegistered:ports.isRegistered});
  const info=await lstat(parentPath);
  const state=await ManagementStateFile.create(directory,{version:2,root,registryId,phase:'adopting',initialGeneration,parent:{inode:info.ino,device:info.dev},baseline:{name:snapshotName,digest:before.digest,missing:true,mode:0},initializedBy:{pid:lease.owner.pid,processIdentity:lease.owner.processIdentity,createdAt:new Date().toISOString()},rollback:[],releaseDigest:policy.digest,committed:registryAnchor(before)},tickets);
  const bytes=JSON.stringify({connections:[],_management:{version:2,registryId,generation:initialGeneration,revisions:{},receipts:{}}})+'\n';
  temporary=join(parentPath,`.db-connections-${randomUUID()}.tmp`);await writeProtected(temporary,bytes,true);
  if(!await ports.isRegistered(root)||!await lease.current())throw new ManagedStoreError('recovery-required');
  // link is exclusive and publishes an already protected inode. EEXIST preserves a racing writer.
  await link(temporary,path);await syncDirectory(parentPath);await unlink(temporary);temporary=undefined;
  const current=await readRegistrySnapshot(path);
  if(current.digest!==createHash('sha256').update(bytes).digest('hex'))throw new ManagedStoreError('recovery-required');
  await proveProtectedRegistry(path);await state.update({...await state.current(),phase:'managed',committed:registryAnchor(current)});
 }finally{if(temporary)await unlink(temporary).catch(()=>{});await lease.close();}
}

const owners=new Map<string,Promise<{close:()=>Promise<void>}>>();
let closing=false;
/** Main-thread owners also cover roots registered after daemon startup. */
export async function ensureDefaultManagedRoot(root:string,ports:StartupPorts={isRegistered:async candidate=>await lookupRepoId(candidate)!==undefined}):Promise<void>{
 if(closing)throw new ManagedStoreError('recovery-required');
 if(savedManagementFor(root))return;
 let pending=owners.get(root);
 if(!pending){pending=(async()=>{if(!await managementMarkerExists(connectionsPath(root)))await initializeFreshManagedRoot(root,ports);return await openManagedRoot(root,ports);})();owners.set(root,pending);}
 try{await pending;}catch(error){if(owners.get(root)===pending)owners.delete(root);throw error;}
}
export async function closeDefaultManagedRoots():Promise<void>{
 closing=true;const settled=await Promise.allSettled([...owners.values()]);owners.clear();
 const closed=await Promise.allSettled(settled.filter((result):result is PromiseFulfilledResult<{close:()=>Promise<void>} >=>result.status==='fulfilled').map(result=>result.value.close()));
 const failures=closed.filter((result):result is PromiseRejectedResult=>result.status==='rejected');
 if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'Connection owners could not all close.');
}
