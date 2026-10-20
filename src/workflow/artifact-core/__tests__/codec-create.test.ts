import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { codecFor, creationContextProvider, registeredKinds } from '../codecs.js';
import { decodeArtifactHead } from '../decode.js';
import { UnknownArtifactKindError } from '../types.js';
import { ArtifactIds, MissingAnchorError } from '../../artifact-ids.js';
import { workItemAnchorCreatedAt, artifactJsonPath, resolveEpicAnchor } from '../../storage.js';
import { renderDefineMarkdown } from '../../artifacts/define.js';
import type { DefineArtifact } from '../../artifacts/define.js';

const H = '0123456789abcdef';
const NOW = new Date('2026-10-20T12:00:00.000Z');
const body = {
	flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [],
	stories: [{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'g', when: 'w', then: 't', operationalizes: [] }] }],
	openQuestions: [],
};

describe('kind codecs', () => {
	it('a create without a prior head builds identity meta that workItemAnchorCreatedAt and the Define renderer accept', () => {
		const repo = mkdtempSync(join(tmpdir(), 'codec-'));
		try {
			const provider = creationContextProvider(repo, { now: () => NOW, runId: 'run-1', epicSlug: 'a-slug' });

			// a root kind: its own clock is the Epic's
			const defKey = ArtifactIds.parse(`DEF-${H}`)!;
			const def = codecFor('DEF').encode({ body, citations: [] }, defKey, provider(defKey));
			assert.equal(def.meta['workflow'], 'define');
			assert.equal(def.meta['epicHash'], H);
			assert.equal(def.meta['epicSlug'], 'a-slug');
			assert.equal(def.meta['runId'], 'run-1');
			assert.equal(def.meta['repoPath'], repo);
			assert.equal(def.meta['createdAt'], NOW.toISOString());
			assert.equal(def.meta['elapsedMs'], 0);
			assert.equal(def.meta['repoIndexedAt'], null);
			assert.equal(def.meta['schemaVersion'], 1);
			assert.equal(workItemAnchorCreatedAt(def.meta as { epicCreatedAt?: string }), NOW.toISOString());
			const md = renderDefineMarkdown(def as unknown as DefineArtifact);
			assert.equal(md, renderDefineMarkdown({ meta: def.meta, body, citations: [] } as unknown as DefineArtifact), 'the renderer reads the created head');
			assert.ok(md.includes('\n') && md.includes('s1'), 'it renders the story');
			// the encoded head decodes back to the same payload
			const back = decodeArtifactHead(`DEF-${H}`, JSON.stringify(def));
			assert.deepEqual(back.artifact.payload.body, body);

			// a later kind reads the stored anchor and never uses its own clock
			assert.throws(() => provider(ArtifactIds.parse(`LLD-${H}-s1`)!), MissingAnchorError);
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const anchored = { ...def, meta: { ...def.meta, createdAt: '2026-10-01T00:00:00.000Z', epicCreatedAt: '2026-10-01T00:00:00.000Z' } };
			writeFileSync(artifactJsonPath(repo, `DEF-${H}`), JSON.stringify(anchored));
			assert.equal(resolveEpicAnchor(repo, H), '2026-10-01T00:00:00.000Z');
			const lldKey = ArtifactIds.parse(`LLD-${H}-s1`)!;
			const lld = codecFor('LLD').encode({ body: { x: 1 }, citations: [] }, lldKey, provider(lldKey));
			assert.equal(lld.meta['workflow'], 'design.story');
			assert.equal(lld.meta['storyId'], 's1');
			assert.equal(lld.meta['epicCreatedAt'], '2026-10-01T00:00:00.000Z');
			assert.equal(lld.meta['createdAt'], NOW.toISOString());

			// SPEC and ISSUE carry their own run hash, not an epic hash
			const specKey = ArtifactIds.parse('SPEC-89abcdef')!;
			const spec = codecFor('SPEC').encode({ body: {}, citations: [] }, specKey, provider(specKey));
			assert.equal(spec.meta['specHash'], '89abcdef');
			assert.equal(spec.meta['epicHash'], undefined);
			const issueKey = ArtifactIds.parse('ISSUE-89abcdef')!;
			assert.equal(codecFor('ISSUE').encode({ body: {}, citations: [] }, issueKey, provider(issueKey)).meta['issueHash'], '89abcdef');
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});

	it('kinds with no stored head yet have no codec', () => {
		assert.deepEqual([...registeredKinds()].sort(), ['AMD', 'BUILD', 'CR', 'DEF', 'EXT', 'HLD', 'ISSUE', 'LLD', 'PLAN', 'SPEC', 'TESTS']);
		for (const k of ['EPIC', 'STORY', 'TASKS', 'TASK', 'DIAG'] as const) assert.throws(() => codecFor(k), UnknownArtifactKindError);
	});
});
