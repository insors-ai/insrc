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
const control = fileURLToPath(new URL('../../../scripts/daemon-ctl.sh', import.meta.url));

test('Installer and updated CLI, VS Code and JetBrains route matrix', { timeout: 340_000 }, async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-bridge-routing-'));
	t.after(() => rm(root, { recursive: true, force: true }));
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
	const shim = async (name: string, content: string) => writeFile(join(tools, name), `#!/bin/bash\nset -eu\n${content}\n`, { mode: 0o700 });
	await shim('uname', 'printf "Darwin\\n"');
	await shim('git', `
if [ "$1" = "--version" ]; then printf 'git version 2.45.0\\n'; exit 0; fi
if [ "$1" = "check-ref-format" ]; then exit 0; fi
if [ "$1" = "-C" ] && [ "$3" = "remote" ]; then printf '/qualified/origin\\n'; exit 0; fi
if [ "$1" = "-C" ] && [ "$3" = "symbolic-ref" ]; then printf 'v2\\n'; exit 0; fi
printf 'unexpected git: %s\\n' "$*" >&2
exit 44`);
	await shim('node', `
if [ "$1" = "-v" ]; then printf 'v22.22.1\\n'; exit 0; fi
if [ "$1" = "-p" ]; then printf '22\\n'; exit 0; fi
if [ "$1" = "-e" ]; then exit 0; fi
if [ "$1" = "--input-type=commonjs" ]; then exit 0; fi
if [ "$2" = "authorize" ]; then
  printf 'authorize:%s:%s\n' "$5" "$6" >> "$INSRC_TEST_TRACE"
  mkdir -p "$3/checkout/out/bin"
  : > "$3/checkout/out/bin/insrc-daemon-control.js"
  exit 0
fi
if [ "$2" = "verify-built" ]; then
  printf 'verify-built\n' >> "$INSRC_TEST_TRACE"
  exit 0
fi
if [ "$2" = "prepare-legacy-upgrade" ]; then
  printf 'controller:%s:%s:%s\\n' "$3" "$4" "$5" >> "$INSRC_TEST_TRACE"
  rm -rf "$6"
  exit 0
fi
exit 45`);
	await shim('npm', 'printf "npm:%s\\n" "$1" >> "$INSRC_TEST_TRACE"');
	const env = { ...process.env, HOME: home, TMPDIR: root, PATH: `${tools}:/usr/bin:/bin`,
		INSRC_DAEMON_ROOT: checkout, INSRC_CTL_LOG_DIR: root, INSRC_TEST_TRACE: trace };
	const origin = '/qualified/origin';
	const requireBridge = async () => {
		const events = (await readFile(trace, 'utf8')).trim().split('\n');
		assert.deepEqual(events, [`authorize:${origin}:v2`, 'npm:ci', 'npm:run', 'verify-built',
			`controller:${checkout}:${origin}:v2`]);
		assert.equal(await readFile(join(checkout, 'incumbent'), 'utf8'), 'executable release');
	};
	for (const [script, args] of [
		[routedInstaller, ['--target', checkout, '-y', '--repo', origin, '--branch', 'v2']],
		[control, ['update', '--repo-url', origin, '--branch', 'v2']],
	] as const) {
		await writeFile(trace, '');
		await exec('/bin/bash', [script, ...args], { env, cwd: root, timeout: 12_000 });
		await requireBridge();
	}
	await writeFile(trace, '');
	const vscodeController = new URL('../../../vscode-plugin/src/daemon/controller.ts', import.meta.url).href;
	const vscodeSubprocess = new URL('../../../vscode-plugin/src/daemon/subprocess.ts', import.meta.url).href;
	const { createDaemonLifecycleController } = await import(vscodeController);
	const { defaultSubprocessRunner } = await import(vscodeSubprocess);
	const controller = createDaemonLifecycleController({
		paths: { daemonRoot: checkout, bundledInstaller: routedInstaller, daemonEntry: join(checkout, 'out/daemon/index.js'),
			ctlScript: join(checkout, 'scripts/daemon-ctl.sh'), managedStateRoot: join(home, '.insrc') },
		runner: { run: (argv: readonly string[]) => defaultSubprocessRunner.run(argv, { env, cwd: root }) },
		client: { reachability: async () => 'running' },
	});
	await copyFile(control, join(checkout, 'scripts/daemon-ctl.sh'));
	assert.deepEqual(await controller.run('update'), { ok: true, state: 'running' });
	await requireBridge();
	await writeFile(trace, '');
	const jetbrains = new URL('../../../jetbrains-plugin/test-bridge/run-focused-junit.ts', import.meta.url).href;
	const { runFocusedJUnit } = await import(jetbrains);
	runFocusedJUnit(['ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleCommandRunnerTest'], {
		...process.env, INSRC_ROUTE_MATRIX_HOME: home, INSRC_ROUTE_MATRIX_PATH: env.PATH,
		INSRC_ROUTE_MATRIX_TMP: root, INSRC_ROUTE_MATRIX_TRACE: trace,
		INSRC_ROUTE_MATRIX_INSTALLER: routedInstaller,
	});
	await requireBridge();
});
