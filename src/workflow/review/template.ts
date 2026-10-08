/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Review templates for DESIGN documents (HLD / LLD).
 *
 * A design is reviewed against a FIXED checklist rather than an open "extract
 * every premise" instruction. There are two templates, chosen by what the
 * design answers: an ISSUE (a fix) or a SPEC (a feature or epic). Each names
 * its check items and the most premises the reviewer may examine. The reviewer
 * checks the items ITSELF, against the code and docs; this module only says
 * what to check, builds the prompt, and validates the answer.
 *
 * Nothing here applies to a DEF, an ISSUE or any other non-design artifact:
 * those keep the extract → probe → verify pipeline unchanged.
 */

import { existsSync, readFileSync } from 'node:fs';

import { PATHS } from '../../shared/paths.js';
import { artifactJsonPath } from '../storage.js';
import { severityForOutcome } from './verdict.js';
import type { Finding, FindingOutcome, Severity } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What the design answers. Selects the template. */
export type DesignIntent = 'issue' | 'spec';

/** How large the design's subject is. Selects the review's time limit. */
export type DesignComplexity = 'issue' | 'feature' | 'epic';

export interface ReviewCheckItem {
	readonly id:        string;
	readonly dimension: string;
	/** What the reviewer must establish for this item. */
	readonly check:     string;
}

export interface ReviewTemplate {
	readonly id:          string;
	readonly intent:      DesignIntent;
	/** The most premises (concrete claims) examined across ALL items — a ceiling, not a quota. */
	readonly maxPremises: number;
	readonly items:       readonly ReviewCheckItem[];
}

export interface DesignReviewSettings {
	readonly premises:    { readonly issue: number; readonly spec: number };
	readonly timeLimitMs: { readonly issue: number; readonly feature: number; readonly epic: number };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** No design review may run longer than this, whatever a setting says. */
export const HARD_REVIEW_DEADLINE_MS = 30 * 60_000;

/** Provisional defaults (LLD-f2f08ccf89f8ab25-S001); each is a setting under
 *  `designReview.*` so it can be corrected from real timings without a code change. */
export const DEFAULT_DESIGN_REVIEW_SETTINGS: DesignReviewSettings = Object.freeze({
	premises:    Object.freeze({ issue: 8, spec: 16 }),
	timeLimitMs: Object.freeze({ issue: 12 * 60_000, feature: 18 * 60_000, epic: 24 * 60_000 }),
});

/** Read `designReview.*` from `~/.insrc/config.json`. Fail-safe: a missing file,
 *  an unparseable file, or a value that is not a positive whole number falls
 *  back to that value's default. Never throws. */
export function readDesignReviewSettings(configPath: string = PATHS.config): DesignReviewSettings {
	const d = DEFAULT_DESIGN_REVIEW_SETTINGS;
	let raw: { premises?: Record<string, unknown>; timeLimitMs?: Record<string, unknown> } = {};
	try {
		if (existsSync(configPath)) {
			const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as { designReview?: unknown };
			if (typeof parsed.designReview === 'object' && parsed.designReview !== null) raw = parsed.designReview;
		}
	} catch {
		raw = {};
	}
	const pick = (v: unknown, fallback: number): number =>
		typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : fallback;
	return {
		premises: {
			issue: pick(raw.premises?.['issue'], d.premises.issue),
			spec:  pick(raw.premises?.['spec'], d.premises.spec),
		},
		timeLimitMs: {
			issue:   pick(raw.timeLimitMs?.['issue'], d.timeLimitMs.issue),
			feature: pick(raw.timeLimitMs?.['feature'], d.timeLimitMs.feature),
			epic:    pick(raw.timeLimitMs?.['epic'], d.timeLimitMs.epic),
		},
	};
}

/** The deadline for a WHOLE design review of this complexity. A setting above
 *  the hard cap is reduced to it; the cap cannot be raised. */
export function reviewDeadlineMs(complexity: DesignComplexity, settings: DesignReviewSettings = readDesignReviewSettings()): number {
	return Math.min(settings.timeLimitMs[complexity], HARD_REVIEW_DEADLINE_MS);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const ISSUE_ITEMS: readonly ReviewCheckItem[] = [
	{ id: 'fix-targets-defect',  dimension: 'Fix targets the defect', check: 'The change addresses the root cause the ISSUE states and leaves out nothing from its fix intent.' },
	{ id: 'current-behaviour',   dimension: 'Current behaviour',      check: 'What the design says the code does today is true.' },
	{ id: 'change-sites',        dimension: 'Change sites',           check: 'The functions and files to change exist, and the list is complete (callers, writers).' },
	{ id: 'preserved-behaviour', dimension: 'Preserved behaviour',    check: 'Each invariant the design promises to keep is real, and the change does not break it.' },
	{ id: 'tests',               dimension: 'Tests',                  check: 'Each acceptance criterion has a test that would fail without the fix.' },
];

const SPEC_ITEMS: readonly ReviewCheckItem[] = [
	{ id: 'coverage-of-intent', dimension: 'Coverage of intent',         check: 'Every decision or acceptance criterion upstream is designed, and no non-goal is built.' },
	{ id: 'current-behaviour',  dimension: 'Current behaviour',          check: 'What the design says the code does today is true.' },
	{ id: 'new-versus-reuse',   dimension: 'New versus reuse',           check: 'What is called new does not already exist; what is reused exists with the stated shape.' },
	{ id: 'change-sites',       dimension: 'Contracts and change sites', check: 'Signatures, callers and inventories are complete.' },
	{ id: 'data-compatibility', dimension: 'Data and compatibility',     check: 'Stored shapes, older records and migration are handled.' },
	{ id: 'boundaries',         dimension: 'Boundaries',                 check: 'Nothing owned by another Story or shared contract is redesigned (HLD and Epic stories).' },
	{ id: 'error-paths',        dimension: 'Error paths',                check: 'Each failure is detectable and its handling is stated.' },
	{ id: 'tests',              dimension: 'Tests',                      check: 'Each acceptance criterion maps to a test.' },
];

/** The template for a design of this intent, with its premise threshold taken from settings. */
export function reviewTemplateFor(intent: DesignIntent, settings: DesignReviewSettings = readDesignReviewSettings()): ReviewTemplate {
	return intent === 'issue'
		? { id: 'design-issue', intent, maxPremises: settings.premises.issue, items: ISSUE_ITEMS }
		: { id: 'design-spec',  intent, maxPremises: settings.premises.spec,  items: SPEC_ITEMS };
}

// ---------------------------------------------------------------------------
// Which template + deadline applies to a design
// ---------------------------------------------------------------------------

/** A design document: an HLD (`design.epic`) or an LLD (`design.story`). */
export function isDesignStage(stage: string): boolean {
	return stage === 'design.epic' || stage === 'design.story';
}

export interface DesignReviewPlan {
	readonly intent:     DesignIntent;
	readonly complexity: DesignComplexity;
	readonly template:   ReviewTemplate;
	readonly deadlineMs: number;
}

/**
 * Decide how a design is reviewed, from the artifact store alone:
 *   - an ISSUE artifact for the design's epicHash → it answers a fix;
 *   - a DEF artifact for it                       → it sits under an Epic;
 *   - neither                                     → a standalone feature design.
 * The ISSUE is consulted FIRST; a design with no epicHash is a standalone feature.
 */
export function resolveDesignReview(
	repoPath: string,
	epicHash: string | undefined,
	settings: DesignReviewSettings = readDesignReviewSettings(),
): DesignReviewPlan {
	const has = (prefix: 'ISSUE' | 'DEF'): boolean =>
		epicHash !== undefined && epicHash.length > 0 && existsSync(artifactJsonPath(repoPath, `${prefix}-${epicHash}`));
	const complexity: DesignComplexity = has('ISSUE') ? 'issue' : has('DEF') ? 'epic' : 'feature';
	const intent: DesignIntent = complexity === 'issue' ? 'issue' : 'spec';
	return { intent, complexity, template: reviewTemplateFor(intent, settings), deadlineMs: reviewDeadlineMs(complexity, settings) };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const OUTCOMES: readonly FindingOutcome[] = ['holds', 'does-not-hold', 'could-not-verify'];
const SEVERITIES: readonly Severity[] = ['HIGH', 'MED', 'LOW'];

/**
 * Build the reviewer's prompt. Structural reference trails (CLAUDE.md rule 7):
 * the instructions come first, then the template, and the design LAST.
 */
export function buildTemplateReviewPrompt(
	template: ReviewTemplate,
	artifactMarkdown: string,
	stage: string,
): { system: string; user: string } {
	const system = [
		'You review a design document against a FIXED checklist. You have the repository and its docs:',
		'check each item against the REAL code and docs yourself. Do not judge from the design text alone.',
		'',
		'How to check:',
		'- Read the code a claim rests on. Read as much of a file as the claim needs — a signature, a whole',
		'  function body, every caller — not a single line.',
		'- For drill-down use insrc analyze (`insrc_analyze_step`, or `insrc_analyze`): how a module is built,',
		'  whether a capability already exists, who calls a symbol, whether code follows a documented rule.',
		'- If insrc analyze is unavailable, continue with file reads and search.',
		'',
		'What to report, for every premise (a concrete claim of the design) you examine:',
		'- `holds`            : you checked it and it is true.',
		'- `does-not-hold`    : you checked it and the design is WRONG. Name the file(s) it rests on in `files`,',
		'                       quote what you found in `evidence`, and rate `severity` HIGH when building the',
		'                       design as written would produce broken or wrong code, otherwise MED.',
		'- `could-not-verify` : you could not confirm it. Say in `evidence` what you tried and what was missing.',
		'Never report `does-not-hold` because you did not look, and never report `holds` for something you',
		'did not check. The two problem kinds are different findings; keep them apart.',
		'',
		'Rules of the checklist:',
		`- Answer EVERY check item below, by its \`item\` id, exactly once.`,
		`- Examine at most ${template.maxPremises} premises in total across all items. That is a ceiling, not a quota:`,
		'  pick the premises whose failure would do the most damage, and skip "this file exists" checks.',
		'- An item with nothing to check in this design is answered with `notApplicable` and a reason, and no premises.',
		'- Every other item needs at least one premise.',
	].join('\n');

	const checklist = template.items
		.map((it, i) => `${i + 1}. \`${it.id}\` — ${it.dimension}: ${it.check}`)
		.join('\n');

	const user = [
		`Review the design below against checklist \`${template.id}\`. Emit the answer JSON now.`,
		'',
		`--- CHECKLIST \`${template.id}\` (at most ${template.maxPremises} premises in total) ---`,
		checklist,
		'',
		`--- DESIGN (stage: ${stage}) ---`,
		artifactMarkdown,
	].join('\n');

	return { system, user };
}

/** The shape of a reviewer's answer. The root is a plain object with no union
 *  keyword — both CLIs refuse `oneOf`/`anyOf`/`allOf` at the root. */
export const TEMPLATE_ANSWER_SCHEMA: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	required: ['items'],
	properties: {
		items: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['item', 'premises'],
				properties: {
					item:          { type: 'string', minLength: 1 },
					notApplicable: { type: 'string' },
					premises: {
						type: 'array',
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['premise', 'outcome', 'evidence', 'action'],
							properties: {
								premise:  { type: 'string', minLength: 1 },
								outcome:  { type: 'string', enum: OUTCOMES as unknown as string[] },
								severity: { type: 'string', enum: SEVERITIES as unknown as string[] },
								evidence: { type: 'string', minLength: 1 },
								action:   { type: 'string' },
								files:    { type: 'array', items: { type: 'string' } },
							},
						},
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// Answer validation
// ---------------------------------------------------------------------------

export interface RawTemplatePremise {
	readonly premise?:  unknown;
	readonly outcome?:  unknown;
	readonly severity?: unknown;
	readonly evidence?: unknown;
	readonly action?:   unknown;
	readonly files?:    unknown;
}

export interface RawTemplateItem {
	readonly item?:          unknown;
	readonly notApplicable?: unknown;
	readonly premises?:      unknown;
}

export interface RawTemplateAnswer {
	readonly items?: unknown;
}

export type TemplateAnswerResult =
	| { readonly ok: true;  readonly findings: readonly Finding[] }
	| { readonly ok: false; readonly errors: readonly string[] };

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Check a reviewer's answer against the template and turn it into findings.
 * ONE implementation serves the reviewer session and the controller review
 * tool, so the two can never accept different answers.
 *
 * Rejected: a check item left unanswered, answered twice, or not in the
 * template; an item with neither a premise nor a `notApplicable` reason; more
 * premises than the threshold; an outcome outside the three allowed; a premise
 * that does not hold but names no file; an unverified premise that does not say
 * what was tried.
 */
export function validateTemplateAnswer(template: ReviewTemplate, answer: RawTemplateAnswer | undefined): TemplateAnswerResult {
	const errors: string[] = [];
	const rawItems = Array.isArray(answer?.items) ? (answer.items as readonly RawTemplateItem[]) : undefined;
	if (rawItems === undefined) return { ok: false, errors: ['the answer has no `items` array'] };

	const known = new Map(template.items.map(it => [it.id, it] as const));
	const seen = new Set<string>();
	const findings: Finding[] = [];
	let premiseCount = 0;

	for (const raw of rawItems) {
		const id = text(raw?.item);
		if (!known.has(id)) { errors.push(`\`${id || '(empty)'}\` is not a check item of template \`${template.id}\``); continue; }
		if (seen.has(id)) { errors.push(`check item \`${id}\` is answered more than once`); continue; }
		seen.add(id);

		const premises = Array.isArray(raw.premises) ? (raw.premises as readonly RawTemplatePremise[]) : [];
		const na = text(raw.notApplicable);
		if (premises.length === 0) {
			if (na.length === 0) errors.push(`check item \`${id}\` has no premise and no \`notApplicable\` reason`);
			continue;
		}
		if (na.length > 0) errors.push(`check item \`${id}\` is marked not applicable but also lists premises`);

		premises.forEach((p, n) => {
			premiseCount++;
			const where = `check item \`${id}\`, premise ${n + 1}`;
			const premise = text(p?.premise);
			const evidence = text(p?.evidence);
			const outcome = OUTCOMES.find(o => o === p?.outcome);
			if (premise.length === 0) errors.push(`${where}: the premise is empty`);
			if (outcome === undefined) { errors.push(`${where}: outcome \`${String(p?.outcome)}\` is not one of ${OUTCOMES.join(', ')}`); return; }
			if (evidence.length === 0) {
				errors.push(outcome === 'could-not-verify'
					? `${where}: an unverified premise must say what was tried and what was missing`
					: `${where}: the evidence is empty`);
			}
			const files = Array.isArray(p.files) ? p.files.map(text).filter(f => f.length > 0) : [];
			if (outcome === 'does-not-hold' && files.length === 0) {
				errors.push(`${where}: a premise that does not hold must name the file it rests on`);
			}
			const judged = SEVERITIES.find(s => s === p.severity);
			const action = text(p.action);
			findings.push({
				claimId:    `${id}.${n + 1}`,
				ref:        id,
				item:       id,
				kind:       'semantic',
				severity:   severityForOutcome(outcome, judged),
				premise,
				evidence:   files.length > 0 ? `${evidence} [files: ${files.join(', ')}]` : evidence,
				action:     action.length > 0 ? action : (outcome === 'holds' ? 'None.' : 'Decide how to address this.'),
				fixability: 'manual',
				outcome,
			});
		});
	}

	for (const it of template.items) {
		if (!seen.has(it.id)) errors.push(`check item \`${it.id}\` is not answered`);
	}
	if (premiseCount > template.maxPremises) {
		errors.push(`${premiseCount} premises were examined; template \`${template.id}\` allows at most ${template.maxPremises}`);
	}
	return errors.length > 0 ? { ok: false, errors } : { ok: true, findings };
}
