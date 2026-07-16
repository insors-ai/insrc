/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * JSON schemas for the tracker workflows' LLM turns.
 */

// ---------------------------------------------------------------------------
// s2 — push execute output
// ---------------------------------------------------------------------------

export const trackerPushExecuteSchema = {
	type: 'object',
	required: ['epicRef', 'storyRefs', 'labelsCreated'],
	additionalProperties: false,
	properties: {
		epicRef:      { type: 'string', pattern: '^[^/]+/[^#]+#\\d+$' },
		storyRefs: {
			type: 'object',
			additionalProperties: { type: 'string', pattern: '^[^/]+/[^#]+#\\d+$' },
		},
		milestoneRef:  { type: 'string' },
		labelsCreated: { type: 'array', items: { type: 'string', minLength: 1 } },
		// storyId → (taskId → ref). Present only when the push created
		// Task sub-issues (pushTasks enabled + the Story has an approved plan).
		taskRefs: {
			type: 'object',
			additionalProperties: {
				type: 'object',
				additionalProperties: { type: 'string', pattern: '^[^/]+/[^#]+#\\d+$' },
			},
		},
		notes:         { type: 'string' },
	},
} as const;

// ---------------------------------------------------------------------------
// s2 — sync execute output
// ---------------------------------------------------------------------------

export const trackerSyncExecuteSchema = {
	type: 'object',
	required: ['storyStatus', 'epicStatus', 'syncedAt'],
	additionalProperties: false,
	properties: {
		storyStatus: {
			type: 'object',
			additionalProperties: { enum: ['open', 'in-progress', 'blocked', 'closed'] },
		},
		epicStatus: { enum: ['open', 'in-progress', 'blocked', 'closed'] },
		syncedAt:   { type: 'string', minLength: 1 },
		notes:      { type: 'string' },
	},
} as const;

// ---------------------------------------------------------------------------
// s2 — post execute output
// ---------------------------------------------------------------------------

export const trackerPostExecuteSchema = {
	type: 'object',
	required: ['targetKind', 'targetIssue', 'commentId'],
	additionalProperties: false,
	properties: {
		targetKind:  { enum: ['hld', 'lld', 'amendment'] },
		targetIssue: { type: 'string', pattern: '^[^/]+/[^#]+#\\d+$' },
		commentId:   { type: 'string', minLength: 1 },
		commentUrl:  { type: 'string' },
		notes:       { type: 'string' },
	},
} as const;

// ---------------------------------------------------------------------------
// s3 — checklist verify output (shared)
// ---------------------------------------------------------------------------

export const trackerChecklistSchema = {
	type: 'object',
	required: ['items', 'failedCount'],
	additionalProperties: false,
	properties: {
		items: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['itemId', 'verdict'],
				properties: {
					itemId:  { type: 'string', minLength: 1 },
					verdict: { enum: ['passed', 'failed'] },
					notes:   { type: 'string' },
				},
				additionalProperties: false,
			},
		},
		failedCount: { type: 'integer', minimum: 0 },
	},
} as const;

// ---------------------------------------------------------------------------
// s1 — context.assemble output is deterministic — this is the shape
// the LLM should NOT emit; the framework fills it.
// ---------------------------------------------------------------------------

/** One Task to push (fed to the coarse-handoff execute step when
 *  `pushTasks` is enabled and the Story has an approved plan). */
export interface PushTaskInfo {
	readonly id:               string;
	readonly title:            string;
	readonly size:             'S' | 'M' | 'L';
	readonly summary:          string;
	readonly dependsOn:        readonly string[];
	readonly acceptanceChecks: readonly string[];
	readonly tests:            readonly { readonly level: string; readonly name: string }[];
}

export interface PushContext {
	readonly kind: 'push';
	readonly epicHash: string;
	readonly epicSlug: string;
	readonly gh: {
		readonly owner: string; readonly repo: string;
		readonly epicLabel: string; readonly storyLabel: string; readonly taskLabel: string;
		readonly useMilestones: boolean;
		readonly pushTasks: boolean; readonly taskIssueType: string;
	};
	readonly epicTitle: string;
	readonly epicBodyMd: string;
	readonly stories: readonly {
		readonly id:    string;
		readonly title: string;
		readonly bodyMd: string;
	}[];
	/** Per-Story Task breakdowns to push as sub-issues. Present only when
	 *  `gh.pushTasks` is true and the Story has an approved plan. The
	 *  `planDocRel` links the Task issue bodies back to the plan doc. */
	readonly plans?: readonly {
		readonly storyId:    string;
		readonly planDocRel: string;
		readonly tasks:      readonly PushTaskInfo[];
	}[];
	readonly force: boolean;
	readonly existingRefs?: {
		readonly epicRef?:  string;
		readonly storyRefs?: Readonly<Record<string, string>>;
		readonly taskRefs?:  Readonly<Record<string, Readonly<Record<string, string>>>>;
	};
}

export interface SyncContext {
	readonly kind: 'sync';
	readonly epicHash: string;
	readonly epicSlug: string;
	readonly gh: { readonly owner: string; readonly repo: string; readonly epicLabel: string; readonly storyLabel: string; readonly useMilestones: boolean };
	readonly refs: { readonly epicRef: string; readonly storyRefs: Readonly<Record<string, string>>; readonly milestoneRef?: string };
}

export interface PostContext {
	readonly kind: 'post';
	readonly epicHash: string;
	readonly epicSlug: string;
	readonly gh: { readonly owner: string; readonly repo: string; readonly epicLabel: string; readonly storyLabel: string; readonly useMilestones: boolean };
	readonly target: {
		readonly kind:      'hld' | 'lld' | 'amendment';
		readonly issueRef:  string;
		readonly summaryMd: string;
	};
}
