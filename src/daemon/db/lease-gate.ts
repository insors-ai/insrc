/** Root-local revision and full-use lease state. No session overlay storage. */
import type { ConnectionLease, LeaseState } from '../../shared/connection-management.js';
export class ConnectionUseError extends Error {
	constructor(readonly code: 'busy' | 'conflict' | 'not-found' | 'duplicate-id') {
		super({ busy: 'Connection is currently in use.', conflict: 'Connection revision changed.', 'not-found': 'Connection is unavailable.', 'duplicate-id': 'Connection already exists.' }[code]);
		this.name = 'ConnectionUseError';
	}
}
interface State {
	revision: string;
	exists: boolean;
	active: number;
	barrier: 'none' | 'update' | 'remove';
	waiters: Set<() => void>;
}
export class RevisionLeaseGate {
	readonly #states = new Map<string, State>();
	constructor(readonly root: string) {
	}
	private state(id: string): State {
		let state = this.#states.get(id);
		if (!state) {
			state = { revision: '', exists: false, active: 0, barrier: 'none', waiters: new Set() };
			this.#states.set(id, state);
		}
		return state;
	}
	snapshot(id: string): LeaseState {
		const s = this.state(id);
		return { active: s.active, revision: s.revision, barrier: s.barrier };
	}
	assertAcquirable(id: string): void {
		const s = this.state(id);
		if (!s.exists)
			throw new ConnectionUseError('not-found');
		if (s.barrier !== 'none')
			throw new ConnectionUseError('busy');
	}
	sync(next: ReadonlyMap<string, string>): void {
		for (const [id, s] of this.#states)
			if ((next.get(id) ?? '') !== s.revision && s.active > 0)
				throw new ConnectionUseError('busy');
		for (const [id, s] of this.#states) {
			s.exists = next.has(id);
			if (s.exists)
				s.revision = next.get(id)!;
		}
		for (const [id, revision] of next) {
			const s = this.state(id);
			s.exists = true;
			s.revision = revision;
		}
	}
	lease(id: string): ConnectionLease {
		this.assertAcquirable(id);
		const s = this.state(id);
		s.active++;
		let released = false;
		return { key: { repoRoot: this.root, scope: 'saved', id }, revision: s.revision, release: async () => {
				if (released)
					return;
				released = true;
				s.active--;
				if (s.active === 0) {
					for (const done of s.waiters)
						done();
					s.waiters.clear();
				}
			} };
	}
	beginMutation(id: string, mode: 'create' | 'update' | 'remove', expectedRevision?: string): () => void {
		const s = this.state(id);
		if (mode === 'create' && s.exists)
			throw new ConnectionUseError('duplicate-id');
		if (mode !== 'create' && !s.exists)
			throw new ConnectionUseError('not-found');
		if (mode !== 'create' && s.revision !== expectedRevision)
			throw new ConnectionUseError('conflict');
		if (s.active > 0 || s.barrier !== 'none')
			throw new ConnectionUseError('busy');
		s.barrier = mode === 'remove' ? 'remove' : 'update';
		let released = false;
		return () => {
			if (released)
				return;
			released = true;
			s.barrier = 'none';
		};
	}
	async idle(id: string): Promise<void> {
		const s = this.state(id);
		if (s.active === 0)
			return;
		await new Promise<void>(resolve => s.waiters.add(resolve));
	}
}
