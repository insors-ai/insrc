/** A repository with the durable sidecar and journal (files), and a store whose steps can be made to fail once. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { History } from '../history.js';
import { createFileJournal } from '../journal.js';
import type { WriteJournal } from '../journal.js';
import { FileSidecarStore } from '../sidecar-store.js';
import { ArtifactStore } from '../store.js';
import { writeAtomic } from '../../storage.js';
import { clock } from './store-kit.js';
import type { Faults } from './store-kit.js';

export interface DurableKit {
	readonly repo:    string;
	readonly faults:  Faults;
	readonly journal: WriteJournal;
	readonly sidecar: FileSidecarStore;
	readonly store:   ArtifactStore;
	/** A new store, journal and sidecar over the same directory: a restart of the process. */
	restart(): DurableKit;
	done(): void;
}

function build(repo: string, faults: Faults, now: () => Date): DurableKit {
	const once = (name: keyof Faults): void => {
		if (faults[name] === true) { faults[name] = false; throw new Error(`injected ${name} failure`); }
	};
	const file = new FileSidecarStore(repo);
	const sidecar = {
		appendRecord: <E>(f: 'log' | 'feedback', record: { artifactId: string; entry: E }) => { try { once('append'); } catch (e) { return Promise.reject(e); } return file.appendRecord(f, record); },
		readRecords: <E>(f: 'log' | 'feedback', id: string) => file.readRecords<E>(f, id),
	};
	const base = createFileJournal(repo);
	const journal: WriteJournal = {
		stage: (id, op) => { try { once('stage'); } catch (e) { return Promise.reject(e); } return base.stage(id, op); },
		pending: id => base.pending(id),
		clear: (id, opId) => { try { once('clear'); } catch (e) { return Promise.reject(e); } return base.clear(id, opId); },
	};
	const store = new ArtifactStore({
		repoPath: repo, history: new History(sidecar), journal, now,
		writeHead: (path: string, bytes: string): void => { once('replace'); writeAtomic(path, bytes); },
	});
	return { repo, faults, journal, sidecar: file, store, restart: () => build(repo, faults, now), done: () => rmSync(repo, { recursive: true, force: true }) };
}

export function durableKit(): DurableKit {
	return build(mkdtempSync(join(tmpdir(), 'durable-kit-')), {}, clock());
}
