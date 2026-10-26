/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Ajv } from 'ajv';
import { ArtifactIds } from '../artifact-ids.js';
import { canonicalData, UsageInputError } from './canonical.js';
import { ledgerRecordV1Schema } from './schemas.js';
import type { UsageAttributionInput, UsageAttributionPolicy } from './types.js';

const chargedKinds = Object.freeze({
  'definition-author': 'DEF', 'definition-review': 'DEF',
  'epic-design': 'HLD', 'epic-design-review': 'HLD',
  'story-design': 'LLD', 'story-revision': 'LLD', 'design-review': 'LLD',
  'plan-author': 'PLAN', 'plan-refine': 'PLAN',
  'task-implement': 'TASK', 'task-repair': 'TASK', 'task-probe': 'TASK', 'task-validate': 'TASK',
  'shared-validate': 'BUILD', 'code-review': 'BUILD',
  'issue-framing': 'ISSUE', 'spec-framing': 'SPEC', 'workflow-context': null,
});
const id = { type: 'string', minLength: 1, maxLength: 256 };
const shape = new Ajv({ strict: false }).compile<UsageAttributionInput>({
  type: 'object', additionalProperties: false,
  required: ['activity', 'chargedArtifactId', 'subjectArtifactId'],
  properties: {
    activity: { enum: Object.keys(chargedKinds) }, chargedArtifactId: id, subjectArtifactId: id,
    reviewedArtifactId: id, taskId: id, storyBuildId: id, parentBinding: { $ref: '#/$defs/Binding' },
  },
  $defs: ledgerRecordV1Schema.$defs,
});
const designReviews = new Set(['definition-review', 'epic-design-review', 'design-review']);
const referenceKinds = new Set(['CR', 'TASKS', 'TESTS', 'EXT', 'DIAG', 'AMD', 'EPIC', 'STORY']);

/** Canonical IDs are supplied evidence; this policy never resolves or creates roots. */
export function validateAttribution(input: unknown): readonly string[] {
  let raw: unknown;
  try { raw = JSON.parse(canonicalData(input)); }
  catch (error) { return [`${error instanceof UsageInputError && error.code === 'resource-limit' ? 'resource-limit' : 'attribution-invalid'}:/`]; }
  if (!shape(raw)) return [`attribution-invalid:${shape.errors?.[0]?.instancePath || '/'}`];
  const value = raw;
  const charge = ArtifactIds.parse(value.chargedArtifactId), subject = ArtifactIds.parse(value.subjectArtifactId);
  if (!charge || !subject) return ['attribution-invalid:/chargedArtifactId'];
  const notices: string[] = [];
  const kind = chargedKinds[value.activity as keyof typeof chargedKinds];
  if (referenceKinds.has(charge.kind) || (kind !== null && charge.kind !== kind)) notices.push('attribution-invalid:/chargedArtifactId');
  if (value.chargedArtifactId !== value.subjectArtifactId) notices.push('attribution-invalid:/subjectArtifactId');
  if ((designReviews.has(value.activity) || value.reviewedArtifactId !== undefined) && value.reviewedArtifactId !== value.chargedArtifactId) notices.push('attribution-invalid:/reviewedArtifactId');
  // taskId and storyBuildId are canonical artifact IDs, avoiding fuzzy aliases
  // or a guessed hash/story from a display label.
  if (charge.kind === 'TASK' && value.activity !== 'workflow-context' && value.taskId !== value.chargedArtifactId) notices.push('attribution-invalid:/taskId');
  if (value.taskId !== undefined) {
    const task = ArtifactIds.parse(value.taskId);
    if (!task || task.kind !== 'TASK' || task.epicHash !== charge.epicHash || task.story !== charge.story || (charge.kind === 'TASK' && task.task !== charge.task)) notices.push('attribution-invalid:/taskId');
  }
  if (charge.kind === 'BUILD' && value.activity !== 'workflow-context' && value.storyBuildId !== value.chargedArtifactId) notices.push('attribution-invalid:/storyBuildId');
  if (value.storyBuildId !== undefined) {
    const build = ArtifactIds.parse(value.storyBuildId);
    if (!build || build.kind !== 'BUILD' || build.epicHash !== charge.epicHash || build.story !== charge.story) notices.push('attribution-invalid:/storyBuildId');
  }
  if (value.activity === 'workflow-context' && value.parentBinding === undefined) notices.push('binding-unresolved:/parentBinding');
  if (value.parentBinding) {
    const parent = value.parentBinding, root = ArtifactIds.parse(parent.rootArtifactId);
    if (parent.artifactId !== value.chargedArtifactId || !root || !['EPIC', 'STORY', 'ISSUE', 'SPEC'].includes(root.kind)) notices.push('binding-unresolved:/parentBinding');
    // Validate canonical membership where encoded in the root ID itself. ISSUE
    // and SPEC parentage is supplied by the service and cannot be inferred here.
    if (root && (root.kind === 'EPIC' || root.kind === 'STORY') && (root.epicHash !== charge.epicHash || (root.kind === 'STORY' && root.story !== charge.story))) notices.push('binding-unresolved:/parentBinding/rootArtifactId');
  }
  return [...new Set(notices)].sort();
}

export class DefaultUsageAttributionPolicy implements UsageAttributionPolicy {
  validate(input: UsageAttributionInput): readonly string[] { return validateAttribution(input); }
}
