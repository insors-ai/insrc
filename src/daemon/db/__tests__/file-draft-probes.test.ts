import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {DuckDBInstance,DuckDBConnection} from '@duckdb/node-api';
import ExcelJS from 'exceljs';
import avsc from 'avsc';
import {serialize} from 'bson';
import {tableFromArrays,tableToIPC} from 'apache-arrow';
import {getFactory} from '../registry.js';
import {fileExecutionPolicy} from '../file-policy.js';
import type {DraftProbe} from '../draft-probe.js';
import type {ConnectionConfig,Driver} from '../../../shared/db-driver.js';
import '../drivers/duckdb-file.js';
async function snapshot(root:string) {
 const result:Record<string,string>={};
 for(const name of await readdir(root,{recursive:true}))try{result[name]=(await readFile(join(root,name))).toString('base64');}catch{result[name]='<dir>';}
 return result;
}
test('CM-S2-A7: all file probe aliases load owned readers with actual targets and no persistent effects',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cm-file-probe-'));
 const configs:ConnectionConfig[]=[];
 const add=async(kind:string,data:string|Uint8Array,options?:Record<string,unknown>)=>{const path=join(root,'source.'+kind);await writeFile(path,data);configs.push({id:'fixture',kind,path,...(options?{options}:{})});};
 try {
  await add('csv','value\nfirst\n');await add('tsv','value\nfirst\n');
  for(const kind of ['json','jsonl','ndjson'])await add(kind,kind==='json'?'[{"value":"first"}]':'{"value":"first"}\n');
  const engine=await DuckDBInstance.create(':memory:'),conn=await engine.connect();
  const path=join(root,'source.parquet');
  try{await conn.run('COPY (SELECT 1 AS value) TO ? (FORMAT PARQUET)',[path]);}finally{conn.closeSync();engine.closeSync();}
  configs.push({id:'fixture',kind:'parquet',path});
  for(const kind of ['arrow','feather'])await add(kind,tableToIPC(tableFromArrays({value:[1]}),'file'));
  await add('bson',serialize({value:'first'}));
  await add('fixed-width','first\n',{columns:[{name:'value',start:0,length:5,type:'string'}]});
  const avro=join(root,'source.avro'),encoder=avsc.createFileEncoder(avro,{type:'record',name:'Fixture',fields:[{name:'value',type:'string'}]});
  const finished=once(encoder,'finish');encoder.end({value:'first'});await finished;configs.push({id:'fixture',kind:'avro',path:avro});
  const book=new ExcelJS.Workbook();book.addWorksheet('First').addRows([['value'],['first']]);book.addWorksheet('Empty').addRow(['different']);
  const xlsx=join(root,'source.xlsx');await book.xlsx.writeFile(xlsx);configs.push({id:'fixture',kind:'xlsx',path:xlsx,options:{sheet:'Empty'}});
  const before=await snapshot(root),statements:string[]=[];
  const original=DuckDBConnection.prototype.run;
  const spy=mock.method(DuckDBConnection.prototype,'run',function(this:DuckDBConnection,...args:Parameters<typeof original>){statements.push(args[0]);return Reflect.apply(original,this,args);});
  const construct=async(config:ConnectionConfig)=>await getFactory(config.kind)!(config,{fileExecutionPolicy:{...fileExecutionPolicy(config,{lookupRoot:root,ownerId:'fixture',revision:'r1',persistence:'memory-only'}),memoryBudgetBytes:64*1024*1024}}) as Driver&DraftProbe;
  try {
   for(const config of configs){
    let driver:Driver&DraftProbe|undefined;
    try{driver=await construct(config);assert.equal(await driver.probeReachability(),undefined,config.kind);}
    catch(error){if(config.kind==='arrow'||config.kind==='feather')assert.equal((error as Error).message,'unsupported-temporary');else throw error;}
    finally{await driver?.close();}
   }
   const badSheet=await construct({...configs.at(-1)!,options:{sheet:'absent'}});
   try{await assert.rejects(badSheet.probeReachability(),/Unknown converted target/);}finally{await badSheet.close();}
   assert.equal(statements.some(sql=>/^\s*INSTALL\b/i.test(sql)),false);
   assert.deepEqual(await snapshot(root),before);
   for(const kind of ['json','parquet','avro','bson','xlsx']){
    const bad=join(root,'bad.'+kind);await writeFile(bad,'malformed-private-source');const driver=await construct({id:'bad',kind,path:bad});
    try{await assert.rejects(driver.probeReachability(),error=>error instanceof Error&&!error.message.includes(root));}finally{await driver.close();}
   }
  }finally{spy.mock.restore();}
 }finally{await rm(root,{recursive:true,force:true});}
});
