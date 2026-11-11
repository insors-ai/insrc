/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesDarwinPeer, readDarwinIncarnation } from './darwin-lifecycle.js';
import type { DarwinIncarnation, DarwinLaunchJob } from './darwin-lifecycle.js';
import { SupervisorLifecycleError } from './daemon-supervisor-protocol.js';
import type { ManagedInstallation } from './managed-daemon-installation.js';
import type { RunFileIdentity } from './daemon-run-files.js';

const HELPER = fileURLToPath(new URL('../../out/bin/insrc-darwin-lifecycle', import.meta.url));
const MAX_BYTES = 128 * 1024;
const MAX_STEPS = 128;
const LOCK_BUSY_EXIT = 75;

export interface UpdatePredecessor {
	readonly priorRelease: string;
	readonly candidateRelease: string;
	readonly priorCommit: string;
	readonly wasRunning: boolean;
	readonly generation?: string | null;
	readonly pins?: { readonly prior: ManagedInstallation; readonly candidate: ManagedInstallation };
	readonly launch?: LegacyLaunchPin;
	readonly selectorAbsent?: true;
	readonly preparing?: true;
	readonly legacy?: {
		readonly job: DarwinLaunchJob;
		readonly descriptorHash: string;
		readonly runAtLoad: boolean;
		readonly entry: string;
		readonly baseline: ManagedInstallation;
	};
}

export type LegacyLaunchPin =
	| { readonly kind: 'direct' | 'job'; readonly process: DarwinIncarnation; readonly cwd: string;
		readonly argv: readonly string[]; readonly pidFile: RunFileIdentity; readonly socketFile: RunFileIdentity }
	| { readonly kind: 'stopped' };

export type MutationRequest =
	| { readonly kind: 'start'; readonly owner: DarwinIncarnation; readonly activation?: FreshActivation }
	| { readonly kind: 'stop' | 'restart'; readonly owner: DarwinIncarnation }
	| { readonly kind: 'update'; readonly owner: DarwinIncarnation; readonly predecessor: UpdatePredecessor };

export interface FreshActivation {
	readonly installation: ManagedInstallation;
	readonly startChild: boolean;
	readonly fingerprint: string;
}

export interface MutationAuthority {
	readonly id: string;
	/** Captured from the current OS peer, never from a protocol request body. */
	readonly owner: DarwinIncarnation;
}

interface JournalEntry {
	readonly step: string;
	readonly intent: string;
	readonly receipt?: string;
}

export type MutationReservation = MutationRequest & {
	readonly id: string;
	readonly entries: readonly JournalEntry[];
	readonly recovery?: true;
};

export type UpdateDecision = 'committed' | 'rolled-back' | 'operator-recovery';

export interface DurableUpdateOutcome {
	readonly id: string;
	readonly decision: UpdateDecision;
	readonly detail: string;
	readonly finishedAt?: string;
}

export interface InstallationJournal {
	readonly version: 1;
	readonly root: string;
	readonly active: MutationReservation | null;
	readonly outcome: DurableUpdateOutcome | null;
}

export type RecoveryDecision = 'idle' | 'uncommitted' | 'activate' | 'finish-rollback' | 'fenced';
type MutationPurpose = 'lifecycle' | 'activate' | 'reconcile';

export function classifyMutationRecovery(journal: InstallationJournal): RecoveryDecision {
	if (journal.active === null) return 'idle';
	if (journal.active.id !== journal.outcome?.id) return 'uncommitted';
	switch (journal.outcome.decision) {
		case 'committed': return 'activate';
		case 'rolled-back': return 'finish-rollback';
		case 'operator-recovery': return 'fenced';
	}
}

function conflict(message: string): never {
	throw new SupervisorLifecycleError('ownership-conflict', message);
}

function busy(): never {
	throw new SupervisorLifecycleError('busy', 'installation lifecycle operation is already reserved');
}

function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && !value.includes('\0');
}

function validOwner(value: unknown): value is DarwinIncarnation {
	return object(value) && typeof value.pid === 'number' && Number.isSafeInteger(value.pid) && value.pid > 0
		&& typeof value.uid === 'number' && Number.isSafeInteger(value.uid) && value.uid > 0
		&& text(value.startedAt) && text(value.executable) && isAbsolute(value.executable);
}

function validLegacyLaunch(value: unknown): value is LegacyLaunchPin {
	if (!object(value)) return false;
	if (value.kind === 'stopped') return Object.keys(value).length === 1;
	const file = (entry: unknown) => object(entry)
		&& ['dev', 'ino', 'ctimeNs', 'mtimeNs', 'size'].every(key => typeof entry[key] === 'string' && /^\d+$/.test(entry[key]));
	return (value.kind === 'direct' || value.kind === 'job') && validOwner(value.process)
		&& text(value.cwd) && isAbsolute(value.cwd) && Array.isArray(value.argv) && value.argv.length >= 2
		&& value.argv.length <= 4 && value.argv.every(arg => text(arg) && !/[\r\n]/.test(arg))
		&& file(value.pidFile) && file(value.socketFile);
}

function validPredecessor(value: unknown): value is UpdatePredecessor {
	if (!object(value) || !text(value.priorRelease) || !text(value.candidateRelease)
		|| typeof value.priorCommit !== 'string' || typeof value.wasRunning !== 'boolean'
		|| (value.generation !== undefined && value.generation !== null && !text(value.generation))) return false;
	if (value.selectorAbsent !== undefined && (value.selectorAbsent !== true || value.launch === undefined)) return false;
	if (value.preparing !== undefined && (value.preparing !== true || value.candidateRelease !== 'unqualified'
		|| value.pins !== undefined || value.launch !== undefined || value.legacy !== undefined)) return false;
	if (value.pins === undefined) return value.legacy === undefined && value.launch === undefined;
	if (!object(value.pins)) return false;
	const { prior, candidate } = value.pins;
	const pin = (item: unknown, releaseId: string, enabled: boolean): item is ManagedInstallation =>
		object(item) && item.releaseId === releaseId && item.version === 1 && item.enabled === enabled
		&& text(item.stateRoot) && isAbsolute(item.stateRoot) && text(item.releaseRoot) && isAbsolute(item.releaseRoot)
		&& text(item.runtime) && isAbsolute(item.runtime) && typeof item.pathEnv === 'string';
	if (value.launch !== undefined && (!validLegacyLaunch(value.launch)
		|| value.wasRunning !== (value.launch.kind !== 'stopped') || value.generation != null
		|| (value.launch.kind === 'job' && value.legacy === undefined)
		|| (value.launch.kind === 'direct' && value.legacy !== undefined))) return false;
	if (!pin(prior, value.priorRelease, value.legacy === undefined && value.launch === undefined) || !pin(candidate, value.candidateRelease, true)
		|| prior.stateRoot !== candidate.stateRoot) return false;
	if (value.launch !== undefined && value.launch.kind !== 'stopped'
		&& (value.launch.process.executable !== prior.runtime || value.launch.cwd !== prior.releaseRoot
			|| value.launch.argv.at(-1) !== join(prior.releaseRoot, 'out/daemon/index.js'))) return false;
	if (value.legacy === undefined) return true;
	if (!object(value.legacy)) return false;
	const { job, descriptorHash, entry, baseline, runAtLoad } = value.legacy;
	return object(job) && typeof job.uid === 'number' && Number.isSafeInteger(job.uid) && job.uid > 0
		&& text(job.label) && /^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(job.label)
		&& text(job.descriptor) && isAbsolute(job.descriptor) && text(job.program) && isAbsolute(job.program)
		&& Array.isArray(job.args) && job.args.length > 0 && job.args.every(text) && job.args[0] === job.program
		&& (job.workingDirectory === undefined || job.workingDirectory === prior.releaseRoot)
		&& typeof descriptorHash === 'string' && /^[a-f0-9]{64}$/.test(descriptorHash)
		&& typeof runAtLoad === 'boolean'
		&& text(entry) && isAbsolute(entry) && pin(baseline, value.candidateRelease, false)
		&& baseline.stateRoot === candidate.stateRoot && baseline.releaseRoot === candidate.releaseRoot && baseline.runtime === candidate.runtime;
}

function validRequest(value: unknown): value is MutationRequest {
	return object(value) && validOwner(value.owner) && ((value.kind === 'start'
		&& (value.activation === undefined || validActivation(value.activation))) || value.kind === 'stop'
		|| value.kind === 'restart' || (value.kind === 'update' && validPredecessor(value.predecessor)
			&& (value.predecessor.launch === undefined || ((value.predecessor.launch.kind === 'stopped'
				|| value.predecessor.launch.process.uid === value.owner.uid)
				&& (value.predecessor.legacy === undefined || value.predecessor.legacy.job.uid === value.owner.uid)))));
}

function validActivation(value: unknown): value is FreshActivation {
	if (!object(value) || typeof value.startChild !== 'boolean' || !object(value.installation)) return false;
	const pin = value.installation;
	return pin.version === 1 && pin.enabled === true && typeof pin.releaseId === 'string'
		&& /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(pin.releaseId)
		&& [pin.stateRoot, pin.releaseRoot, pin.runtime].every(path => text(path) && isAbsolute(path))
		&& typeof pin.pathEnv === 'string' && !/[\r\n\0]/.test(pin.pathEnv)
		&& typeof value.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(value.fingerprint);
}

function validEntries(value: unknown): value is readonly JournalEntry[] {
	if (!Array.isArray(value) || value.length > MAX_STEPS) return false;
	const steps = new Set<string>();
	return value.every((entry: unknown, index) => {
		if (!object(entry) || !text(entry.step) || !text(entry.intent) || steps.has(entry.step)
			|| (entry.receipt === undefined ? index !== value.length - 1 : !text(entry.receipt))) return false;
		steps.add(entry.step);
		return true;
	});
}

function validDecision(value: unknown): value is UpdateDecision {
	return value === 'committed' || value === 'rolled-back' || value === 'operator-recovery';
}

function readJournal(bytes: string, root: string, uid: number): InstallationJournal {
	let parsed: unknown;
	try { parsed = JSON.parse(bytes); } catch { conflict('invalid installation journal'); }
	if (!object(parsed) || parsed.version !== 1 || parsed.root !== root) conflict('invalid installation journal identity');
	const { active, outcome } = parsed;
	if (active !== null && (!object(active) || !text(active.id) || !validEntries(active.entries)
		|| (active.recovery !== undefined && active.recovery !== true)
		|| !validRequest(active) || active.owner.uid !== uid)) conflict('invalid installation reservation');
	if (outcome !== null && (!object(outcome) || !text(outcome.id) || !validDecision(outcome.decision)
		|| !text(outcome.detail) || (outcome.finishedAt !== undefined
			&& (typeof outcome.finishedAt !== 'string' || !Number.isFinite(Date.parse(outcome.finishedAt)))))) conflict('invalid installation outcome');
	const journal = parsed as unknown as InstallationJournal;
	if (journal.active?.kind === 'start' && journal.active.activation !== undefined
		&& journal.active.activation.installation.stateRoot !== root) conflict('fresh activation names another installation root');
	if (journal.active?.kind === 'update' && journal.active.predecessor.launch !== undefined
		&& journal.active.predecessor.pins?.prior.stateRoot !== root) conflict('legacy migration names another installation root');
	if (journal.active !== null && journal.outcome !== null && journal.active.id === journal.outcome.id
		&& journal.active.kind !== 'update') {
		conflict('update outcome belongs to an ordinary lifecycle reservation');
	}
	return journal;
}

async function lockFile(fd: number, helper: string): Promise<void> {
	const result = await new Promise<number | null>((resolve, reject) => {
		const child = spawn(helper, ['lock'], { stdio: ['ignore', 'ignore', 'ignore', fd], timeout: 2_000 });
		child.once('error', reject);
		child.once('close', resolve);
	});
	if (result === LOCK_BUSY_EXIT) busy();
	if (result !== 0) conflict('installation arbitration lock is unavailable');
}

async function ownerGone(owner: DarwinIncarnation, helper: string): Promise<boolean> {
	try {
		const current = await readDarwinIncarnation(owner.pid, helper);
		// A changed executable with the same birth marker can be an exec, not a death.
		return current.startedAt !== owner.startedAt;
	} catch {
		// Signal 0 observes existence only. Permission errors and failed reads stay fenced.
		try { process.kill(owner.pid, 0); }
		catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
		return false;
	}
}

async function assertLiveOwner(owner: DarwinIncarnation, helper: string): Promise<void> {
	if (!validOwner(owner)) conflict('invalid installation owner');
	const current = await readDarwinIncarnation(owner.pid, helper).catch(() => undefined);
	if (current === undefined || !matchesDarwinPeer(owner, current, owner)) conflict('installation owner incarnation changed');
}

export class InstallationMutationGate {
	private readonly directory: string;
	private readonly journalPath: string;

	constructor(private readonly root: string, private readonly helper = HELPER) {
		if (!isAbsolute(root)) conflict('installation root must be absolute');
		this.directory = join(root, 'managed-lifecycle');
		this.journalPath = join(this.directory, 'journal.json');
	}

	private async directoryOwner(): Promise<number> {
		const uid = process.getuid?.();
		if (process.platform !== 'darwin' || uid === undefined || uid <= 0) conflict('managed lifecycle requires a macOS user');
		if (await realpath(this.root) !== this.root) conflict('installation root must be canonical');
		try { await mkdir(this.directory, { mode: 0o700 }); }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
		const identity = await lstat(this.directory);
		if (!identity.isDirectory() || identity.uid !== uid || (identity.mode & 0o077) !== 0) {
			conflict('installation journal directory is not private and owned');
		}
		return uid;
	}

	private async readOwned(uid: number): Promise<InstallationJournal> {
		const file = await open(this.journalPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
			.catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
		if (file === undefined) return { version: 1, root: this.root, active: null, outcome: null };
		try {
			const identity = await file.stat();
			if (!identity.isFile() || identity.uid !== uid || identity.nlink !== 1 || (identity.mode & 0o077) !== 0
				|| identity.size > MAX_BYTES) conflict('installation journal is not a bounded private file');
			const bytes = Buffer.alloc(identity.size + 1);
			const { bytesRead } = await file.read(bytes);
			if (bytesRead !== identity.size) conflict('installation journal changed during read');
			return readJournal(bytes.subarray(0, bytesRead).toString('utf8'), this.root, uid);
		} finally { await file.close(); }
	}

	async read(): Promise<InstallationJournal> {
		return this.readOwned(await this.directoryOwner());
	}

	private async write(state: InstallationJournal): Promise<void> {
		const bytes = JSON.stringify(state) + '\n';
		if (Buffer.byteLength(bytes) > MAX_BYTES) conflict('installation journal exceeds its size bound');
		const tmp = join(this.directory, `.journal-${randomUUID()}`);
		const file = await open(tmp, 'wx', 0o600);
		try {
			try { await file.writeFile(bytes); await file.sync(); }
			finally { await file.close(); }
			await rename(tmp, this.journalPath);
			for (const path of [this.directory, this.root]) {
				const dir = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
				try { await dir.sync(); } finally { await dir.close(); }
			}
		} finally { await rm(tmp, { force: true }); }
	}

	private async arbitrate<T>(change: (state: InstallationJournal, uid: number) => Promise<T>): Promise<T> {
		const uid = await this.directoryOwner();
		const path = join(this.directory, 'arbitration.lock');
		const file = await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
		try {
			const identity = await file.stat();
			if (!identity.isFile() || identity.uid !== uid || identity.nlink !== 1 || (identity.mode & 0o077) !== 0) {
				conflict('installation arbitration file is not private and owned');
			}
			await lockFile(file.fd, this.helper);
			const current = await lstat(path);
			if (current.dev !== identity.dev || current.ino !== identity.ino) conflict('installation arbitration file changed');
			return await change(await this.readOwned(uid), uid);
		} finally { await file.close(); }
	}

	async reserve(request: MutationRequest): Promise<MutationReservation> {
		await assertLiveOwner(request.owner, this.helper);
		return this.arbitrate(async (state, uid) => {
			if (state.active !== null) busy();
			if (!validRequest(request) || request.owner.uid !== uid) conflict('invalid installation owner');
			if (request.kind === 'start' && request.activation !== undefined
				&& request.activation.installation.stateRoot !== this.root) conflict('fresh activation names another installation root');
			if (request.kind === 'update' && request.predecessor.launch !== undefined
				&& request.predecessor.pins?.prior.stateRoot !== this.root) conflict('legacy migration names another installation root');
			const active: MutationReservation = { ...request, id: randomUUID(), entries: [] };
			await this.write({ ...state, active });
			return active;
		});
	}

	private admitted(state: InstallationJournal, authority: MutationAuthority): MutationReservation {
		const active = state.active;
		if (active === null || active.id !== authority.id
			|| !matchesDarwinPeer(authority.owner, authority.owner, active.owner)) conflict('installation reservation owner does not match');
		return active;
	}

	private permit(state: InstallationJournal, active: MutationReservation, purpose: MutationPurpose): void {
		const decision = classifyMutationRecovery(state);
		if ((decision === 'uncommitted' && purpose === 'lifecycle')
			|| (decision === 'activate' && purpose === 'activate')
			|| (decision === 'fenced' && purpose === 'reconcile' && active.recovery)) return;
		conflict('installation outcome does not permit this mutation');
	}

	/** Called at the admission boundary for every mutation, including on an already-open socket. */
	async admit(authority: MutationAuthority, purpose: MutationPurpose = 'lifecycle'): Promise<MutationReservation> {
		await assertLiveOwner(authority.owner, this.helper);
		return this.arbitrate(async state => {
			const active = this.admitted(state, authority);
			this.permit(state, active, purpose);
			return active;
		});
	}

	private async append(
		authority: MutationAuthority, step: string, kind: 'intent' | 'receipt', detail: string, purpose: MutationPurpose,
	): Promise<void> {
		if (!text(step) || !text(detail)) conflict('invalid installation journal step');
		await this.arbitrate(async state => {
			const active = this.admitted(state, authority);
			const last = active.entries.at(-1);
			this.permit(state, active, purpose);
			if (kind === 'intent' && ((last !== undefined && last.receipt === undefined)
				|| active.entries.some(entry => entry.step === step) || active.entries.length >= MAX_STEPS)) {
				conflict('installation journal has an unresolved, repeated or excess intent');
			}
			if (kind === 'receipt' && (last?.step !== step || last.receipt !== undefined)) {
				conflict('installation receipt has no matching outstanding intent');
			}
			const entries = kind === 'intent' ? [...active.entries, { step, intent: detail }]
				: [...active.entries.slice(0, -1), { step, intent: last!.intent, receipt: detail }];
			await this.write({ ...state, active: { ...active, entries } });
		});
	}

	recordIntent(authority: MutationAuthority, step: string, detail: string, purpose: MutationPurpose = 'lifecycle'): Promise<void> {
		return this.append(authority, step, 'intent', detail, purpose);
	}

	recordReceipt(authority: MutationAuthority, step: string, evidence: string, purpose: MutationPurpose = 'lifecycle'): Promise<void> {
		return this.append(authority, step, 'receipt', evidence, purpose);
	}

	async publishOutcome(authority: MutationAuthority, decision: UpdateDecision, detail: string): Promise<void> {
		await this.arbitrate(async state => {
			const active = this.admitted(state, authority);
			const last = active.entries.at(-1);
			if (active.kind !== 'update' || !validDecision(decision) || !text(detail)
				|| state.outcome?.id === active.id || (last !== undefined && last.receipt === undefined && decision !== 'operator-recovery')) {
				conflict('installation outcome cannot be published');
			}
			await this.write({ ...state, outcome: { id: active.id, decision, detail, finishedAt: new Date().toISOString() } });
		});
	}

	async release(authority: MutationAuthority): Promise<void> {
		await this.arbitrate(async state => {
			const active = this.admitted(state, authority);
			const last = active.entries.at(-1);
			if ((last !== undefined && last.receipt === undefined) || (active.kind === 'update'
				&& (state.outcome?.id !== active.id || (state.outcome.decision === 'operator-recovery' && !active.recovery)))) {
				conflict('installation reservation has unresolved work');
			}
			await this.write({ ...state, active: null });
		});
	}

	/** A helper whose private launch channel closed may cancel its untouched reservation. */
	async cancelUnstartedUpdate(authority: MutationAuthority): Promise<void> {
		await this.arbitrate(async state => {
			const active = this.admitted(state, authority);
			if (active.kind !== 'update' || active.entries.length !== 0 || state.outcome?.id === active.id) {
				conflict('cannot cancel an update that has started');
			}
			await this.write({ ...state, active: null });
		});
	}

	/** Preserve the acknowledged update ID when replacing preparation with exact release pins. */
	async qualifyUpdate(authority: MutationAuthority, predecessor: UpdatePredecessor): Promise<Extract<MutationReservation, { kind: 'update' }>> {
		await assertLiveOwner(authority.owner, this.helper);
		return this.arbitrate(async state => {
			const active = this.admitted(state, authority);
			this.permit(state, active, 'lifecycle');
			if (active.kind !== 'update' || active.predecessor.preparing !== true || active.entries.length !== 0
				|| predecessor.preparing !== undefined || predecessor.pins?.prior.stateRoot !== this.root
				|| active.predecessor.priorRelease !== predecessor.priorRelease
				|| active.predecessor.wasRunning !== predecessor.wasRunning || active.predecessor.generation !== predecessor.generation
				|| !validRequest({ ...active, predecessor })) conflict('qualified update differs from admitted preparation');
			const qualified = { ...active, predecessor };
			await this.write({ ...state, active: qualified });
			return qualified;
		});
	}

	/** Physical evidence is collected outside the short lock and then bound to the unchanged journal. */
	async claimRecovery(
		id: string,
		newOwner: DarwinIncarnation,
		reconcile: (state: InstallationJournal, decision: Exclude<RecoveryDecision, 'idle'>) => Promise<boolean>,
	): Promise<RecoveryDecision> {
		const snapshot = await this.read();
		const active = snapshot.active;
		const decision = classifyMutationRecovery(snapshot);
		if (active === null || active.id !== id || decision === 'idle' || !await ownerGone(active.owner, this.helper)) {
			conflict('previous installation owner is not verified dead');
		}
		const snapshotBytes = JSON.stringify(snapshot);
		if (!await reconcile(snapshot, decision)) conflict('installation ownership evidence is unresolved');
		await assertLiveOwner(newOwner, this.helper);
		return this.arbitrate(async (current, uid) => {
			if (!validOwner(newOwner) || newOwner.uid !== uid || JSON.stringify(current) !== snapshotBytes) {
				conflict('installation recovery evidence is stale');
			}
			await this.write({ ...current, active: { ...active, owner: newOwner, recovery: true } });
			return decision;
		});
	}
}
