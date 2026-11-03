// Design probe only: temporary isolated database, no backend/index connections.
import * as lance from '@lancedb/lancedb';
import { Schema, Field, Utf8, FixedSizeList, Float32 } from 'apache-arrow';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir = await mkdtemp(join(tmpdir(), 'memory-s3-lance-probe-'));
const schema = new Schema([new Field('rowId',new Utf8(),false),new Field('rowKind',new Utf8(),false),new Field('projectId',new Utf8(),false),new Field('payload',new Utf8(),false),new Field('embedding',new FixedSizeList(2,new Field('item',new Float32(),true)),true)]);
const row = (rowId,rowKind,payload,embedding=null) => ({rowId,rowKind,projectId:'p',payload:JSON.stringify(payload),embedding});
let conn, writer, reader;
try {
 conn = await lance.connect(dir,{readConsistencyInterval:0});
 writer = await conn.createEmptyTable('records',schema);
 await writer.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().execute([row('ctl','control',{generation:'0'})]);
 const before = await writer.version();
 reader = await conn.openTable('records'); await reader.checkout(before);
 await writer.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().execute([row('ctl','control',{generation:'1'}),row('m','current',{revision:'1',text:'value'},[1,0]),row('r','receipt',{operationId:'event-1',state:'committed'})]);
 const after = await writer.version(); assert.equal(after,before+1);
 const old = await reader.query().toArray(); assert.equal(old.length,1); assert.equal(JSON.parse(old[0].payload).generation,'0');
 const current = await writer.query().toArray(); assert.equal(current.length,3); assert.equal(JSON.parse(current.find(r=>r.rowKind==='control').payload).generation,'1');
 assert.equal(current.find(r=>r.rowKind==='receipt').embedding,null);
 const vectors = await writer.vectorSearch([1,0]).where("rowKind = 'current' AND projectId = 'p'").limit(1).toArray(); assert.equal(vectors[0].rowId,'m');
 await reader.checkoutLatest(); assert.equal((await reader.query().toArray()).length,3);
 reader.close(); reader=undefined; writer.close(); writer=undefined; conn.close(); conn=undefined;
 conn=await lance.connect(dir,{readConsistencyInterval:0}); writer=await conn.openTable('records');
 assert.equal(await writer.version(),after); assert.equal((await writer.query().toArray()).length,3);
 const report={kind:'design-probe',sdk:'@lancedb/lancedb 0.40.0',node:process.versions.node,platform:process.platform,capturedAt:new Date().toISOString(),singleMergeVersionDelta:after-before,nullableReceiptVector:true,vectorSearchWithScalarFilter:true,pinnedReaderKeptPriorVersion:true,readerRefreshObservedNewVersion:true,reopenRetainedCommit:true,limits:['Small normal-exit macOS probe only','No crash/fsync, Linux, concurrent-reader-under-kill or power-loss qualification','No production store or semantic processing implemented']};
 if(process.argv[2]) await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify(report)+'\n');
} finally {reader?.close();writer?.close();conn?.close();await rm(dir,{recursive:true,force:true});}
