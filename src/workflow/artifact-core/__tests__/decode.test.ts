import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { codecFor } from '../codecs.js';
import { decodeArtifactHead } from '../decode.js';
import { ArtifactShapeError } from '../types.js';
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
		const okRef = { entityId: 'o/r#1', type: 'github:issue', relation: 'tracked-by' };
		const lc = (extra: object) => ({ status: 'draft', revision: goodRev, signoffs: [], ...extra });
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: lc({ signoffs: [null] }) })), ArtifactShapeError, 'signoffs: [null]');
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: lc({ approval: {} }) })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: lc({ review: { revision: 1 } }) })), ArtifactShapeError);
		const okReview = { revision: 1, reviewer: actor, party: 'daemon', verdict: 'pass', counts: {}, at: 't' };
		for (const [why, review] of [['no party', { ...okReview, party: undefined }], ['unknown party', { ...okReview, party: 'me' }], ['no verdict', { ...okReview, verdict: undefined }], ['no at', { ...okReview, at: undefined }], ['bad report', { ...okReview, report: {} }]] as const) {
			assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: lc({ review }) })), ArtifactShapeError, why);
		}
		assert.equal(decodeArtifactHead(LLD, head({ lifecycle: lc({ review: okReview }) })).artifact.lifecycle.review?.verdict, 'pass');
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: lc({ review: { ...okReview, counts: { high: 'invalid' } } }) })), ArtifactShapeError, 'counts must be numbers');
		assert.equal(decodeArtifactHead(LLD, head({ lifecycle: lc({ review: { ...okReview, counts: { high: 1, med: 0 } } }) })).artifact.lifecycle.review?.counts['high'], 1);
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: lc({ stale: { upstream: okRef, upstreamRevision: 1 } }) })), ArtifactShapeError, 'staleness with no since');
		const withLink = (pendingLink: unknown) => head({ envelope: { binding: { reference: okRef, createdAtRevision: 1, posted: [], pendingLink } } });
		assert.throws(() => decodeArtifactHead(LLD, withLink({})), ArtifactShapeError, 'pendingLink: {}');
		assert.throws(() => decodeArtifactHead(LLD, withLink({ parent: okRef, child: {} })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, withLink({ parent: okRef, childId: 1.5 })), ArtifactShapeError);
		assert.equal(decodeArtifactHead(LLD, withLink({ parent: okRef, child: okRef, childId: 3 })).artifact.binding?.pendingLink?.childId, 3);
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: lc({ approval: { revision: 1, by: { id: 'github:alice' }, at: 't' } }) })), ArtifactShapeError, 'an actor needs kind and properties');
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: lc({ approval: { revision: 1, by: actor, at: 't', override: 'x' } }) })), ArtifactShapeError, 'override is an object with a reason');
		assert.throws(() => decodeArtifactHead(LLD, head({ lifecycle: lc({ stale: { upstream: okRef } }) })), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(LLD, head({ envelope: { binding: { reference: okRef } } })), ArtifactShapeError, 'binding with only a reference');
		assert.throws(() => decodeArtifactHead(LLD, head({ envelope: { attachments: [{ target: okRef }] } })), ArtifactShapeError, 'attachment with only a target');
		assert.equal(decodeArtifactHead(LLD, head({ envelope: { binding: { reference: okRef, createdAtRevision: 1, posted: [{ kind: 'plan', at: 't' }] }, attachments: [{ target: okRef, revision: 1, at: 't' }] } })).artifact.attachments.length, 1);
		// the AMD codec refuses a flat record on its own as well
		assert.throws(() => codecFor('AMD').decode({ id: 'x' } as never), ArtifactShapeError);
		// an id of no known kind is refused, and every kind a Task or Story can have decodes
		assert.throws(() => decodeArtifactHead(`NOPE-${H}-s1`, head({})), InvalidArtifactKeyError);
		assert.deepEqual(decodeArtifactHead(`STORY-${H}-s1`, head({})).artifact.payload.body, { text: 'b' });
		// a TASK and a TASKS body are typed: an opaque body is refused (s7)
		assert.throws(() => decodeArtifactHead(`TASK-${H}-s1-t1`, head({})), ArtifactShapeError);
		assert.throws(() => decodeArtifactHead(`TASKS-${H}-s1`, head({})), ArtifactShapeError);

		// a flat amendment is refused with a pointer to the conversion; a converted one decodes
		const flat = JSON.stringify({ id: `AMD-${H}-1`, status: 'approved', amendment: {} });
		assert.throws(() => decodeArtifactHead(`AMD-${H}-1`, flat), (e: unknown) => e instanceof ArtifactShapeError && /s9 conversion/.test(e.message));
		assert.equal(decodeArtifactHead(`AMD-${H}-1`, head({ workflow: 'design.epic' })).artifact.id, `AMD-${H}-1`);
	});
});
