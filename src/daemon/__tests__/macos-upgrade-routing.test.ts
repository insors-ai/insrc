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

const shim = async (dir: string, name: string, content: string) =>
	writeFile(join(dir, name), `#!/bin/bash\nset -eu\n${content}\n`, { mode: 0o700 });

const git = (args: string[], cwd?: string) => exec('git', args, cwd === undefined ? undefined : { cwd });

test('Installer and updated CLI, VS Code and JetBrains route matrix', { timeout: 340_000 }, async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-bridge-routing-'));
	t.after(() => rm(root, { recursive: true, force: true }));

	// -------------------------------------------------------------------------
	// Part 1 — the raw installer's own signed macOS upgrade bridge, UNCHANGED:
	// it still migrates an unmanaged existing checkout on Darwin, and still
	// refuses cleanly when the bridge's own authorization is denied. This
	// Story never touched scripts/insrc-daemon-install.sh, only the THREE
	// callers that used to re-exec into it for a plain `update`.
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
	await shim(tools, 'node', `
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

	// -------------------------------------------------------------------------
	// Part 2 — the fix: daemon-ctl.sh update, VS Code's controller.run('update')
	// and JetBrains' DaemonLifecycleCommandRunner no longer pre-empt into the
	// signed bridge for an unmanaged (plain git-clone) install — they now run a
	// plain git-fetch + npm-install + npm-build update directly, needing no
	// signing at all. Exercised against a REAL local origin + real git (the
	// bridge fixture's git is faked and only understands the handful of
	// subcommands the bridge itself issues), with only `uname` and `npm`
	// shimmed — `npm` to keep this fast, `uname` to force Darwin for
	// CI-portability. `node` is shimmed too: daemon-ctl.sh resolves a `node`
	// on PATH unconditionally for every command, even though the plain update
	// path never actually invokes it.
	// -------------------------------------------------------------------------
	const plainRoot = join(root, 'plain');
	const plainTools = join(plainRoot, 'bin');
	await mkdir(plainTools, { recursive: true });
	const plainTrace = join(plainRoot, 'trace');
	await shim(plainTools, 'uname', 'printf "Darwin\\n"');
	await shim(plainTools, 'node', 'exit 0');
	await shim(plainTools, 'npm', 'printf "npm:%s\\n" "$1" >> "$INSRC_TEST_TRACE"');
	const plainEnv = (surfaceHome: string) => ({ ...process.env, HOME: surfaceHome, TMPDIR: plainRoot,
		PATH: `${plainTools}:/usr/bin:/bin`, INSRC_CTL_LOG_DIR: plainRoot, INSRC_TEST_TRACE: plainTrace });

	const commit = async (dir: string, message: string) => {
		await git(['add', '-A'], dir);
		await git(['-c', 'user.email=t@insrc.test', '-c', 'user.name=t', 'commit', '-m', message], dir);
		await git(['push', 'origin', 'HEAD:main'], dir);
	};
	const originRepo = join(plainRoot, 'origin.git');
	await git(['init', '--bare', '--initial-branch=main', originRepo]);
	const seed = join(plainRoot, 'seed');
	await git(['clone', '--quiet', originRepo, seed]);
	await mkdir(join(seed, 'src'), { recursive: true });
	await mkdir(join(seed, 'scripts'), { recursive: true });
	await writeFile(join(seed, 'package.json'), '{"name":"insrc-daemon-fixture"}\n');
	await writeFile(join(seed, 'package-lock.json'), '{"lockfileVersion":3}\n');
	await writeFile(join(seed, 'src/index.js'), 'v1\n');
	await copyFile(control, join(seed, 'scripts/daemon-ctl.sh'));
	await commit(seed, 'v1');

	const freshCheckout = async (name: string) => {
		const surfaceHome = join(plainRoot, name);
		await mkdir(join(surfaceHome, '.insrc'), { recursive: true });
		const surfaceCheckout = join(surfaceHome, '.insrc/daemon');
		await git(['clone', '--quiet', originRepo, surfaceCheckout]);
		return { home: surfaceHome, checkout: surfaceCheckout };
	};
	const ctlSurface = await freshCheckout('daemon-ctl');
	const vscodeSurface = await freshCheckout('vscode');
	const jetbrainsSurface = await freshCheckout('jetbrains');

	await writeFile(join(seed, 'src/index.js'), 'v2\n');
	await commit(seed, 'v2');
	const head2 = (await git(['rev-parse', 'HEAD'], seed)).stdout.trim();

	const requirePlainUpdate = async (surfaceCheckout: string) => {
		assert.equal((await git(['rev-parse', 'HEAD'], surfaceCheckout)).stdout.trim(), head2,
			'a real git fetch + fast-forward merge actually ran');
		const events = (await readFile(plainTrace, 'utf8')).trim();
		assert.doesNotMatch(events, /authorize|controller:|npm:ci\b/,
			'no signed-bridge trace event fires for a plain update');
		assert.match(events, /npm:install/, 'npm install ran');
		assert.match(events, /npm:run/, 'npm run build ran');
	};

	await writeFile(plainTrace, '');
	await exec('/bin/bash', [control, 'update'], { env: plainEnv(ctlSurface.home), cwd: plainRoot, timeout: 30_000 });
	await requirePlainUpdate(ctlSurface.checkout);

	const vscodeController = new URL('../../../vscode-plugin/src/daemon/controller.ts', import.meta.url).href;
	const vscodeSubprocess = new URL('../../../vscode-plugin/src/daemon/subprocess.ts', import.meta.url).href;
	const { createDaemonLifecycleController } = await import(vscodeController);
	const { defaultSubprocessRunner } = await import(vscodeSubprocess);
	const controller = createDaemonLifecycleController({
		paths: { daemonRoot: vscodeSurface.checkout, bundledInstaller: routedInstaller,
			daemonEntry: join(vscodeSurface.checkout, 'out/daemon/index.js'),
			ctlScript: join(vscodeSurface.checkout, 'scripts/daemon-ctl.sh'), managedStateRoot: join(vscodeSurface.home, '.insrc') },
		runner: { run: (argv: readonly string[]) => defaultSubprocessRunner.run(argv, { env: plainEnv(vscodeSurface.home), cwd: plainRoot }) },
		client: { reachability: async () => 'running' },
	});
	await writeFile(plainTrace, '');
	assert.deepEqual(await controller.run('update'), { ok: true, state: 'running' });
	await requirePlainUpdate(vscodeSurface.checkout);

	// controller.ts's unrelated candidate-script selection still works after
	// the pre-emption removal: once a managed selector appears, run('update')
	// picks the SELECTED release's own ctl script instead of the original
	// checkout's — pure path-selection, exercised with a no-op stub so it
	// needs no git/npm at all.
	const candidate = join(vscodeSurface.home, 'selected');
	const candidateCtl = join(candidate, 'scripts', 'daemon-ctl.sh');
	await mkdir(join(candidate, 'scripts'), { recursive: true });
	await writeFile(candidateCtl, '#!/bin/sh\n', { mode: 0o700 });
	await mkdir(join(candidate, 'out', 'daemon'), { recursive: true });
	await writeFile(join(candidate, 'out', 'daemon', 'index.js'), '');
	await mkdir(join(vscodeSurface.home, '.insrc', 'managed-lifecycle'), { recursive: true, mode: 0o700 });
	await writeFile(join(vscodeSurface.home, '.insrc', 'managed-lifecycle', 'installation.json'), JSON.stringify({
		version: 1, stateRoot: join(vscodeSurface.home, '.insrc'), releaseRoot: candidate, releaseId: 'candidate',
		runtime: process.execPath, pathEnv: '/usr/bin', enabled: true,
	}), { mode: 0o600 });
	await writeFile(plainTrace, '');
	assert.deepEqual(await controller.run('update'), { ok: true, state: 'running' });
	assert.equal((await readFile(plainTrace, 'utf8')).trim(), '',
		'the trivial candidate stub ran instead of the checkout\'s real daemon-ctl.sh (no git/npm activity)');

	const jetbrains = new URL('../../../jetbrains-plugin/test-bridge/run-focused-junit.ts', import.meta.url).href;
	const { runFocusedJUnit } = await import(jetbrains);
	await writeFile(plainTrace, '');
	await runFocusedJUnit(['ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleCommandRunnerTest'], {
		...process.env, INSRC_ROUTE_MATRIX_HOME: jetbrainsSurface.home, INSRC_ROUTE_MATRIX_PATH: plainEnv(jetbrainsSurface.home).PATH,
		INSRC_ROUTE_MATRIX_TMP: plainRoot, INSRC_ROUTE_MATRIX_TRACE: plainTrace,
		INSRC_ROUTE_MATRIX_INSTALLER: routedInstaller, INSRC_ROUTE_MATRIX_EXPECTED: 'ok',
	});
	await requirePlainUpdate(jetbrainsSurface.checkout);
});
