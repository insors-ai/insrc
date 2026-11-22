/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const installer = fileURLToPath(new URL('../../../scripts/insrc-daemon-install.sh', import.meta.url));

const shim = async (dir: string, name: string, content: string) =>
	writeFile(join(dir, name), `#!/bin/bash\nset -eu\n${content}\n`, { mode: 0o700 });


test('Current Mac installer authorizes the staged bridge and preserves the incumbent on denial', { timeout: 340_000 }, async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-bridge-routing-'));
	t.after(() => rm(root, { recursive: true, force: true }));

	// -------------------------------------------------------------------------
	// The real installer dispatches only an independently authorized bridge.
	// Command shims isolate this routing check; actual native/data qualification
	// lives in historical-macos-upgrade-native.test.ts.
	// -------------------------------------------------------------------------
	const home = join(root, 'home');
	const checkout = join(home, '.insrc/daemon');
	const tools = join(root, 'bin');
	const trace = join(root, 'trace');
	await mkdir(join(checkout, '.git'), { recursive: true });
	await mkdir(join(checkout, 'scripts'));
	const routedInstaller = join(root, 'installer.sh');
	await writeFile(routedInstaller, (await readFile(installer, 'utf8'))
		.replace("INSRC_RELEASE_BOOTSTRAP_B64=''", "INSRC_RELEASE_BOOTSTRAP_B64='Zml4dHVyZQ=='"));
	await copyFile(routedInstaller, join(checkout, 'scripts/insrc-daemon-install.sh'));
	await writeFile(join(checkout, 'incumbent'), 'executable release');
	await mkdir(tools);
	await shim(tools, 'uname', 'printf "Darwin\\n"');
	await shim(tools, 'git', `
if [ "$1" = "--version" ]; then printf 'git version 2.45.0\\n'; exit 0; fi
if [ "$1" = "check-ref-format" ]; then exit 0; fi
if [ "$1" = "-C" ] && [ "$3" = "remote" ]; then printf '/qualified/origin\\n'; exit 0; fi
if [ "$1" = "-C" ] && [ "$3" = "symbolic-ref" ]; then printf 'v2\\n'; exit 0; fi
printf 'unexpected git: %s\\n' "$*" >&2
exit 44`);
	await writeFile(join(root, 'node-runtime-env.sh'), `insrc_source_toolchain() { NODE_BIN='${join(tools, 'node')}'; NPM_CLI='${join(tools, 'npm')}'; TOOLCHAIN_ID=fixture; }\n`);
	await shim(tools, 'node', `
if [ "\${1##*/}" = npm ]; then shift; exec '${join(tools, 'npm')}' "$@"; fi
if [ "$1" = "-v" ]; then printf 'v22.22.1\\n'; exit 0; fi
if [ "$1" = "-p" ]; then printf '22\\n'; exit 0; fi
if [ "$1" = "-e" ]; then exit 0; fi
if [ "$1" = "--input-type=commonjs" ]; then exit 0; fi
if [ "$2" = "authorize" ]; then
  printf 'authorize:%s:%s\n' "$5" "$6" >> "$INSRC_TEST_TRACE"
  if [ -f "$INSRC_TEST_TRACE.deny" ]; then exit 4; fi
  mkdir -p "$3/checkout/out/bin"
  : > "$3/checkout/out/bin/insrc-daemon-control.js"
  exit 0
fi
if [ "$2" = "prepare-legacy-upgrade" ]; then
  printf 'controller:%s:%s:%s\\n' "$3" "$4" "$5" >> "$INSRC_TEST_TRACE"
  rm -rf "$6"
  exit 0
fi
exit 45`);
	await shim(tools, 'npm', 'printf "npm:%s\\n" "$1" >> "$INSRC_TEST_TRACE"');
	const bridgeEnv = { ...process.env, HOME: home, TMPDIR: root, PATH: `${tools}:/usr/bin:/bin`,
		INSRC_DAEMON_ROOT: checkout, INSRC_CTL_LOG_DIR: root, INSRC_TEST_TRACE: trace };
	const origin = '/qualified/origin';
	const requireBridge = async () => {
		const events = (await readFile(trace, 'utf8')).trim().split('\n');
		assert.deepEqual(events, [`authorize:${origin}:v2`, 'npm:ci', 'npm:run',
			`controller:${checkout}:${origin}:v2`]);
		assert.equal(await readFile(join(checkout, 'incumbent'), 'utf8'), 'executable release');
	};
	await writeFile(trace, '');
	await exec('/bin/bash', [routedInstaller, '--target', checkout, '-y', '--repo', origin, '--branch', 'v2'],
		{ env: bridgeEnv, cwd: root, timeout: 12_000 });
	await requireBridge();

	await writeFile(trace + '.deny', '');
	const requireRefusal = async () => {
		assert.equal((await readFile(trace, 'utf8')).trim(), `authorize:${origin}:v2`);
		assert.equal(await readFile(join(checkout, 'incumbent'), 'utf8'), 'executable release');
	};
	await writeFile(trace, '');
	await assert.rejects(exec('/bin/bash', [routedInstaller, '--target', checkout, '-y', '--repo', origin, '--branch', 'v2'],
		{ env: bridgeEnv, cwd: root, timeout: 12_000 }), /macOS upgrade bridge authorization failed/);
	await requireRefusal();

});


test('Updated VS Code uses its bundled installer for unmanaged and managed updates and preserves failures', async t => {
 const root = await realpath(await mkdtemp('/tmp/insrc-current-route-'));
 t.after(() => rm(root, { recursive: true, force: true }));
 const checkout = join(root, 'legacy'), selected = join(root, 'selected'), state = join(root, 'state');
 const bundledInstaller = join(root, 'current-installer.sh'), trace = join(root, 'trace'), forbidden = join(root, 'old-ctl-used'), deny = join(root, 'deny');
 for (const path of [checkout, selected]) {
  await mkdir(join(path, 'scripts'), { recursive: true });
  await mkdir(join(path, 'out/daemon'), { recursive: true });
  await writeFile(join(path, 'out/daemon/index.js'), 'retained daemon');
  await writeFile(join(path, 'scripts/daemon-ctl.sh'), `#!/bin/sh\ntouch '${forbidden}'\nexit 66\n`, { mode: 0o700 });
 }
 await writeFile(bundledInstaller, `#!/bin/sh\nprintf '%s\n' "$@" > '${trace}'\nif [ -e '${deny}' ]; then echo 'source issuer rejected this release'; exit 4; fi\n`, { mode: 0o700 });
 const { createDaemonLifecycleController } = await import(new URL('../../../vscode-plugin/src/daemon/controller.ts', import.meta.url).href);
 const { defaultSubprocessRunner } = await import(new URL('../../../vscode-plugin/src/daemon/subprocess.ts', import.meta.url).href);
 const controller = createDaemonLifecycleController({
  paths: { daemonRoot: checkout, bundledInstaller, daemonEntry: join(checkout, 'out/daemon/index.js'), ctlScript: join(checkout, 'scripts/daemon-ctl.sh'), managedStateRoot: state },
  runner: { run: (argv: readonly string[]) => defaultSubprocessRunner.run(argv, { cwd: root }) },
  client: { reachability: async () => 'running' },
 });
 for (const managed of [false, true]) {
  if (managed) {
   await mkdir(join(state, 'managed-lifecycle'), { recursive: true, mode: 0o700 });
   await writeFile(join(state, 'managed-lifecycle/installation.json'), JSON.stringify({ version: 1, stateRoot: state, releaseRoot: selected, releaseId: 'selected', runtime: process.execPath, pathEnv: '/usr/bin:/bin', enabled: true }), { mode: 0o600 });
  }
  assert.deepEqual(await controller.run('update'), { ok: true, state: 'running' });
  assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n'), ['-y', '--target', checkout, '--migrate-runtime', '--no-start']);
  await assert.rejects(readFile(forbidden), { code: 'ENOENT' });
  await writeFile(deny, 'deny');
  const refused = await controller.run('update');
  assert.equal(refused.ok, false); assert.equal(refused.state, 'errored');
  assert.match(refused.message, /source issuer rejected/);
  assert.equal(await readFile(join(checkout, 'out/daemon/index.js'), 'utf8'), 'retained daemon');
  await assert.rejects(readFile(forbidden), { code: 'ENOENT' });
  await rm(deny);
 }
});
