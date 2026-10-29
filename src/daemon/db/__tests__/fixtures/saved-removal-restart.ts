/** Isolated real-process crash fixture. Only synthetic signing keys use this test-owned fake vault. */
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PATHS } from '../../../../shared/paths.js';
import { connectionsPath } from '../../config.js';
import { ManagedRegistry, PreparationJournal, readRegistrySnapshot } from '../../managed-store.js';
import { SavedTicketAuthority } from '../../management-tickets.js';
import { CredentialGenerations } from '../../secrets.js';
import { DriverPool } from '../../pool.js';
import { SavedConnectionManagement } from '../../management.js';
import type { MutationRequest } from '../../../../shared/connection-management.js';
import '../../drivers/index.js';

const [directory,mode]=process.argv.slice(2);
if(!directory||!['before-rename','after-rename','status'].includes(mode??''))throw new Error('Invalid fixture invocation.');
const root=await realpath(join(directory,'repo'));
Object.defineProperty(PATHS,'insrc',{value:join(directory,'state'),configurable:true});
const path=connectionsPath(root),vaultPath=join(directory,'fake-vault.json'),requestPath=join(directory,'request.json');
let values:Record<string,string>={};
if(mode==='status')values=JSON.parse(await readFile(vaultPath,'utf8'));
else{
 await mkdir(dirname(path),{recursive:true});
 await writeFile(path,JSON.stringify({connections:[{id:'selected',kind:'postgres',url:'postgres://host/db'}],_management:{version:2,registryId:randomUUID(),generation:randomUUID(),revisions:{selected:randomUUID()},receipts:{}}},null,2)+'\n',{mode:0o400});
}
const keystore={getKey:async(ref:string)=>values[ref]??null,setKey:async(ref:string,value:string)=>{values[ref]=value;await writeFile(vaultPath,JSON.stringify(values),{mode:0o600});},deleteKey:async(ref:string)=>{delete values[ref];await writeFile(vaultPath,JSON.stringify(values),{mode:0o600});}};
const snapshot=await readRegistrySnapshot(path),registryId=snapshot.file._management!.registryId;
const store=await ManagedRegistry.open(path,{ownsRoot:async()=>true,boundary:async stage=>{if(stage===mode)process.exit(73);}});
const journal=await PreparationJournal.open(path,registryId);
const tickets=await SavedTicketAuthority.open({root,registryId,adopted:mode==='status',keystore,isRegistered:async candidate=>candidate===root});
const generations=new CredentialGenerations(journal,'a'.repeat(32),{keystore,current:()=>store.inspect()});
const pool=new DriverPool(root);await pool.reload();
const service=await SavedConnectionManagement.create({root,store,tickets,generations,pool,enabled:async()=>true,isRegistered:async candidate=>candidate===root,activate:async()=>{},readSecret:keystore.getKey});
const context={connectionIdentity:'restart-fixture',access:{lookupRoot:root,managementRepoRoot:root,daemonEpoch:'fixture-epoch'}};
if(mode!=='status'){
 const key={repoRoot:root,scope:'saved' as const,id:'selected'},ticket=await service.ticket(context,key,'remove');
 const request:MutationRequest={ticket,operationId:ticket.operationId,key,mode:'remove',expectedRevision:snapshot.file._management!.revisions['selected']!};
 await writeFile(requestPath,JSON.stringify(request),{mode:0o600});await service.mutate(context,request);
 throw new Error('Expected process crash did not occur.');
}
const request:MutationRequest=JSON.parse(await readFile(requestPath,'utf8'));
const status=await service.status(context,request.ticket);
process.stdout.write('removal-restart-result:'+JSON.stringify({status:status.status,...(status.status==='committed'?{registration:status.value.registration}:{}),connections:store.snapshot.file.connections.map(c=>c.id),journal:(await journal.pending()).length})+'\n');
await pool.closeAll();await store.close();
