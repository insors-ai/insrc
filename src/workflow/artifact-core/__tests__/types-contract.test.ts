import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../types.js';
import type {
	Actor, Artifact, Attachment, ChangeLogEntry, Feedback, Lifecycle, Operation,
	RepoSchema, SidecarRecord, TrackerBinding,
} from '../types.js';

const actor: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const system: Actor = { id: 'insrc:daemon', kind: 'system', name: 'daemon', properties: { v: 1 } };

describe('artifact-core types', () => {
	it('the exported types accept the sc2, sc3, sc4 and sc6 sketches and the stated anchor extension', () => {
		const lifecycle: Lifecycle = {
			status:   'approved',
			revision: { number: 2, contentHash: 'abc', at: '2026-10-20T00:00:00Z', by: actor },
			approval: { revision: 2, by: actor, at: '2026-10-20T00:00:00Z', override: { reason: 'r' } },
			review:   { revision: 2, reviewer: system, party: 'daemon', verdict: 'warn', counts: { high: 0 }, at: 'x',
			            report: { entityId: 'REV-1', type: 'REVIEW', relation: 'reviews' } },
			signoffs: [{ revision: 2, request: { entityId: 'o/r#1', type: 'github:issue', relation: 'tracked-by' },
			             state: 'open', actors: [actor], at: 'x' }],
			stale:    { upstream: { entityId: 'HLD-0123456789abcdef', type: 'HLD', relation: 'derived-from' },
			            upstreamRevision: 1, since: 'x' },
		};
		const binding: TrackerBinding = {
			reference: { entityId: 'o/r#1', type: 'github:issue', relation: 'tracked-by' },
			createdAtRevision: 1,
			posted: [{ kind: 'design', at: 'x', externalId: '9' }],
			pendingLink: { parent: { entityId: 'o/r#2', type: 'github:issue', relation: 'tracked-by' }, childId: 3 },
		};
		const attachment: Attachment = {
			target: { entityId: 'src/a.ts', type: 'code-path', relation: 'documents', fragment: 'L1', quote: 'q' },
			revision: 1, at: 'x',
		};
		const art: Artifact<{ n: number }> = {
			id: 'LLD-0123456789abcdef-s1', description: 'd', references: [], lifecycle, binding,
			attachments: [attachment], payload: { n: 1 },
			parent: { entityId: 'HLD-0123456789abcdef', type: 'HLD', relation: 'derived-from' },
		};
		const op: Operation = 'ack-stale';
		const entry: ChangeLogEntry = {
			id: 'e1', actor, timestamp: 'x', operation: op, revision: { number: 1, contentHash: 'h' },
			status: { from: 'draft', to: 'approved' }, outcome: { result: 'ok', summary: 's', data: 1 },
			references: [], addresses: 'all',
		};
		const fb: Feedback = {
			id: 'f1', text: 't', actor, timestamp: 'x', feedback: [], kind: 'suggestion',
			anchor: { quote: 'q', prefix: 'p', suffix: 's', section: 'sec', lines: [1, 2] },
			revision: 1, source: { system: 'github', externalId: '1', url: 'u' }, batchId: 'b',
		};
		const rec: SidecarRecord<ChangeLogEntry> = { artifactId: art.id, entry };
		const schema: RepoSchema = { version: 1 };

		assert.equal(rec.entry.id, 'e1');
		assert.equal(fb.anchor?.prefix, 'p');
		assert.equal(schema.version, 1);
		assert.equal(art.lifecycle.status, 'approved');
	});

	it('exports only the six error classes at runtime', () => {
		assert.deepEqual(Object.keys(core).sort(), [
			'ArtifactNotFoundError', 'ArtifactShapeError', 'HistoryEntryError',
			'HistoryReadError', 'RepoSchemaError', 'UnknownArtifactKindError',
		]);
		for (const Cls of Object.values(core)) {
			const e = new Cls('m');
			assert.ok(e instanceof Error);
			assert.equal(e.name, Cls.name);
		}
	});
});
