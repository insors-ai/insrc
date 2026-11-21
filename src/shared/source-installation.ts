/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Stats } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { acquireRunFileGuard, readRunFileGuardPin } from './daemon-run-files.js';
import type { RunFileGuard } from './daemon-run-files.js';
import type { ProcessIdentity } from './daemon-process.js';
import { requireProcessIdentity } from './daemon-process.js';
import { assertSourceReleaseFloor, readVerifiedSourceRelease } from './managed-source-release.js';
import type { VerifiedSourceRelease } from './managed-source-release.js';
import { readReleaseCompatibility } from './source-release-compatibility.js';
import type { ReleaseCompatibility } from './source-release-compatibility.js';
import { requireQualifiedReleasePair } from './source-release-compatibility.js';
import type { QualifiedReleasePair } from './source-release-compatibility.js';
import type { StagedReleasePin } from '../daemon/managed-release-staging.js';

type LinuxTarget = 'linux-arm64' | 'linux-x64';
export interface SourceSelection {
	readonly pin: StagedReleasePin;
	readonly target: LinuxTarget;
	/** Immutable reference metadata from this release's binding, not the current builder policy. */
	readonly toolchain: { readonly nodeVersion: string; readonly archiveSha256: string };
	readonly source: VerifiedSourceRelease;
	readonly compatibility: ReleaseCompatibility;
	/** Reference only: activation must still verify the archive/inventory through its runtime owner. */
	readonly binding: string;
}

export type SourceTransactionPhase = 'reserved' | 'staged' | 'predecessor-exited' | 'candidate-selected'
	| 'candidate-ready' | 'committed' | 'rollback-required' | 'rolled-back' | 'recovery-required';
/** Lifecycle evidence is additive: old preparation-only records remain readable, never actionable. */
export interface SourceExecution {
	readonly operation: 'update' | 'start' | 'restart' | 'stop';
	readonly desiredRunning: boolean;
	readonly compatibility: QualifiedReleasePair;
	readonly step: 'prepared' | 'stop-original' | 'select-candidate' | 'spawn-candidate' | 'candidate-ready'
		| 'stop-candidate' | 'restore-selector' | 'spawn-prior' | 'prior-ready';
	readonly original: ProcessIdentity | null;
	readonly candidate: ProcessIdentity | null;
	readonly restored: ProcessIdentity | null;
	readonly originalClosed: boolean;
	readonly candidateClosed: boolean;
}
export interface SourceTransaction {
	readonly id: string;
	readonly phase: SourceTransactionPhase;
	readonly owner: ProcessIdentity;
	readonly baselineGeneration: number;
	readonly initialSelector: SourceSelection | null;
	readonly prior: StagedReleasePin | null;
	readonly candidate: SourceSelection | null;
	readonly wasRunning: boolean;
	readonly execution?: SourceExecution | undefined;
}

/** A single atomic document is both the selector and journal: no two-file cutover. */
export interface SourceInstallationState {
	readonly version: 1;
	readonly root: string;
	readonly installationRoot: string;
	readonly generation: number;
	readonly selected: SourceSelection | null;
	readonly active: SourceTransaction | null;
	readonly sourceReleases: readonly VerifiedSourceRelease[];
	readonly retained: readonly StagedReleasePin[];
	readonly retainedSelections: readonly SourceSelection[];
	readonly outcome: { readonly id: string; readonly decision: 'committed' | 'rolled-back' | 'recovery-required'; readonly detail: string } | null;
}

export interface SourcePublication {
	readonly root: string;
	readonly installationRoot: string;
	readonly generation: number;
	readonly beforeDigest: string | null;
	readonly afterDigest: string;
}
export class SourcePublicationUnknownError extends Error {
	override readonly name = 'SourcePublicationUnknownError';
	constructor(readonly publication: SourcePublication, cause: unknown) {
		super('Source state publication outcome is unknown; reconcile before another lifecycle action.', { cause });
	}
}

const MAX_BYTES = 128 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PHASES = new Set<SourceTransactionPhase>(['reserved', 'staged', 'predecessor-exited', 'candidate-selected',
	'candidate-ready', 'committed', 'rollback-required', 'rolled-back', 'recovery-required']);
type FaultPoint = 'file-synced' | 'before-rename' | 'after-rename' | 'directory-synced';
let fault: ((point: FaultPoint) => void) | undefined;
/** Synchronous fault seam; no production operation supplies filesystem delegates. */
export function _setSourcePublicationFaultForTests(value?: ((point: FaultPoint) => void) | undefined): void { fault = value; }

function fail(message: string): never { throw new Error(`source installation state: ${message}`); }
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function shape(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
	if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('invalid record shape');
}
function path(value: unknown): asserts value is string {
	if (typeof value !== 'string' || !isAbsolute(value) || value !== resolve(value) || /[\0\r\n]/.test(value)) fail('noncanonical absolute reference');
}
function integer(value: unknown): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) fail('invalid generation');
}
function inside(parent: string, child: string): boolean {
	const value = relative(parent, child);
	return value !== '' && value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}
function pin(value: unknown): asserts value is StagedReleasePin {
	shape(value, ['root', 'runtime', 'commit', 'fingerprint']); path(value.root); path(value.runtime);
	if (typeof value.commit !== 'string' || !COMMIT.test(value.commit) || typeof value.fingerprint !== 'string' || !HASH.test(value.fingerprint)) fail('invalid release pin');
}
function selection(value: unknown, root: string): asserts value is SourceSelection {
	shape(value, ['pin', 'target', 'toolchain', 'source', 'compatibility', 'binding']); pin(value.pin); path(value.binding);
	if (value.target !== 'linux-arm64' && value.target !== 'linux-x64') fail('invalid Linux target');
	shape(value.toolchain, ['nodeVersion', 'archiveSha256']);
	if (typeof value.toolchain.nodeVersion !== 'string' || value.toolchain.nodeVersion.length > 32
		|| !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value.toolchain.nodeVersion)
		|| typeof value.toolchain.archiveSha256 !== 'string' || !HASH.test(value.toolchain.archiveSha256)) fail('invalid runtime reference metadata');
	if (!inside(join(root, 'source-lifecycle', 'releases'), value.pin.root) || basename(value.pin.root) !== 'checkout') fail('release is outside source staging');
	const runtime = join(root, 'runtimes', `node-v${value.toolchain.nodeVersion}-${value.target}`, value.toolchain.archiveSha256, 'distribution', 'bin', 'node');
	const binding = join(root, 'source-runtimes', `${createHash('sha256').update(value.pin.root).digest('hex')}.json`);
	if (value.pin.runtime !== runtime || value.binding !== binding) fail('runtime or binding reference does not match the release');
	const receipt = readVerifiedSourceRelease(value.source), compatibility = readReleaseCompatibility(value.compatibility);
	if (receipt.commit !== value.pin.commit || compatibility.releaseId !== value.pin.commit) fail('source, compatibility and pin differ');
}

export function readSourceInstallationState(value: unknown, root: string, installationRoot: string): SourceInstallationState {
	shape(value, ['version', 'root', 'installationRoot', 'generation', 'selected', 'active', 'sourceReleases', 'retained', 'retainedSelections', 'outcome']);
	path(root); path(installationRoot); integer(value.generation);
	if (value.version !== 1 || value.root !== root || value.installationRoot !== installationRoot) fail('installation identity differs');
	if (value.selected !== null) selection(value.selected, root);
	if (!Array.isArray(value.retained) || value.retained.length > 128) fail('invalid retained pins');
	for (const item of value.retained) pin(item);
	if (!Array.isArray(value.retainedSelections) || value.retainedSelections.length > 128) fail('invalid retained selections');
	for (const item of value.retainedSelections) selection(item, root);
	if (value.outcome !== null) {
		shape(value.outcome, ['id', 'decision', 'detail']);
		if (typeof value.outcome.id !== 'string' || !UUID.test(value.outcome.id) || !['committed', 'rolled-back', 'recovery-required'].includes(value.outcome.decision as string)
			|| typeof value.outcome.detail !== 'string' || value.outcome.detail.length > 4096) fail('invalid outcome');
	}
	if (!Array.isArray(value.sourceReleases) || value.sourceReleases.length > 128) fail('invalid source floors');
	const channels = new Set<string>();
	for (const item of value.sourceReleases) {
		const receipt = readVerifiedSourceRelease(item), channel = JSON.stringify([receipt.channel.repoUrl, receipt.channel.branch]);
		if (channels.has(channel)) fail('duplicate source floor'); channels.add(channel);
	}
	if (value.active !== null) {
		const active = value.active;
		shape(active, ['id', 'phase', 'owner', 'baselineGeneration', 'initialSelector', 'prior', 'candidate', 'wasRunning',
			...(object(active) && Object.hasOwn(active, 'execution') ? ['execution'] : [])]);
		shape(active.owner, ['pid', 'startedAt', 'commandLine']); integer(active.baselineGeneration);
		if (typeof active.id !== 'string' || !UUID.test(active.id) || !PHASES.has(active.phase as SourceTransactionPhase)
			|| !Number.isSafeInteger(active.owner.pid) || (active.owner.pid as number) <= 0
			|| typeof active.owner.startedAt !== 'string' || !active.owner.startedAt || typeof active.owner.commandLine !== 'string' || !active.owner.commandLine
			|| typeof active.wasRunning !== 'boolean' || active.baselineGeneration > value.generation) fail('invalid transaction');
		if (active.initialSelector !== null) selection(active.initialSelector, root);
		if (active.prior !== null) pin(active.prior);
		if (active.candidate !== null) selection(active.candidate, root);
		if (Object.hasOwn(active, 'execution')) {
			const execution = active.execution;
			shape(execution, ['operation', 'desiredRunning', 'compatibility', 'step', 'original', 'candidate', 'restored', 'originalClosed', 'candidateClosed']);
			shape(execution.compatibility, ['prior', 'candidate']);
			const priorProfile = readReleaseCompatibility(execution.compatibility.prior), candidateProfile = readReleaseCompatibility(execution.compatibility.candidate);
			const pair = execution.operation === 'update'
				? requireQualifiedReleasePair(priorProfile, candidateProfile, [execution.compatibility as unknown as QualifiedReleasePair])
				: { prior: priorProfile, candidate: candidateProfile };
			if (execution.operation !== 'update' && !isDeepStrictEqual(priorProfile, candidateProfile)) fail('ordinary lifecycle changed writable formats');
			if (active.prior === null || active.candidate === null
				|| pair.prior.releaseId !== (active.prior as StagedReleasePin).commit
				|| !isDeepStrictEqual(pair.candidate, (active.candidate as SourceSelection).compatibility)) fail('execution release pair differs from pins');
			if (!['prepared', 'stop-original', 'select-candidate', 'spawn-candidate', 'candidate-ready', 'stop-candidate',
				'restore-selector', 'spawn-prior', 'prior-ready'].includes(execution.step as string)
				|| typeof execution.originalClosed !== 'boolean' || typeof execution.candidateClosed !== 'boolean') fail('invalid execution evidence');
			if (!['update', 'start', 'restart', 'stop'].includes(execution.operation as string)
				|| typeof execution.desiredRunning !== 'boolean') fail('invalid lifecycle intent');
			if (execution.desiredRunning !== (execution.operation === 'update' ? active.wasRunning : execution.operation !== 'stop')
				|| (execution.original !== null) !== active.wasRunning) fail('lifecycle intent differs from captured running state');
			if (execution.operation !== 'update' && (active.initialSelector === null
				|| !isDeepStrictEqual(active.initialSelector, active.candidate)
				|| !isDeepStrictEqual((active.initialSelector as SourceSelection).pin, active.prior))) fail('ordinary lifecycle changed its source release');
			for (const actor of [execution.original, execution.candidate, execution.restored]) {
				if (actor === null) continue;
				shape(actor, ['pid', 'startedAt', 'commandLine']);
				if (!Number.isSafeInteger(actor.pid) || (actor.pid as number) <= 0 || typeof actor.startedAt !== 'string'
					|| !actor.startedAt.startsWith('linux:') || typeof actor.commandLine !== 'string' || !actor.commandLine) fail('invalid Linux actor identity');
			}
		}
		if (['staged', 'predecessor-exited', 'candidate-selected', 'candidate-ready', 'committed'].includes(active.phase as string)
			&& (active.prior === null || active.candidate === null)) fail('qualified phase has no release pair');
	}
	const state = value as unknown as SourceInstallationState;
	for (const selected of selectionReferences(state)) {
		const floor = state.sourceReleases.find(item => item.channel.repoUrl === selected.source.channel.repoUrl && item.channel.branch === selected.source.channel.branch);
		if (floor === undefined) fail('referenced source receipt has no retained floor');
		assertSourceReleaseFloor(floor, [selected.source]);
	}
	return state;
}

function digest(bytes: string): string { return createHash('sha256').update(bytes).digest('hex'); }
function pinKey(value: StagedReleasePin): string { return JSON.stringify([value.root, value.runtime, value.commit, value.fingerprint]); }
function selectionReferences(state: SourceInstallationState): SourceSelection[] {
	return [...state.retainedSelections, ...(state.selected ? [state.selected] : []),
		...(state.active?.initialSelector ? [state.active.initialSelector] : []), ...(state.active?.candidate ? [state.active.candidate] : [])];
}
function pinReferences(state: SourceInstallationState): StagedReleasePin[] {
	return [...state.retained, ...selectionReferences(state).map(item => item.pin), ...(state.active?.prior ? [state.active.prior] : [])];
}
function same(a: Stats, b: Stats): boolean { return a.dev === b.dev && a.ino === b.ino; }
function owned(stat: Stats, uid: number, directory: boolean): void {
	if ((directory ? !stat.isDirectory() : !stat.isFile()) || stat.uid !== uid || (stat.mode & 0o077) !== 0
		|| (!directory && (stat.nlink !== 1 || stat.size > MAX_BYTES))) fail('file/directory is not bounded, private and owned');
}

/** Linux-only pinned-descriptor persistence. Unsupported platforms have no pathname fallback. */
export class SourceInstallationStore {
	constructor(readonly root: string, readonly installationRoot: string) { path(root); path(installationRoot); }

	private withDirectory<T>(create: boolean, run: (directory: string, assertPinned: () => void, sync: () => void, rootDirectory: string) => T,
		retained?: { close?: () => void } | undefined): T | undefined {
		const uid = process.getuid?.();
		if (process.platform !== 'linux' || uid === undefined) fail('pinned source persistence requires a Linux user');
		if (realpathSync(this.root) !== this.root || realpathSync(this.installationRoot) !== this.installationRoot
			|| !lstatSync(this.installationRoot).isDirectory()) fail('installation root is not canonical');
		const rootFd = openSync(this.root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
		let directoryFd: number | undefined;
		try {
			const rootStat = fstatSync(rootFd);
			if (!rootStat.isDirectory() || rootStat.uid !== uid || (rootStat.mode & 0o022) !== 0) fail('unsafe state root');
			const child = `/proc/self/fd/${rootFd}/source-lifecycle`;
			if (create) { try { mkdirSync(child, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } }
			try { directoryFd = openSync(child, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); }
			catch (error) { if (!create && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
			const directoryStat = fstatSync(directoryFd); owned(directoryStat, uid, true);
			const assertPinned = () => {
				if (!same(rootStat, lstatSync(this.root)) || !same(directoryStat, lstatSync(join(this.root, 'source-lifecycle')))
					|| realpathSync(this.root) !== this.root || realpathSync(join(this.root, 'source-lifecycle')) !== join(this.root, 'source-lifecycle')) fail('pinned directory was replaced');
				owned(fstatSync(directoryFd!), uid, true);
				const latestRoot = fstatSync(rootFd);
				if (latestRoot.uid !== uid || (latestRoot.mode & 0o022) !== 0) fail('state root permissions changed');
			};
			const sync = () => { fsyncSync(directoryFd!); fsyncSync(rootFd); assertPinned(); };
			assertPinned(); const result = run(`/proc/self/fd/${directoryFd}`, assertPinned, sync, `/proc/self/fd/${rootFd}`); assertPinned();
			if (retained) retained.close = () => { closeSync(directoryFd!); closeSync(rootFd); };
			return result;
		} finally { if (!retained?.close) { if (directoryFd !== undefined) closeSync(directoryFd); closeSync(rootFd); } }
	}

	/** Keep directory descriptors pinned for the complete asynchronous lifecycle lease. */
	acquireLifecycleGuard(kind: 'mutation' | 'run-files', owner: ProcessIdentity = requireProcessIdentity(process.pid)): RunFileGuard {
		const retained: { close?: () => void } = {};
		return this.withDirectory(true, (directory, assertPinned, sync, rootDirectory) => {
			const physical = kind === 'mutation' ? join(directory, 'mutation.guard') : join(rootDirectory, 'daemon.run-files.guard');
			const logical = kind === 'mutation' ? join(this.root, 'source-lifecycle/mutation.guard') : join(this.root, 'daemon.run-files.guard');
			const guard = acquireRunFileGuard(physical, owner);
			const assertOwned = () => { assertPinned(); guard.assertOwned(); assertPinned(); };
			assertOwned();
			for (const path of [join(physical, 'owner.json'), physical]) {
				const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
				try { fsyncSync(fd); } finally { closeSync(fd); }
			}
			sync();
			return { ...guard, path: logical, assertOwned, release() {
				assertOwned(); guard.release(); sync(); retained.close!(); delete retained.close;
			} };
		}, retained)!;
	}

	private empty(): SourceInstallationState {
		return { version: 1, root: this.root, installationRoot: this.installationRoot, generation: 0, selected: null, active: null, sourceReleases: [], retained: [], retainedSelections: [], outcome: null };
	}

	private load(directory: string): { state: SourceInstallationState; bytes: string | null } {
		let fd: number;
		try { fd = openSync(join(directory, 'journal.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
		catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: this.empty(), bytes: null }; throw error; }
		try {
			const stat = fstatSync(fd); owned(stat, process.getuid!(), false);
			const buffer = Buffer.alloc(Number(stat.size) + 1), count = readSync(fd, buffer, 0, buffer.length, 0);
			const after = fstatSync(fd);
			if (count !== stat.size || !same(stat, after) || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs
				|| !same(stat, lstatSync(join(directory, 'journal.json')))) fail('journal changed during read');
			const bytes = buffer.subarray(0, count).toString('utf8');
			const state = readSourceInstallationState(JSON.parse(bytes), this.root, this.installationRoot);
			this.references(state); return { state, bytes };
		} finally { closeSync(fd); }
	}

	private references(state: SourceInstallationState): void {
		const checkPin = (value: StagedReleasePin) => {
			for (const ref of [value.root, value.runtime]) if (realpathSync(ref) !== ref) fail('release reference traverses a link');
			const directory = lstatSync(value.root), binary = lstatSync(value.runtime), uid = process.getuid!();
			if (!directory.isDirectory() || directory.uid !== uid || (directory.mode & 0o022) !== 0 || !binary.isFile()
				|| !(binary.mode & 0o111) || (binary.uid !== uid && binary.uid !== 0) || (binary.mode & 0o022) !== 0) fail('unavailable or unsafe release reference');
		};
		const check = (value: SourceSelection) => {
			if (value.target !== `${process.platform}-${process.arch}`) fail('selection targets a different host');
			checkPin(value.pin);
			if (lstatSync(value.pin.runtime).uid !== process.getuid!()) fail('candidate runtime is not owned');
			if (realpathSync(value.binding) !== value.binding) fail('binding traverses a link');
			owned(lstatSync(resolve(value.binding, '..')), process.getuid!(), true);
			const fd = openSync(value.binding, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
			try {
				const stat = fstatSync(fd); owned(stat, process.getuid!(), false);
				const buffer = Buffer.alloc(Number(stat.size) + 1), n = readSync(fd, buffer, 0, buffer.length, 0);
				const after = fstatSync(fd);
				if (n !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs
					|| after.size !== stat.size || !same(stat, lstatSync(value.binding))) fail('binding changed during read');
				const binding: unknown = JSON.parse(buffer.subarray(0, n).toString('utf8'));
				shape(binding, ['schemaVersion', 'installationRoot', 'target', 'nodeVersion', 'archiveSha256', 'distribution', 'inventorySha256']);
				if (binding.schemaVersion !== 1 || binding.installationRoot !== value.pin.root || binding.target !== value.target
					|| binding.nodeVersion !== value.toolchain.nodeVersion || binding.archiveSha256 !== value.toolchain.archiveSha256
					|| binding.distribution !== resolve(value.pin.runtime, '../..') || typeof binding.inventorySha256 !== 'string' || !HASH.test(binding.inventorySha256)) fail('runtime binding reference differs');
			} finally { closeSync(fd); }
		};
		for (const item of selectionReferences(state)) check(item);
		for (const item of pinReferences(state)) checkPin(item);
	}

	read(): SourceInstallationState {
		return this.withDirectory(false, (directory, assertPinned) => { const result = this.load(directory).state; assertPinned(); return result; }) ?? this.empty();
	}

	private exclusive<T>(run: (directory: string, assertPinned: () => void, sync: () => void) => T): T {
		return this.withDirectory(true, (directory, assertPinned, sync) => {
			const guard = acquireRunFileGuard(join(directory, 'arbitration.guard'));
			try { readRunFileGuardPin(guard.path); guard.assertOwned(); assertPinned(); return run(directory, assertPinned, sync); }
			finally { guard.release(); }
		})!;
	}

	/** Compare-and-swap state under the existing short process guard. No callback may perform lifecycle work. */
	update(expectedGeneration: number, change: (state: SourceInstallationState) => SourceInstallationState): SourceInstallationState {
		integer(expectedGeneration);
		return this.exclusive((directory, assertPinned, sync) => {
			const before = this.load(directory);
			if (before.state.generation !== expectedGeneration || expectedGeneration === Number.MAX_SAFE_INTEGER) fail('stale or exhausted generation');
			const next = readSourceInstallationState({ ...change(structuredClone(before.state)), generation: expectedGeneration + 1 }, this.root, this.installationRoot);
			if (before.state.active && next.active && before.state.active.id !== next.active.id) fail('another transaction is active');
			if (before.state.active && next.active === null && !['committed', 'rolled-back'].includes(before.state.active.phase)) fail('unfinished transaction cannot be cleared');
			for (const previous of before.state.sourceReleases) {
				const current = next.sourceReleases.find(item => item.channel.repoUrl === previous.channel.repoUrl && item.channel.branch === previous.channel.branch);
				if (current === undefined) fail('source floor cannot be removed');
				assertSourceReleaseFloor(current, [previous]);
			}
			const nextSelections = selectionReferences(next);
			for (const previous of selectionReferences(before.state)) {
				if (!nextSelections.some(item => isDeepStrictEqual(item, previous))) fail('referenced source selection receipt cannot be dropped');
			}
			const retained = new Set(pinReferences(next).map(pinKey));
			for (const previous of pinReferences(before.state)) {
				if (!retained.has(pinKey(previous))) fail('referenced release pin cannot be dropped');
			}
			this.references(next);
			const bytes = JSON.stringify(next) + '\n'; if (Buffer.byteLength(bytes) > MAX_BYTES) fail('journal exceeds size bound');
			const publication: SourcePublication = { root: this.root, installationRoot: this.installationRoot, generation: next.generation,
				beforeDigest: before.bytes === null ? null : digest(before.bytes), afterDigest: digest(bytes) };
			const temporary = join(directory, `.journal-${randomUUID()}`);
			try {
				const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
				try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
				fault?.('file-synced'); assertPinned(); fault?.('before-rename');
				renameSync(temporary, join(directory, 'journal.json')); fault?.('after-rename');
				sync(); fault?.('directory-synced'); assertPinned(); return next;
			} catch (error) { throw new SourcePublicationUnknownError(publication, error); }
		});
	}

	/** Reread and flush the observed old/new document; never replay a callback after an unknown result. */
	reconcile(publication: SourcePublication): { status: 'published' | 'not-published'; state: SourceInstallationState } {
		shape(publication, ['root', 'installationRoot', 'generation', 'beforeDigest', 'afterDigest']); integer(publication.generation);
		if (publication.root !== this.root || publication.installationRoot !== this.installationRoot
			|| publication.generation < 1
			|| !HASH.test(publication.afterDigest) || (publication.beforeDigest !== null && !HASH.test(publication.beforeDigest))) fail('publication belongs to another installation');
		return this.exclusive((directory, assertPinned, sync) => {
			const current = this.load(directory), found = current.bytes === null ? null : digest(current.bytes);
			const published = found === publication.afterDigest && current.state.generation === publication.generation;
			if (!published && (found !== publication.beforeDigest || current.state.generation !== publication.generation - 1)) fail('publication conflicts with current state; recovery required');
			if (current.bytes !== null) {
				const fd = openSync(join(directory, 'journal.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
				try { owned(fstatSync(fd), process.getuid!(), false); fsyncSync(fd); } finally { closeSync(fd); }
			}
			sync(); assertPinned(); return { status: published ? 'published' : 'not-published', state: current.state };
		});
	}
}

/** The macOS selector/owner is intentionally unaffected by this additive Linux surface. */
export function readSourceInstallationSelector(root: string, installationRoot: string): SourceSelection | undefined {
	if (process.platform !== 'linux') return undefined;
	return new SourceInstallationStore(root, installationRoot).read().selected ?? undefined;
}
