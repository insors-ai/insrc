import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runFocusedJUnit } from '../test-bridge/run-focused-junit.js';
import { ownedSourceFixture } from '../../scripts/__tests__/helpers/owned-source-fixture.js';
const { assertPackagedSourceBootstrap } = await import(new URL('../../scripts/node-runtime-assets.mjs', import.meta.url).href);

test('JetBrains provisioner inherits owned native environment and packaged verifier', { timeout: 300_000 }, () => {
 const f = ownedSourceFixture();
 try {
  // Ephemeral fixture authority, never a production signing key.
  const key = join(f.root, 'fixture-key'), installer = join(f.root, 'packaged.sh'), probe = join(f.root, 'probe.sh');
  execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
  execFileSync(process.execPath, ['scripts/bundle-release-bootstrap.mjs', key + '.pub', installer]);
  assertPackagedSourceBootstrap(readFileSync(installer, 'utf8'));
  writeFileSync(probe, `#!/bin/bash\nexec ${JSON.stringify(join(f.distribution, 'bin/node'))} --input-type=module -e 'import{execFileSync}from"node:child_process";import{dirname,resolve}from"node:path";const npm=execFileSync(process.execPath,[resolve(dirname(process.execPath),"../lib/node_modules/npm/bin/npm-cli.js"),"--version"],{encoding:"utf8"}).trim();process.stdout.write(JSON.stringify({exe:process.execPath,version:process.versions.node,npm,cuda:process.env.ONNXRUNTIME_NODE_INSTALL_CUDA,python:process.env.PYTHONDONTWRITEBYTECODE,target:process.env.npm_config_target,runtime:process.env.npm_config_runtime,cxx:process.env.CXXFLAGS,options:process.env.NODE_OPTIONS??null,nodePath:process.env.NODE_PATH??null}));'\n`);
  const cls = 'ai.insors.insrc.jetbrains.lifecycle.SourceBootstrapIntegrationTest';
  const jdk = '/Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home';
  runFocusedJUnit([cls], { ...process.env, ...(existsSync(jdk) ? { JAVA_HOME: jdk } : {}),
   INSRC_IDE_TEST_HOME: f.home, INSRC_IDE_TEST_INSTALLER: installer, INSRC_IDE_TEST_PROBE: probe }, reports => {
    const xml = readFileSync(join(reports, `TEST-${cls}.xml`), 'utf8');
    assert.match(xml, /<testcase name="provisionerReconstructsNativeEnvironmentAndUsesPackagedVerifier\(\)"/);
    assert.match(xml, /<testcase name="sourceAdapterRetainsCurrentOwnerAndMcpWrapperAfterRollback\(\)"/);
    assert.doesNotMatch(xml, /<failure|<error|<skipped/);
   });
 } finally { f.clean(); }
});
