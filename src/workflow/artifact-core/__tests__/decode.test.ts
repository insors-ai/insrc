import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { codecFor } from '../codecs.js';
import { decodeArtifactHead } from '../decode.js';
import { ArtifactShapeError, UnknownArtifactKindError } from '../types.js';
import { InvalidArtifactKeyError } from '../../artifact-ids.js';

const H = '0123456789abcdef';
const LLD = `LLD-${H}-s1`;
const actor = { id: 'github:alice', kind: 'person', properties: {} };
const head = (meta: object, body: object = { text: 'b' }, citations: unknown[] = [{ id: 'c1' }]): string =>
	JSON.stringify({ meta: { workflow: 'design.story', ...meta }, body, citations });

describe('decodeArtifactHead', () => {
	it('decodeArtifactHead fills every envelope part, returns empty parts for a head without them, and refuses a malformed head, an unknown kind and a flat amendment', () => {
		// a head with every envelope part
		const parent = { entityId: `HLD-${H}`, type: 'HLD', relation: 'derived-from' };
		const ref = { entityId: 'o/r#1', type: 'github:issue', relation: 'tracked-by' };
		const lifecycle = { status: 'approved', revision: { number: 3, contentHash: 'h', at: 't', by: actor }, signoffs: [] };
		const binding = { reference: ref, createdAtRevision: 1, posted: [] };
		const attachment = { target: ref, revision: 1, at: 't' };
		const full = decodeArtifactHead(LLD, head({
			revision: 3, lifecycle,
			envelope: { description: 'd', parent, references: [ref], binding, attachments: [attachment] },
		}));
		assert.equal(full.artifact.id, LLD);
		assert.equal(full.artifact.description, 'd');
		assert.deepEqual(full.artifact.parent, parent);
		assert.deepEqual(full.artifact.references, [ref]);
		assert.deepEqual(full.artifact.lifecycle, lifecycle);
		assert.deepEqual(full.artifact.binding, binding);
		assert.deepEqual(full.artifact.attachments, [attachment]);
		assert.deepEqual(full.artifact.payload, { body: { text: 'b' }, citations: [{ id: 'c1' }] });
		assert.equal(full.head.meta['revision'], 3);

		// a head with no envelope parts: empty parts, revision from meta.revision
		const bare = decodeArtifactHead(LLD, head({ revision: 4 })).artifact;
		assert.equal(bare.description, '');
		assert.equal(bare.parent, undefined);
		assert.deepEqual(bare.references, []);
		assert.deepEqual(bare.attachments, []);
		assert.equal(bare.binding, undefined);
		assert.equal(bare.lifecycle.status, 'draft');
		assert.equal(bare.lifecycle.revision.number, 4);
		assert.deepEqual(bare.lifecycle.signoffs, []);
		assert.equal(bare.lifecycle.approval, undefined);
		assert.equal(bare.lifecycle.stale, undefined);
		assert.equal(decodeArtifactHead(LLD, head({})).artifact.lifecycle.revision.number, 0, 'no revision reads as 0');
		assert.deepEqual(decodeArtifactHead(LLD, JSON.stringify({ meta: {}, body: {} })).artifact.payload.citations, [], 'missing citations read as empty');

		// refusals
		assert.throws(() => decodeArtifactHead('LLD-ABC-S1', head({})), InvalidArtifactKeyError);
		assert.throws(() => decodeArtifactHead(`LLD-${H}-S001`, head({})), InvalidArtifactKeyError);
		assert.throws(() => decodeArtifactHead(LLD, '{not json'), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, JSON.stringify([1])), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, JSON.stringify({ meta: {}, body: 'x' })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ envelope: 'x' })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ envelope: { references: 'x' } })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: { status: 'draft' } })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, JSON.stringify({ meta: {}, body: {}, citations: 'invalid' })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: { status: 'invalid', revision: {} } })), ArtifactShapeError);
		const goodRev = { number: 1, contentHash: 'h', at: 't', by: actor };
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: { status: 'draft', revision: goodRev } })), ArtifactShapeError, 'no signoffs list');
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: { status: 'draft', revision: { ...goodRev, number: 1.5 }, signoffs: [] } })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ envelope: { references: [{ entityId: 'x' }] } })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ envelope: { attachments: [{}] } })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ envelope: { parent: 'x' } })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ envelope: { binding: {} } })), ArtifactShapeError);
		// the AMD codec refuses a flat record on its own as well
		assert.throws(() => codecFor('AMD').decode({ id: 'x' } as never), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(`TASK-${H}-s1-t1`, head({})), UnknownArtifactKindError);
		assert.throws(() => decodeArtifactHead(`STORY-${H}-s1`, head({})), UnknownArtifactKindError);

		// a flat amendment is refused with a pointer to the conversion; a converted one decodes
		const flat = JSON.stringify({ id: `AMD-${H}-1`, status: 'approved', amendment: {} });
		assert.throws(() => decodeArtifactHead(`AMD-${H}-1`, flat), (e: unknown) => e instanceof ArtifactShapeError && /s9 conversion/.test(e.message));
		assert.equal(decodeArtifactHead(`AMD-${H}-1`, head({ workflow: 'design.epic' })).artifact.id, `AMD-${H}-1`);
	});
});
