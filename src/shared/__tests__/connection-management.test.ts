import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseMutationRequest, parseOperationTicket, ManagementInputError } from '../connection-management-wire.js';
import type { MutationRequest, ManagementCapabilities, ManagementEnvelope, MemoryRowSource, SafeConnection } from '../connection-management.js';
import type { ConnectionsFile } from '../db-driver.js';

export const ticket = { operationId:randomUUID(), lookupRoot:'/registered/root', scope:'saved' as const, connectionId:'fixture', mode:'create' as const, issuedAt:'2026-10-24T00:00:00.000Z', expiresAt:'2026-11-23T00:00:00.000Z', signature:'synthetic-signature' };
const request: MutationRequest = { ticket, operationId:ticket.operationId, key:{repoRoot:ticket.lookupRoot,scope:ticket.scope,id:ticket.connectionId},mode:'create',publicPatch:{kind:'postgres',label:'fixture'},credentials:{url:{action:'replace',value:'synthetic'}} };

test('CM-S1-J: v2 wire rejects malformed and mismatched tickets without returning draft values', () => {
 assert.deepEqual(parseMutationRequest(request),request);
 for (const malformed of [null,[],{}, {...request,unexpected:'secret-canary'}, {...request,ticket:{...ticket,secretRef:'secret-canary'}}, {...request,ticket:{...ticket,issuedAt:'yesterday'}}, {...request,key:{...request.key,repoRoot:'/another/root'}}, {...request,key:{...request.key,id:'other'}}, {...request,credentials:{url:{action:'keep',value:'secret-canary'}}}, {...request,mode:'update'}, {...request,mode:'remove',expectedRevision:'r'}]) {
  assert.throws(()=>parseMutationRequest(malformed), (e:unknown)=>e instanceof ManagementInputError && !e.message.includes('secret-canary'));
 }
 assert.throws(()=>parseOperationTicket({...ticket,expiresAt:ticket.issuedAt}),ManagementInputError);
});

test('CM-S1-J: legacy document remains readable and v2 declarations preserve safe outcome boundaries', () => {
 const legacy: ConnectionsFile = { connections:[{id:'fixture',kind:'csv',path:'data.csv'}], retained:{opaque:true} };
 const envelope: ManagementEnvelope = {version:2,registryId:'registry',generation:'generation',revisions:{fixture:'r'},receipts:{}};
 const managed: ConnectionsFile = {...legacy,_management:envelope};
 assert.deepEqual(JSON.parse(JSON.stringify(managed)), managed);
 assert.deepEqual(managed.connections,legacy.connections);
 const capability:ManagementCapabilities={version:2,daemonEpoch:'epoch',features:[],receiptRetentionDays:30};
 assert.equal(capability.version,2);
 // These compile-time assignments intentionally reject stored credentials on the wire.
 const safe:SafeConnection={key:request.key,revision:'r',kind:'csv',family:'file',effectiveFamily:'file',publicConfig:{path:'fixture.csv'},credentialPresence:{}};
 // @ts-expect-error SafeConnection has no raw config/secretRef slot.
 const unsafe:SafeConnection={...safe,secretRef:'stored-ref'};
 void unsafe;
 const rowSource: MemoryRowSource | undefined = undefined;
 assert.equal(rowSource,undefined);
});


test('CM-S1-J: protocol declarations compile in strict NodeNext including negative secret-field assignments', () => {
 const program=ts.createProgram([fileURLToPath(import.meta.url)], {strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,noEmit:true,skipLibCheck:true,esModuleInterop:true,verbatimModuleSyntax:true,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,target:ts.ScriptTarget.ES2022,types:['node']});
 assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
});
