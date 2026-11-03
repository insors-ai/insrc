import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,chmod,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {ConnectionConfig,Driver} from '../../../shared/db-driver.js';
import {PATHS} from '../../../shared/paths.js';
import {prepareRuntimeConfig} from '../runtime-config.js';
import {DriverPool} from '../pool.js';
import {connectionsPath} from '../config.js';
import {familyOf,getFactory,registerDriver} from '../registry.js';
import {testConnectionRpc,prepareLegacyProbeConfig} from '../../db-rpc.js';
import '../drivers/index.js';

test('CM-S2-E1: activation and probe runtime paths agree across cwd SQLite URLs and pinned families without writes',async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'probe-paths-'))),root=join(directory,'repo'),other=join(directory,'cwd'),oldCwd=process.cwd(),oldIns=PATHS.insrc;
 await mkdir(root);await mkdir(other);await writeFile(join(root,'data file.csv'),'correct');await writeFile(join(other,'data file.csv'),'decoy');await writeFile(join(root,'schema.prisma'),'model Test {}');
 Object.defineProperty(PATHS,'insrc',{value:join(directory,'state'),configurable:true});
 try {
  process.chdir(other);
  const configs:ConnectionConfig[]=[{id:'file',kind:'csv',path:'data file.csv',family:'rdbms'},{id:'abs',kind:'csv',path:join(root,'data file.csv')},{id:'sqlitepath',kind:'sqlite',path:'data file.csv'},{id:'sqliteurl',kind:'sqlite',url:'data file.csv'},{id:'sqlitefile',kind:'sqlite',url:pathToFileURL(join(root,'data file.csv')).href},{id:'priority',kind:'sqlite',path:'data file.csv',url:'wrong.db'},{id:'schema',kind:'postgres',url:'postgres://host/db',schemaSource:{type:'prisma',path:'schema.prisma'}}];
  const registry=connectionsPath(root);await mkdir(dirname(registry),{recursive:true});await writeFile(registry,JSON.stringify({connections:configs}));const before=await readFile(registry);
  const received=new Map<string,ConnectionConfig>();const pool=new DriverPool(root,{factory:()=>async config=>{received.set(config.id,config);return {id:config.id,kind:config.kind,family:config.family??(config.kind==='csv'?'file':'rdbms'),close:async()=>{}} as Driver;}});
  try {
   await pool.reload();
   for(const config of configs) {const prepared=await prepareRuntimeConfig(config,root);await pool.withConnection(config.id,async()=>{});assert.deepEqual(received.get(config.id),{...prepared,family:config.family??familyOf(config.kind)});if(config.kind!=='postgres') assert.equal(await readFile(prepared.path!,'utf8'),'correct');else assert.equal(prepared.schemaSource?.path,join(root,'schema.prisma'));}
  } finally {await pool.closeAll();}
  for(const config of configs) {
   const prepared=await prepareRuntimeConfig(config,root);
   const tested=await prepareLegacyProbeConfig(config,config.family??familyOf(config.kind)!,root);
   assert.deepEqual(tested,{...prepared,family:config.family??familyOf(config.kind)});
  }

  for(const config of [{id:'x',kind:'csv',path:'../cwd/data file.csv'},{id:'x',kind:'sqlite',url:'https://host/db'},{id:'x',kind:'sqlite',url:'file:///bad%ZZ'},{id:'x',kind:'sqlite',url:'file://['},{id:'x',kind:'sqlite',url:'file://remote/db'},{id:'x',kind:'sqlite',url:'missing.db'},{id:'x',kind:'csv',path:join(other,'data file.csv')},{id:'x',kind:'postgres',schemaSource:{type:'prisma',path:'../cwd/data file.csv'}}] as ConnectionConfig[]) await assert.rejects(prepareRuntimeConfig(config,root),{code:'invalid-input'});
  await assert.rejects(prepareRuntimeConfig(configs[0]!,root,AbortSignal.abort()));
  const unreadable=join(root,'unreadable.csv');await writeFile(unreadable,'secret',{mode:0o000});
  try {await assert.rejects(prepareRuntimeConfig({id:'unreadable',kind:'csv',path:'unreadable.csv'},root),{code:'invalid-input'});} finally {await chmod(unreadable,0o600);}
  await assert.rejects(access(join(root,'missing.db')),'path validation never creates missing SQLite sources');
  assert.deepEqual(await readFile(registry),before);assert.equal(await readFile(join(root,'data file.csv'),'utf8'),'correct');assert.equal(await readFile(join(other,'data file.csv'),'utf8'),'decoy');
 } finally {process.chdir(oldCwd);Object.defineProperty(PATHS,'insrc',{value:oldIns,configurable:true});await rm(directory,{recursive:true,force:true});}
});
