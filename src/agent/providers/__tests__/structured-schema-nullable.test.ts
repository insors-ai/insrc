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

test('Codex replies decode synthetic optional nulls through objects arrays and recursive local refs without mutating input',()=>{
 const host={type:'object',required:['required','rows'],additionalProperties:false,properties:{required:{type:'string'},error:{type:'string'},rows:{type:'array',items:{$ref:'#/$defs/node'}},explicit:{$ref:'#/$defs/nullable'}},$defs:{nullable:{anyOf:[{type:'string'},{type:'null'}]},node:{type:'object',required:['name'],additionalProperties:false,properties:{name:{type:'string',minLength:2},note:{type:'string'},next:{$ref:'#/$defs/node'}}}}};
 const raw={required:'ok',error:null,explicit:null,rows:[{name:'node',note:null,next:{name:'child',note:null,next:null}}]},original=structuredClone(raw),schema=structuredClone(host);
 const result=validateCodexReply(host,raw);assert.equal(result.ok,true);
 if(result.ok)assert.deepEqual(result.value,{required:'ok',explicit:null,rows:[{name:'node',next:{name:'child'}}]});
 assert.deepEqual(raw,original);assert.deepEqual(host,schema);
 for(const value of [{...raw,required:null},{...raw,unknown:null},{...raw,rows:[{name:'a',note:null}]}])assert.equal(validateCodexReply(host,value).ok,false);
});

test('nullable semantics remain original-schema semantics rather than blanket null removal',()=>{
 const host={type:'object',required:['must'],additionalProperties:false,properties:{must:{type:'string'},union:{type:['string','null']},enumerated:{enum:['ok',null]},constant:{const:null},open:{},optional:{type:'string'}}};
 const raw={must:'ok',union:null,enumerated:null,constant:null,open:null,optional:null};
 const result=validateCodexReply(host,raw);assert.equal(result.ok,true);
 if(result.ok)assert.deepEqual(result.value,{must:'ok',union:null,enumerated:null,constant:null,open:null});
 assert.equal(validateCodexReply(host,{...raw,must:null}).ok,false);
});

test('Codex decoding selects applicable union branches and retains original length and required-field diagnostics',()=>{
 const host={type:'object',required:['entry'],properties:{entry:{anyOf:[{type:'object',required:['kind','name'],additionalProperties:false,properties:{kind:{const:'name'},name:{type:'string',minLength:2,maxLength:4},note:{type:'string'}}},{type:'object',required:['kind','id'],additionalProperties:false,properties:{kind:{const:'id'},id:{type:'integer'},label:{type:'string'}}}]}},additionalProperties:false};
 for(const [raw,expected] of [[{entry:{kind:'name',name:'okay',note:null}},{entry:{kind:'name',name:'okay'}}],[{entry:{kind:'id',id:1,label:null}},{entry:{kind:'id',id:1}}]]){
  const result=validateCodexReply(host,raw);assert.equal(result.ok,true);if(result.ok)assert.deepEqual(result.value,expected);
 }
 for(const name of ['a','abcde']){const result=validateCodexReply(host,{entry:{kind:'name',name,note:null}});assert.equal(result.ok,false);if(!result.ok)assert.ok(result.issues?.some(i=>i.field==='/entry/name'&&i.code==='SCHEMA_CONSTRAINT'));}
 const missing=validateCodexReply(host,{entry:{kind:'name',note:null}});assert.equal(missing.ok,false);if(!missing.ok)assert.ok(missing.issues?.some(i=>i.code==='MISSING_REQUIRED_FIELD'));
});

test('Codex optional decoding covers oneOf allOf tuple items dictionaries and escaped local reference paths',()=>{
 const item={type:'object',required:['id'],additionalProperties:false,properties:{id:{type:'integer'},note:{type:'string'}}};
 const host={$id:'https://example.invalid/nullable-test',type:'object',required:['tuple','dict','pattern','choice','combined'],additionalProperties:false,properties:{
  tuple:{type:'array',prefixItems:[item],items:false},dict:{type:'object',additionalProperties:item},pattern:{type:'object',patternProperties:{'^item/':item},additionalProperties:false},
  choice:{oneOf:[{...item,properties:{...item.properties,id:{const:1}}},{...item,properties:{...item.properties,id:{const:2}}}]},
  combined:{allOf:[item]},'a/b~#%':{$ref:'#/$defs/optional'},
 },$defs:{optional:{type:'object',additionalProperties:false,properties:{value:{type:'string'}}}}};
 const raw={tuple:[{id:1,note:null}],dict:{key:{id:2,note:null}},pattern:{'item/x':{id:3,note:null}},choice:{id:1,note:null},combined:{id:4,note:null},'a/b~#%':{value:null}};
 const result=validateCodexReply(host,raw);assert.equal(result.ok,true);if(result.ok)assert.deepEqual(result.value,{tuple:[{id:1}],dict:{key:{id:2}},pattern:{'item/x':{id:3}},choice:{id:1},combined:{id:4},'a/b~#%':{}});
});

test('ambiguous union decoding cannot choose between different data-discarding results',()=>{
 const host={type:'object',required:['entry'],properties:{entry:{anyOf:[
  {type:'object',properties:{a:{type:'string'},b:{type:['string','null']}},additionalProperties:false},
  {type:'object',properties:{a:{type:['string','null']},b:{type:'string'}},additionalProperties:false},
 ]}},additionalProperties:false};
 const raw={entry:{a:null,b:null}},saved=structuredClone(raw);assert.equal(validateCodexReply(host,raw).ok,false);assert.deepEqual(raw,saved);
});

test('pattern-matched keys bypass additionalProperties decoding and preserve explicitly nullable nested data',()=>{
 const host={type:'object',properties:{trigger:{type:'string'}},patternProperties:{'^item$':{type:'object',properties:{note:{type:['string','null']}},additionalProperties:false}},additionalProperties:{type:'object',properties:{note:{type:'string'}},additionalProperties:false}};
 const raw={trigger:null,item:{note:null},other:{note:null}},original=structuredClone(raw);
 const result=validateCodexReply(host,raw);assert.equal(result.ok,true);
 if(result.ok)assert.deepEqual(result.value,{item:{note:null},other:{}});
 assert.deepEqual(raw,original);
});
