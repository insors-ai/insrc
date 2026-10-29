/** Focused JVM test bridge with invocation-owned reports; parallel Node files cannot overwrite evidence. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function runConnectionJUnit(className: string, expectedTests: number, parityDirectory?: string): void {
 const reports=mkdtempSync(join(tmpdir(),'insrc-junit-'));
 try {
  const javaHome=process.platform==='darwin'?spawnSync('/usr/libexec/java_home',['-v','21'],{encoding:'utf8'}).stdout.trim():process.env['JAVA_HOME'];
  const result=spawnSync('./gradlew',['--offline','test','--tests',className,`-PinsrcFixtureReports=${reports}`,...parityDirectory?[`-PinsrcParityDir=${parityDirectory}`]:[],'--console=plain'],{
   cwd:fileURLToPath(new URL('../../../../jetbrains-plugin/',import.meta.url)),env:{...process.env,INSRC_FIXTURE_NODE:process.execPath,...(javaHome?{JAVA_HOME:javaHome}:{})},encoding:'utf8',timeout:170000,maxBuffer:4*1024*1024,
  });
  assert.equal(result.status,0,`Focused JUnit validation failed: ${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout,/BUILD SUCCESSFUL/);
  const report=readFileSync(join(reports,`TEST-${className}.xml`),'utf8');
  assert.match(report,new RegExp(`tests="${expectedTests}"`));assert.match(report,/failures="0"/);assert.match(report,/errors="0"/);
 } finally { rmSync(reports,{recursive:true,force:true}); }
}
