/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,readFileSync,writeFileSync,readdirSync,existsSync } from 'node:fs';
import { tmpdir,homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('admission DTOs preserve unknown inventory and current review identity',{timeout:300000},()=>{
 const scratch=mkdtempSync(join(tmpdir(),'insrc-review-progress-gradle-')),name='ai.insors.insrc.jetbrains.review.ReviewWorkerProgressTest';
 const init=join(scratch,'review-progress.gradle');
 writeFileSync(init,`gradle.beforeProject { project ->
 project.layout.buildDirectory.set(new File('${scratch}/build'))
 project.plugins.withId('org.jetbrains.kotlin.jvm') {
  project.kotlin.sourceSets.getByName('test').kotlin.setIncludes(['${name.replaceAll('.','/')}.kt'])
 }
}`);
 const plugin=fileURLToPath(new URL('../',import.meta.url));
 const version=readFileSync(join(plugin,'gradle/wrapper/gradle-wrapper.properties'),'utf8').match(/gradle-([0-9.]+)-/)?.[1];
 const platform=readFileSync(join(plugin,'gradle.properties'),'utf8').match(/^platformVersion\s*=\s*(.+)$/m)?.[1]?.trim();
 const transforms=join(homedir(),'.gradle/caches',version??'','transforms');
 const cached=existsSync(transforms)?readdirSync(transforms).map(id=>join(transforms,id,'transformed',`ideaIC-${platform}`,'jbr')).find(path=>existsSync(join(path,'bin/java'))):undefined;
 const result=spawnSync('./gradlew',['-I',init,'--no-configuration-cache','test','--offline','--tests',name,'--console=plain'],{cwd:plugin,env:{...process.env,...(cached?{JAVA_HOME:cached}:{})},encoding:'utf8',timeout:290000,maxBuffer:8*1024*1024});
 writeFileSync(join(scratch,'output.log'),`${result.stdout}\n${result.stderr}`);
 assert.equal(result.status,0,`Kotlin review progress test failed; evidence ${scratch}/output.log:\n${result.stdout}\n${result.stderr}`);
 const xml=readFileSync(join(scratch,'build/test-results/test',`TEST-${name}.xml`),'utf8');
 assert.match(xml,/testcase name="admission DTOs preserve unknown inventory and current review identity\(\)"/);
 assert.doesNotMatch(xml,/<failure|<error|<skipped/);
});
