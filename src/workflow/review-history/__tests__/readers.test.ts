import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import ts from 'typescript';
import {validateTaskBody,taskBodyVersion} from '../code-review/task-review/record.js';
import {validatePermanentDesignReview} from '../review/design-review/history.js';
import {renderPermanentDesignReview} from '../review/design-review/read.js';
import type {PermanentDesignReview} from '../review/design-review/history.js';

const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/stored-reviews.json.gz',import.meta.url))).toString()) as {code:Array<{version:number;source:string;digest:string;value:unknown}>;design:Array<{version:number;source:string;digest:string;value:PermanentDesignReview}>};
test('historical review versions remain readable unchanged through an inert dependency closure',()=>{
 assert.deepEqual(fixture.code.map(x=>x.version).sort(),[2,3]);assert.deepEqual(fixture.design.map(x=>x.version).sort(),[1,2]);
 for(const f of fixture.code){const before=JSON.stringify(f.value);assert.equal(sha(before),f.digest);const body=validateTaskBody(f.value);assert.equal(taskBodyVersion(body),f.version);assert.equal(JSON.stringify(body),before);}
 for(const f of fixture.design){const before=JSON.stringify(f.value);assert.equal(sha(before),f.digest);const value=validatePermanentDesignReview(f.value,{project:f.value.project,artifactId:f.value.artifactId});assert.ok(renderPermanentDesignReview(value).includes('Design review'));assert.equal(JSON.stringify(value),before);assert.throws(()=>validatePermanentDesignReview(f.value,{project:'/foreign',artifactId:f.value.artifactId}),/another artifact/);}
 // Follow production imports, not filenames alone: no old engine/runtime, provider,
 // worker, write/cleanup implementation may survive through a historical reader.
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),seen=new Set<string>();
 function walk(file:string){if(seen.has(file))return;seen.add(file);const source=readFileSync(file,'utf8');assert(!/\/(?:workflow\/(?:review|code-review)\/|daemon\/threads\/review-|agent\/providers\/)/.test(file));
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  for(const statement of ast.statements){
   if(!ts.isImportDeclaration(statement)&&!ts.isExportDeclaration(statement))continue;
   if(ts.isImportDeclaration(statement)&&statement.importClause?.isTypeOnly)continue;
   if(ts.isExportDeclaration(statement)&&statement.isTypeOnly)continue;
   if(!statement.moduleSpecifier||!ts.isStringLiteral(statement.moduleSpecifier))continue;
   const spec=statement.moduleSpecifier.text;if(!spec.startsWith('.'))continue;
   const next=resolve(dirname(file),spec).replace(/\.js$/,'.ts');
   // Shared storage is used only through its read interfaces here; it also serves
   // normal artifact writes and must not be copied into a review-only closure.
   if(next.includes('/artifact-core/')||next.endsWith('/storage.ts'))continue;
   if(next.startsWith(root))walk(next);
  }
  if(file.includes('/review-history/'))assert(!/\b(?:writeFile|appendFile|unlink|spawn|execFile|setInterval)\s*\(/.test(source));
 }
 walk(resolve(root,'workflow/review-history/index.ts'));
 walk(resolve(root,'workflow/review-history/review/design-review/history.ts'));
 walk(resolve(root,'workflow/review-history/review/report-file.ts'));
 walk(resolve(root,'mcp/design-review/schema.ts'));
 walk(resolve(root,'mcp/code-review/schema.ts'));
 walk(resolve(root,'workflow/review-history/code-review/task-review/record.ts'));
 assert(seen.size>20);
});
