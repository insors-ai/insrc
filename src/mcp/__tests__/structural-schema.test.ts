import test from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@sinclair/typebox';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { structural } from '../structural-schema.js';
import { buildInsrcMcpServerWithRegistry } from '../server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

test('homogeneous tuples advertise bounded fixed-length arrays without weakening validation', () => {
 const integer = Type.Integer({minimum:1,maximum:Number.MAX_SAFE_INTEGER});
 const range = structural(Type.Tuple([integer,integer]));
 const schema = toJsonSchemaCompat(range as never,{strictUnions:true,pipeStrategy:'input'}) as Record<string,unknown>;
 assert.equal(Array.isArray(schema.items),false);
 assert.deepEqual(schema.items,{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER});
 assert.equal(schema.minItems,2);assert.equal(schema.maxItems,2);
 for(const value of [[1,1],[1,Number.MAX_SAFE_INTEGER]])assert.equal(range.safeParse(value).success,true);
 for(const value of [[],[1],[1,2,3],[0,1],[1,1.5],[1,'2'],[1,Number.MAX_SAFE_INTEGER+1]])assert.equal(range.safeParse(value).success,false);
});

test('heterogeneous tuples retain their positional validation contracts', () => {
 const mixed=structural(Type.Tuple([Type.String(),Type.Integer()]));
 assert.equal(mixed.safeParse(['a',1]).success,true);
 assert.equal(mixed.safeParse([1,'a']).success,false);
});

test('actual MCP code-review advertisement has object-valued array items throughout', async () => {
 const {server}=buildInsrcMcpServerWithRegistry();
 const client=new Client({name:'schema-regression',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();
 try {
  await server.connect(a);await client.connect(b);
  const tool=(await client.listTools()).tools.find(tool=>tool.name==='insrc_code_review_step');
  assert.ok(tool);
  let arrays=0;
  function inspect(value:unknown):void {
   if(!value||typeof value!=='object')return;
   if(Array.isArray(value)){for(const item of value)inspect(item);return;}
   const node=value as Record<string,unknown>;
   if(node.type==='array'){arrays++;assert.ok(node.items && !Array.isArray(node.items),'array items must be a single schema');}
   for(const child of Object.values(node))inspect(child);
  }
  inspect(tool.inputSchema);assert.ok(arrays>5);
 } finally {await client.close();await server.close();}
});
