/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The optional Epic impact analysis a later Story's first step carries (ISSUE-1b3caadf04023d33). */
export const epicImpactSchema = {
	type: 'object',
	required: ['applies', 'storiesCovered', 'findings', 'sources'],
	additionalProperties: false,
	properties: {
		applies:        { type: 'boolean' },
		reason:         { type: 'string' },
		storiesCovered: { type: 'array', items: { type: 'string', minLength: 1 } },
		findings:       { type: 'string' },
		sources:        { type: 'array', items: { type: 'string', minLength: 1 } },
	},
} as const;
