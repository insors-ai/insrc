/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EvidenceProvider, EvidenceProviderInput, EvidenceProviderOutput, EvidenceProviderRegistry } from '../evidence-provider.js';
import type { SecurityEvidence } from '../security-finding.js';
import type { SecurityLocator } from '../security-locator.js';
import type { ReviewTargets } from '../../artifact-core/types.js';

describe('EvidenceProvider and SecurityEvidence', () => {
	it('SecurityEvidence shape (providerCategory + optional SecurityLocator)', () => {
		const locator: SecurityLocator = { kind: 'symbol', value: 'src/foo.ts#bar', trustBoundaryId: 'tb-1' };
		const withLocator: SecurityEvidence = { providerCategory: 'secret-scan', locator };
		assert.equal(withLocator.providerCategory, 'secret-scan');
		assert.equal(withLocator.locator, locator);

		const withoutLocator: SecurityEvidence = { providerCategory: 'sast' };
		assert.equal(withoutLocator.providerCategory, 'sast');
		assert.equal(withoutLocator.locator, undefined);
	});

	it('EvidenceProvider interface defines a common input/output contract shared by all five provider categories', async () => {
		const categories: readonly EvidenceProviderInput['category'][] = ['secret-scan', 'sast', 'dependency-sbom', 'iac-container', 'language-native'];
		const targets = {} as ReviewTargets;

		const providers: readonly EvidenceProvider[] = categories.map((category) => ({
			category,
			run: async (input: EvidenceProviderInput): Promise<EvidenceProviderOutput> => {
				assert.equal(input.category, category, 'every provider must receive the same input shape, keyed by its own category');
				assert.equal(input.targets, targets);
				return { evidence: [{ providerCategory: category }] };
			},
		}));

		const registry: EvidenceProviderRegistry = new Map(providers.map((p) => [p.category, p]));
		for (const category of categories) {
			const provider = registry.get(category);
			assert.ok(provider, `a provider for ${category} must be registered`);
			const output = await provider.run({ category, targets });
			assert.deepEqual(output, { evidence: [{ providerCategory: category }] });
		}
	});
});
