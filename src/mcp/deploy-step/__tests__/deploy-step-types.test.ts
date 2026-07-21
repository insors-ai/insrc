/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-only fixtures for the s1 sc1/sc2 contracts (t1). They prove the
 * envelopes match the flat interface sketches under strict +
 * exactOptionalPropertyTypes and that the DeploymentContextBundle quartet is
 * structurally independent of AnalyzeContextBundle (never imported here).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
	DeployPhase, DeployStageRegistrar, DeployStepRequest, DeployStepResponse,
	DeploymentCitation, DeploymentContextBundle, DeploymentEntityRef, DeploymentRelationRef,
} from '../types.js';

test('DeployStepProtocol envelope matches the flat a1 interfaceSketch (compiles under strict)', () => {
	const phases: DeployPhase[] = ['start', 'discover', 'reuse', 'topology', 'security', 'scale', 'done'];
	assert.equal(phases.length, 7);

	const req: DeployStepRequest = { phase: 'discover', repo: '/r', focus: 'x' };   // repo/state/focus/payload optional
	const minimalReq: DeployStepRequest = { phase: 'start' };                        // all optionals omitted
	assert.equal(req.phase, 'discover');
	assert.equal(minimalReq.state, undefined);

	const res: DeployStepResponse = { next: 'emit_bundle', guidance: 'g', state: 's' };  // prompt/schema/markdown optional
	const termRes: DeployStepResponse = { next: 'done', guidance: 'g', state: 's', markdown: '# done' };
	assert.equal(res.next, 'emit_bundle');
	assert.equal(termRes.next, 'done');

	let registered = false;
	const registrar: DeployStageRegistrar = { stage: 'topology', register() { registered = true; } };
	registrar.register();
	assert.ok(registered);
	assert.equal(registrar.stage, 'topology');
});

test('DeploymentContextBundle quartet is independent of AnalyzeContextBundle; entityId optional', () => {
	const entity: DeploymentEntityRef = { entityId: 'abc123', kind: 'function', name: 'runStart', path: 'src/daemon/x.ts' };
	const relation: DeploymentRelationRef = { from: 'abc123', to: 'def456', relation: 'DEPENDS_ON' };
	// citation with entityId omitted must compile (optional)
	const looseCite: DeploymentCitation = { path: 'scripts/daemon-ctl.sh', note: 'the install path' };
	const groundedCite: DeploymentCitation = { entityId: 'abc123', path: 'src/daemon/x.ts', note: 'the producer' };

	const bundle: DeploymentContextBundle = {
		stage: 'discover',
		summary: 'single local daemon; no container/orchestration manifests',
		entities: [entity],
		relations: [relation],
		citations: [looseCite, groundedCite],
	};

	assert.equal(bundle.stage, 'discover');
	assert.equal(bundle.citations[0]?.entityId, undefined);   // optional omitted
	assert.equal(bundle.citations[1]?.entityId, 'abc123');
	assert.equal(bundle.entities.length, 1);
});
