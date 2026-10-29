import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectionDraft, connectionDriverChoices } from '../connection-manager/draft.js';
import type { DraftNavigation } from '../connection-manager/draft.js';
import type { ConnectionKey, CredentialPatch } from '../connection-management.js';
import { decodeDriverDescriptors, decodeSafeConnection } from '../connection-manager/wire.js';
import { loadConnectionCorpus } from './fixtures/connection-corpus.js';

const corpus=loadConnectionCorpus(),descriptors=decodeDriverDescriptors(corpus.driverDescriptors);
const key:ConnectionKey={repoRoot:'/fixture/repo-a',scope:'saved',id:'draft'};
function draft(kind='postgres'):ConnectionDraft {return new ConnectionDraft(descriptors.find(d=>d.kind===kind)!,key);}
function example(schema:Record<string,unknown>,path:string[],kind:string):unknown {
 if(Object.hasOwn(schema,'const'))return schema['const'];
 if(schema['enum'])return (schema['enum'] as unknown[])[0];
 if(schema['anyOf'])return example((schema['anyOf'] as Record<string,unknown>[])[0]!,path,kind);
 if(schema['type']==='object')return Object.fromEntries(Object.entries(schema['properties'] as Record<string,Record<string,unknown>>).map(([k,v])=>[k,example(v,[...path,k],kind)]));
 if(schema['type']==='array')return [example(schema['items'] as Record<string,unknown>,[...path,'0'],kind)];
 if(schema['type']==='boolean')return true;
 if(['integer','number'].includes(schema['type'] as string))return schema['minimum']??0;
 const name=path.at(-1);
 if(name==='endpoint')return `${kind==='dynamodb'?'https':kind==='cockroachdb'?'postgresql':kind==='keydb'||kind==='valkey'?'redis':kind}://fixture.invalid/example`;
 if(name==='path')return 'data/example.csv';if(path.includes('contactPoints'))return 'fixture.invalid:9042';
 if(path.includes('servers'))return 'nats://fixture.invalid:4222';if(path.includes('hosts'))return 'https://fixture.invalid:2379';
 if((schema['maxLength'] as number)<7)return 'x'.repeat((schema['minLength'] as number)||1);
 return 'fixture';
}

test('CM-S5-FORM-TS: every descriptor, safe credential intents, pinned/read-only edits and dirty zero-effect Cancel',()=>{
 assert.equal(connectionDriverChoices(descriptors).filter(d=>d.enabled).length,29);
 for(const descriptor of descriptors){
  const d=new ConnectionDraft(descriptor,key);
  const props=descriptor.publicInputSchema['properties'] as Record<string,Record<string,unknown>>;
  for(const [name,schema]of Object.entries(props))if(name!=='kind')d.setField([name],example(schema,[name],descriptor.kind));
  const value=d.serialize();assert.equal(value.publicPatch['kind'],descriptor.kind);assert.equal(value.key.scope,'saved');assert.ok(Object.isFrozen(value));
  assert.deepEqual(Object.keys(value.credentials),descriptor.secretSlots);assert.ok(Object.values(value.credentials).every(v=>v.action==='keep'));
 }
 assert.equal(corpus.draftScenarios.length,9);
 for(const scenario of corpus.draftScenarios){
  const d=new ConnectionDraft(descriptors.find(d=>d.kind===scenario.kind)!,scenario.key as ConnectionKey,scenario.current?decodeSafeConnection(scenario.current):undefined);
  for(const step of scenario.steps){
   if(step['action']==='field')d.setField(step['path'] as string[],step['value']);
   else if(step['action']==='credential')d.setCredential(step['slot'] as string,step['intent'] as CredentialPatch['action'],step['value'] as string|undefined);
   else if(step['action']==='credential-addresses')d.setCredentialAddresses(step['slot'] as string,step['values'] as string[]);
   else if(step['action']==='reset-field')d.resetField(step['path'] as string[]);else assert.fail('Unknown common draft action');
  }
  for(const [k,v]of Object.entries(scenario.expected))assert.deepEqual((d.view as unknown as Record<string,unknown>)[k],v,scenario.id+': '+k);
  if(scenario.serializationError)assert.throws(()=>d.serialize(),{code:scenario.serializationError});else assert.deepEqual(d.serialize(),scenario.serialized,scenario.id);
  assert.equal(JSON.stringify(d),'{}');assert.ok(!JSON.stringify(d.view).includes('fixture-only-'));assert.ok(d.view.credentials.every(c=>c.masked&&!Object.hasOwn(c,'value')));
 }
 const targetKey={...key,scope:'temporary' as const};
 const targets:DraftNavigation[]=[{type:'root',repoRoot:'/fixture/repo-b'},{type:'row',key:targetKey,revision:corpus.identity.revision},{type:'filter',value:'temporary'},{type:'search',value:'other'},{type:'scope',value:'temporary'},{type:'kind',value:'csv'},{type:'close'},{type:'remove',key,revision:corpus.identity.revision}];
 for(const target of targets){
  const d=draft();d.setField(['endpoint'],'postgresql://fixture.invalid/db');d.setCredential('url.password','replace','fixture-only-private');
  const before=d.serialize(),revision=d.view.draftRevision;
  assert.deepEqual(d.requestExit(target),[]);assert.equal(d.view.confirmDiscard,true);
  assert.deepEqual(d.decideDiscard('cancel'),[]);assert.equal(d.view.confirmDiscard,false);assert.equal(d.view.draftRevision,revision);assert.deepEqual(d.serialize(),before);
  assert.deepEqual(d.requestExit(target),[]);assert.deepEqual(d.decideDiscard('discard'),[{type:'navigate',target}]);
  assert.equal(d.view.discarded,true);assert.equal(d.view.dirty,false);assert.deepEqual(d.view.publicValues,{});assert.throws(()=>d.serialize(),{code:'discarded'});
 }
});

test('CM-S5-FORM-TS: unsafe input and unknown shapes refuse without changing draft or invoking getters',()=>{
 const d=draft();d.setField(['endpoint'],'postgresql://fixture.invalid/db');const before=d.view;
 for(const value of ['postgresql://user:private-canary@fixture.invalid/db','postgresql://fixture.invalid/db?password=private-canary','%24%7Bsecret%3Aprivate-canary%7D'])assert.throws(()=>d.setField(['endpoint'],value));
 assert.deepEqual(d.view,before);
 let getters=0;const hostile=Object.defineProperty({},'bad',{enumerable:true,get(){getters++;throw new Error('private-canary');}});
 assert.throws(()=>d.setField(['label'],hostile));assert.equal(getters,0);assert.deepEqual(d.view,before);
 for(const field of ['id','kind','scope','family','effectiveFamily'])assert.throws(()=>d.setField([field],'changed'),{code:'fixed-identity'});
 assert.throws(()=>d.setField(['options','arbitrary'],'raw'));assert.throws(()=>d.setCredential('unknown','replace','private-canary'));
 const nats=draft('nats');assert.throws(()=>nats.setField(['options','servers'],['nats://user:private-canary@fixture.invalid:4222']));
 const copied=structuredClone(corpus.driverDescriptors[0]) as Record<string,unknown>;const schema=copied['publicInputSchema'] as Record<string,unknown>;
 schema['properties']={...(schema['properties'] as object),newRequiredField:{type:'string'}};schema['required']=['newRequiredField'];
 const unknown=decodeDriverDescriptors([copied])[0]!;assert.equal(connectionDriverChoices([unknown])[0]!.enabled,false);assert.equal(new ConnectionDraft(unknown,key).view.readOnly,true);
 schema['properties']={kind:{const:copied['kind']},options:{type:'object',properties:{password:{type:'string'}},required:['password'],additionalProperties:false}};schema['required']=[];
 const secretShape=decodeDriverDescriptors([copied])[0]!;assert.equal(new ConnectionDraft(secretShape,key).view.readOnly,true);
 const legacy=decodeSafeConnection(corpus.draftScenarios[1]!.current);const readonly=new ConnectionDraft(descriptors.find(d=>d.kind==='postgres')!,key,{...legacy,readOnly:true});
 assert.equal(readonly.view.readOnly,true);assert.ok(readonly.view.guidance);assert.throws(()=>readonly.setField(['label'],'unsafe'),{code:'read-only'});
 const update=new ConnectionDraft(descriptors.find(d=>d.kind==='postgres')!,key,legacy);assert.throws(()=>update.setId('other'),{code:'fixed-identity'});
 assert.equal(update.view.family,'kv');assert.equal(Object.hasOwn(update.serialize().publicPatch,'family'),false);
});
