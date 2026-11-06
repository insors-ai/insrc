import test from 'node:test';
import assert from 'node:assert/strict';
import {codexStrictSchema,validateCodexReply} from '../structured-schema.js';

test('Codex strict conversion makes optional fields nullable recursively without loosening required fields or mutating the host schema',()=>{
 const host={type:'object',properties:{required:{type:'string'},error:{type:'string',minLength:1},rows:{type:'array',items:{type:'object',properties:{id:{type:'integer'},note:{type:'string'}},required:['id'],additionalProperties:false}}},required:['required','rows'],additionalProperties:false};
 const original=structuredClone(host),wire=codexStrictSchema(host);
 assert.deepEqual(host,original);assert.deepEqual(codexStrictSchema(wire),wire);
 for(const value of [{required:'ok',error:null,rows:[{id:1,note:null}]},{required:'ok',error:'error',rows:[{id:1,note:'note'}]}])assert.equal(validateCodexReply(wire,value).ok,true);
 for(const value of [{required:null,error:null,rows:[]},{required:'ok',rows:[]},{required:'ok',error:null,rows:[{id:null,note:null}]}])assert.equal(validateCodexReply(wire,value).ok,false);
});
