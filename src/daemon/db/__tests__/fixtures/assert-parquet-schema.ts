/** Inspect persisted Parquet metadata through an independent DuckDB reader. */
import assert from 'node:assert/strict';
import {DuckDBInstance} from '@duckdb/node-api';
import type {ConvertedColumn} from '../../../../shared/connection-management.js';
export async function assertParquetSchema(path:string,columns:readonly ConvertedColumn[]):Promise<void>{
 const db=await DuckDBInstance.create(':memory:'),connection=await db.connect();
 try{
  const fields=(await connection.runAndReadAll('SELECT name, type, converted_type, repetition_type FROM parquet_schema(?) WHERE num_children IS NULL',[path])).getRowObjectsJS();
  assert.deepEqual(fields.map(field=>({name:field.name,physicalType:field.converted_type||field.type,nullable:field.repetition_type==='OPTIONAL'})),columns.map(column=>({name:column.name,physicalType:column.physicalType,nullable:column.nullable})));
 }finally{connection.closeSync();db.closeSync();}
}
