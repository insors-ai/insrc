/** Checkout-local test/build ownership. No daemon state or production stores. */
import {
	constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
	readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { QUALIFICATION_TIME_BUDGETS } from '../../src/installer/qualification-time-budgets.mjs';

export const DEFAULT_BUDGETS = QUALIFICATION_TIME_BUDGETS.coordinator;
const PHASES = ['preparing', 'mutating', 'reading', 'draining', 'blocked'];
const DIAGNOSTICS = ['NODE_OPTIONS', 'DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'];

export function harnessError(code, message) {
	return Object.assign(new Error(message), { code: `harness-${code}` });
}

export function assertSupportedVersion(version) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match || +match[1] !== 22 || +match[2] < 22 || (+match[2] === 22 && +match[3] < 1)) {
		throw harnessError('runtime-unsupported', 'Use Node 22.22.1 or newer Node 22.x to run the harness.');
	}
}

export function runtimeContext() {
	assertSupportedVersion(process.version);
	return { executable: realpathSync(process.execPath), version: process.version };
}

/** Normalize case aliases too, so a custom Windows environment has one selector.
 * Missing values inherit the admitted process policy; conflicts never switch it. */
export function qualificationEnvironment(inherited) {
	const env = { ...inherited };
	for (const key of Object.keys(env)) {
		if (key.toUpperCase() !== 'INSRC_QUALIFICATION_PROFILE') continue;
		if (env[key] !== undefined && env[key] !== QUALIFICATION_TIME_BUDGETS.profile) {
			throw Object.assign(new Error('Child qualification profile conflicts with the admitted process policy'), { code: 'qualification-profile-invalid' });
		}
		delete env[key];
	}
	env.INSRC_QUALIFICATION_PROFILE = QUALIFICATION_TIME_BUDGETS.profile;
	return env;
}

export function childEnvironment(runtime, inherited = process.env) {
	const env = qualificationEnvironment(inherited);
	for (const key of DIAGNOSTICS) delete env[key];
	// A coordinator may itself be exercised by node:test. Its children are new
	// runners, not the parent's internal worker (which would skip all files).
	delete env.NODE_TEST_CONTEXT;
	env.PATH = [dirname(runtime.executable), inherited.PATH ?? ''].join(delimiter);
	return env;
}

export function checkedBudgets(overrides = {}) {
	if (Object.keys(overrides).some(key => !Object.hasOwn(DEFAULT_BUDGETS, key))) throw harnessError('context-invalid', 'Unknown harness budget.');
	const budgets = { ...DEFAULT_BUDGETS, ...overrides };
	if (Object.values(budgets).some(value => !Number.isSafeInteger(value) || value <= 0)) throw harnessError('context-invalid', 'Harness budgets must be positive integer milliseconds.');
	return budgets;
}

// Check every owned parent instead of following a foreign symlink through mkdir.
function harnessDirectory(root) {
	let directory = root;
	for (const name of ['.insrc', 'tmp', 'test-harness']) {
		directory = join(directory, name);
		try { mkdirSync(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
		const stat = lstatSync(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw harnessError('context-invalid', 'Harness parent must be a real directory.');
	}
	return directory;
}

function identity(path) {
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw harnessError('context-invalid', 'Lease must be a real directory.');
	return { dev: stat.dev, ino: stat.ino };
}

function readRecord(active) {
	const fd = openSync(join(active, 'run.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		if (!fstatSync(fd).isFile()) throw harnessError('context-invalid', 'Lease record must be a regular file.');
		const record = JSON.parse(readFileSync(fd, 'utf8'));
		if (record.version !== 1 || typeof record.runId !== 'string' || !/^[a-f0-9-]{36}$/.test(record.runId) || !PHASES.includes(record.phase)
			|| typeof record.canonicalRoot !== 'string' || typeof record.workspace !== 'string' || typeof record.runtimeExecutable !== 'string'
			|| typeof record.runtimeVersion !== 'string' || !['test', 'build'].includes(record.mode) || !Array.isArray(record.selectedFiles)
			|| record.selectedFiles.some(file => typeof file !== 'string') || !Array.isArray(record.diagnosticFlags)
			|| record.diagnosticFlags.some(flag => !DIAGNOSTICS.includes(flag)) || typeof record.budgets !== 'object' || record.budgets === null
			|| Object.keys(record.budgets).length !== Object.keys(DEFAULT_BUDGETS).length
			|| Object.keys(DEFAULT_BUDGETS).some(key => !Object.hasOwn(record.budgets, key))
			|| !isAbsolute(record.canonicalRoot) || !isAbsolute(record.runtimeExecutable)
			|| record.workspace !== join(record.canonicalRoot, '.insrc/tmp/test-harness/runs', record.runId)) throw harnessError('context-invalid', 'Invalid lease record.');
		checkedBudgets(record.budgets);
		assertSupportedVersion(record.runtimeVersion);
		return record;
	} finally { closeSync(fd); }
}

export function createRun(rootPath, { mode = 'test', selectedFiles = [], budgets: overrides = {}, runId: requestedRunId } = {}) {
	const runtime = runtimeContext(); // Refuse before creating directories.
	const environment = childEnvironment(runtime); // Validate before allocating an operation root/lease.
	if (requestedRunId !== undefined && (typeof requestedRunId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(requestedRunId))) throw harnessError('context-invalid', 'Explicit run identity must be a UUID.');
	const budgets = checkedBudgets(overrides);
	if (!['test', 'build'].includes(mode) || !Array.isArray(selectedFiles) || selectedFiles.some(file => typeof file !== 'string')) throw harnessError('context-invalid', 'Invalid run selection.');
	const root = realpathSync(rootPath);
	const directory = harnessDirectory(root);
	const active = join(directory, 'active');
	try { mkdirSync(active, { mode: 0o700 }); } catch (error) {
		if (error.code === 'EEXIST') throw harnessError('busy', 'Checkout already owned; inspect .insrc/tmp/test-harness/active. Never recover by PID or age alone.');
		throw error;
	}
	const leaseIdentity = identity(active);
	const runId = requestedRunId ?? randomUUID();
	const runs = join(directory, 'runs');
	try { mkdirSync(runs, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
	identity(runs);
	const workspace = join(runs, runId);
	mkdirSync(workspace, { mode: 0o700 });
	let record = { version: 1, runId, canonicalRoot: root, runtimeExecutable: runtime.executable, runtimeVersion: runtime.version, mode, phase: 'preparing', selectedFiles: [...selectedFiles], budgets, workspace, diagnosticFlags: DIAGNOSTICS.filter(key => !!process.env[key]) };
	writeFileSync(join(active, 'run.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

	function assertOwner() {
		try {
			for (const path of [join(root, '.insrc'), join(root, '.insrc/tmp'), directory]) identity(path);
			const current = identity(active);
			const disk = readRecord(active);
			if (current.dev !== leaseIdentity.dev || current.ino !== leaseIdentity.ino || !isDeepStrictEqual(disk, record)) throw new Error('changed');
		} catch { throw harnessError('context-invalid', 'Lease identity changed; refusing transition or removal.'); }
	}
	function transition(phase, outcome) {
		assertOwner();
		const allowed = { preparing: ['mutating', 'reading', 'draining', 'blocked'], mutating: ['reading', 'draining', 'blocked'], reading: ['mutating', 'draining', 'blocked'], draining: ['blocked'], blocked: [] };
		if (!allowed[record.phase].includes(phase)) throw harnessError('context-invalid', `Invalid harness transition ${record.phase} to ${phase}.`);
		if (record.phase === 'reading' && phase === 'mutating') {
			try { if (readdirSync(join(workspace, 'actors')).length) throw harnessError('busy', 'Readers must close before the coordinator admits another writer.'); }
			catch (error) { if (error.code !== 'ENOENT') throw error; }
		}
		record = { ...record, phase, ...(outcome === undefined ? {} : { outcome }) };
		const pending = join(active, 'run.next.json');
		writeFileSync(pending, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
		renameSync(pending, join(active, 'run.json'));
	}
	function release({ confirmedClosed = false } = {}) {
		assertOwner();
		if (!confirmedClosed || readdirSync(active).some(name => name !== 'run.json')) {
			if (record.phase !== 'blocked') transition('blocked');
			throw harnessError('cleanup-unconfirmed', 'Owned actor closure is unconfirmed; checkout remains blocked.');
		}
		if (record.phase !== 'draining') throw harnessError('context-invalid', 'Drain before releasing ownership.');
		unlinkSync(join(active, 'run.json'));
		rmdirSync(active); // Never recursively remove a foreign or unexpected entry.
	}
	return { root, active, workspace, runtime, budgets, runId, get record() { return structuredClone(record); }, assertOwner, transition, release, environment: () => ({ ...environment, INSRC_TEST_RUN_ID: runId, INSRC_TEST_ROOT: root }) };
}

/** Explicit operator recovery only. Does not delete workspaces or signal PIDs. */
export function recoverRun(rootPath, { runId, confirmedActorsEnded = false } = {}) {
	if (!confirmedActorsEnded) throw harnessError('cleanup-unconfirmed', 'Confirm all old actors ended before recovery.');
	const root = realpathSync(rootPath);
	const directory = harnessDirectory(root);
	const active = join(directory, 'active');
	identity(active);
	const record = readRecord(active);
	if (record.runId !== runId || record.canonicalRoot !== root) throw harnessError('context-invalid', 'Recovery run identity mismatch.');
	const entries = readdirSync(active);
	if (entries.some(name => name !== 'run.json' && name !== 'writer')) throw harnessError('context-invalid', 'Unexpected lease entry; ownership metadata was retained.');
	if (entries.includes('writer')) {
		identity(join(active, 'writer'));
		if (readdirSync(join(active, 'writer')).length) throw harnessError('context-invalid', 'Unexpected writer contents; ownership metadata was retained.');
	}
	const recovered = join(directory, 'recovered');
	try { mkdirSync(recovered, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
	identity(recovered);
	// Preserve metadata and any empty reservation in one rename. A failed
	// recovery must not leave an active directory whose owner record was lost.
	renameSync(active, join(recovered, `${runId}-${randomUUID()}`));
}

/** Environment selects a participant; the on-disk lease and runtime authorize it. */
export function participantContext(rootPath = process.env.INSRC_TEST_ROOT) {
	if (!rootPath || !process.env.INSRC_TEST_RUN_ID) throw harnessError('context-invalid', 'Use npm test -- <repo-relative test file> under Node 22.');
	const root = realpathSync(rootPath), runtime = runtimeContext();
	const directory = join(root, '.insrc/tmp/test-harness');
	for (const path of [join(root, '.insrc'), join(root, '.insrc/tmp'), directory]) identity(path);
	const active = join(directory, 'active');
	identity(active);
	const record = readRecord(active);
	if (record.runId !== process.env.INSRC_TEST_RUN_ID || record.canonicalRoot !== root || record.runtimeExecutable !== runtime.executable || record.runtimeVersion !== runtime.version || ['draining', 'blocked'].includes(record.phase)) throw harnessError('context-invalid', 'No matching admitted run. Use the supported test selector command.');
	identity(record.workspace);
	return { ...record, root, active, runtime };
}
