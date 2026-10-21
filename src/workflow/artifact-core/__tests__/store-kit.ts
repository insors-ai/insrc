import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ArtifactIds } from '../../artifact-ids.js';
import type { HeadPayload } from '../codecs.js';
import { History } from '../history.js';
import { createMemoryJournal } from '../journal.js';
import type { StagedOperation, WriteJournal } from '../journal.js';
import { createMemorySidecar } from '../sidecar.js';
import type { SidecarFile, SidecarIo } from '../sidecar.js';
import { ArtifactStore } from '../store.js';
import type { ArtifactStoreDeps } from '../store.js';
import type { Actor, Artifact } from '../types.js';
import { emptyLifecycle } from '../decode.js';
import { writeAtomic } from '../../storage.js';

export const H = '0123456789abcdef';
export const alice: Actor = { id: 'github:alice', kind: 'person', properties: {} };
export const bob: Actor = { id: 'github:bob', kind: 'person', properties: {} };

/** A fixed clock that moves one second per call. */
export function clock(): () => Date {
	let t = Date.parse('2026-10-20T12:00:00.000Z');
	return () => new Date((t += 1000));
}

export interface Faults {
	/** Fail the next call of this step once (set to true), or every call while true for `sticky`. */
	stage?:   boolean | undefined;
	append?:  boolean | undefined;
	replace?: boolean | undefined;
	clear?:   boolean | undefined;
}

export interface Kit {
	readonly repo:     string;
	readonly sidecar:  ReturnType<typeof createMemorySidecar>;
	readonly journal:  WriteJournal;
	readonly faults:   Faults;
	readonly store:    ArtifactStore;
	/** A second store over the same repository, journal and sidecar: a restart. */
	restart(over?: Partial<ArtifactStoreDeps>): ArtifactStore;
	done(): void;
}

/** A repository, a memory sidecar and journal, and a store whose steps can be made to fail once. */
export function kit(): Kit {
	const repo = mkdtempSync(join(tmpdir(), 'store-kit-'));
	const sidecar = createMemorySidecar();
	const baseJournal = createMemoryJournal();
	const faults: Faults = {};
	const once = (name: keyof Faults): void => {
		if (faults[name] === true) { faults[name] = false; throw new Error(`injected ${name} failure`); }
	};
	const io: SidecarIo = {
		appendRecord: (file: SidecarFile, record) => { try { once('append'); } catch (e) { return Promise.reject(e); } return sidecar.appendRecord(file, record); },
		readRecords: (file, id) => sidecar.readRecords(file, id),
	};
	const journal: WriteJournal = {
		stage: (id, op: StagedOperation) => { try { once('stage'); } catch (e) { return Promise.reject(e); } return baseJournal.stage(id, op); },
		pending: id => baseJournal.pending(id),
		clear: (id, opId) => { try { once('clear'); } catch (e) { return Promise.reject(e); } return baseJournal.clear(id, opId); },
	};
	const deps: ArtifactStoreDeps = {
		repoPath: repo, history: new History(io), journal, now: clock(),
	};
	const make = (over: Partial<ArtifactStoreDeps> = {}): ArtifactStore => new ArtifactStore({
		...deps, ...over,
		writeHead: over.writeHead ?? ((path: string, bytes: string): void => { once('replace'); writeAtomic(path, bytes); }),
	});
	return { repo, sidecar, journal, faults, store: make(), restart: make, done: () => rmSync(repo, { recursive: true, force: true }) };
}

/** The default body of a test artifact: opaque text, except a TASK and a TASKS head, whose bodies are typed. */
function defaultBody(id: string): Record<string, unknown> {
	const kind = ArtifactIds.parse(id)?.kind;
	if (kind === 'TASK') return { title: 'a task', summary: 'one', size: 'S', order: 1, acceptanceChecks: ['done'], tests: [], planTaskId: 't1' };
	if (kind === 'TASKS') return { planRevision: 1, taskIds: [], nextNumber: 1 };
	return { text: 'one' };
}

export function artifact(id: string, over: Partial<Artifact<HeadPayload>> = {}): Artifact<HeadPayload> {
	return {
		id, description: 'd', references: [], attachments: [], lifecycle: emptyLifecycle(0),
		payload: { body: defaultBody(id), citations: [] },
		...over,
	};
}
