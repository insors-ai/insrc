import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import oracledb from 'oracledb';
import {SqliteDriver} from '../drivers/sqlite.js';
import {MssqlDriver} from '../drivers/mssql.js';
import {OracleDriver} from '../drivers/oracle.js';
import {ClickHouseDriver} from '../drivers/clickhouse.js';

test('CM-S2-A4: SQLite and ClickHouse await readonly probes and reject missing or inaccessible sources',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sql-probes-')),path=join(directory,'fixture.db');
 const db=new DatabaseSync(path);db.exec('CREATE TABLE data(value TEXT)');db.close();const before=await readFile(path);
 const queries:string[]=[];let fail=false;
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;queries.push(body);if(fail){res.statusCode=401;res.end('Access denied');}else {res.setHeader('content-type','application/json');res.end('{"1":1}\n');}});
 try {
  const sqlite=new SqliteDriver('sqlite',path);await sqlite.probeReachability();await sqlite.close();await assert.rejects(sqlite.probeReachability());assert.deepEqual(await readFile(path),before);
  assert.throws(()=>new SqliteDriver('missing',join(directory,'missing.db')));await assert.rejects(access(join(directory,'missing.db')));
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address==='object');
  const clickhouse=new ClickHouseDriver('click','http://user:pass@127.0.0.1:'+address.port+'/db');
  try {await clickhouse.probeReachability();fail=true;await assert.rejects(clickhouse.probeReachability());assert.ok(queries.length>=2);assert.ok(queries.every(q=>/^SELECT 1\s+FORMAT JSONEachRow\s*$/.test(q)));} finally {await clickhouse.close();}
 } finally {await new Promise<void>(r=>server.close(()=>r()));await rm(directory,{recursive:true,force:true});}
});

test('CM-S2-A4: MSSQL and Oracle SDK-boundary probes await execution and release connections on failure',async()=>{
 const mssql=new MssqlDriver('mssql','mssql://user:pass@127.0.0.1:1/db'),pool=Reflect.get(mssql,'pool');let failed=false,releases=0;const queries:string[]=[];
 const acquire=mock.method(pool,'acquire',()=>({promise:Promise.resolve({execSql:(request:{sqlTextOrProcedure:string;callback:(error:Error|null)=>void})=>{queries.push(request.sqlTextOrProcedure);setImmediate(()=>request.callback(failed?new Error('refused'):null));}})}));
 const release=mock.method(pool,'release',()=>{releases++;return true;});
 try {await mssql.probeReachability();failed=true;await assert.rejects(mssql.probeReachability());assert.deepEqual(queries,['SELECT 1','SELECT 1']);assert.equal(releases,2);} finally {acquire.mock.restore();release.mock.restore();await mssql.close();}
 let closed=0,poolClosed=0,oracleFail=false;const oracleQueries:string[]=[];
 const create=mock.method(oracledb,'createPool',async()=>({getConnection:async()=>({execute:async(sql:string)=>{oracleQueries.push(sql);if(oracleFail)throw new Error('auth refused');return {rows:[[1]]};},close:async()=>{closed++;}}),close:async()=>{poolClosed++;}}));
 const oracle=new OracleDriver('oracle','oracle://user:pass@127.0.0.1:1/service');
 try {await oracle.probeReachability();oracleFail=true;await assert.rejects(oracle.probeReachability());assert.deepEqual(oracleQueries,['SELECT 1 FROM DUAL','SELECT 1 FROM DUAL']);assert.equal(closed,2);} finally {await oracle.close();create.mock.restore();}
 assert.equal(poolClosed,1);
});
