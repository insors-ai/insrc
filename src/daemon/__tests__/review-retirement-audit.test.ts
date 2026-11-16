import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {CONFIG_CATALOG} from '../../config/config-catalog.js';
const root=process.cwd();
const read=(p:string)=>readFileSync(resolve(root,p),'utf8');
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='__tests__'||e.name==='__type-tests__'?[]:e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]);}
test('production imports and assets retain only unavailable endpoints historical reads and human decisions',()=>{
 for(const path of ['src/workflow/review','src/workflow/code-review','src/daemon/review-service.ts','src/daemon/threads/review-workers.ts','src/shared/review-process-bridge.ts','src/shared/review-native-guard.ts','src/agent/providers/review-activity-stream.ts'])assert.equal(existsSync(resolve(root,path)),false,path);
 for(const file of files(resolve(root,'src')).filter(p=>/\.tsx?$/.test(p))){
  const name=relative(root,file),source=readFileSync(file,'utf8');
  assert.doesNotMatch(source,/(?:from\s*|import\s*\()\s*['"][^'"]*(?:workflow\/(?:review|code-review)\/|threads\/review-(?:workers|worker-runtime|native-host|preparation-host)|shared\/review-(?:native|process-bridge|activity))/,name);
 }
 for(const path of ['src/agent/providers/cli-provider.ts','src/agent/providers/ollama.ts','src/agent/read-only-tool-loop.ts'])assert.doesNotMatch(read(path),/runReviewSession|runReviewStream|reviewBudget|reviewNativeTransport|ReviewActivityStream/,path);
 assert.match(read('src/daemon/steps/build-step/phases/validate.ts'),/runReadOnlySession/);
 assert.match(read('src/daemon/handler-runtime.ts'),/handleReviewDecision/);
 assert.ok(existsSync(resolve(root,'src/prompts/analyze/code.adherence-check.system.md')));
});
test('backend and current IDE guidance agree on review unavailability and human approval',()=>{
 const steering=read('src/prompts/steering-block.md');
 for(const family of ['Design','Code'])assert.ok(steering.includes(`${family} review functionality is being rewritten.`));
 assert.doesNotMatch(steering,/Mandatory reviews only|Only two reviews are mandatory|run `code-review`|Review the HLD with `insrc_review_step`|code-review-gated completion act/);
 assert.match(steering,/explicit human approval/);
 assert.equal(CONFIG_CATALOG.some(c=>c.path.startsWith('review.preparation.')),false);
 const vscode=JSON.parse(read('vscode-plugin/package.json'));
 const props=Object.assign({},...vscode.contributes.configuration.map((c:{properties:object})=>c.properties));
 assert.equal(Object.keys(props).some(k=>k.startsWith('insrc.review.preparation.')),false);
 assert.match(read('jetbrains-plugin/src/main/resources/META-INF/plugin.xml'),/review functionality is being rewritten/);
 assert.match(read('src/mcp/server.ts'),/This compatibility endpoint always returns an error without starting work/);
});
