/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type, type Static, type TProperties } from '@sinclair/typebox';
import { Ajv, type ValidateFunction } from 'ajv';

const object = <T extends TProperties>(properties: T) => Type.Object(properties, { additionalProperties: false });
const text = () => Type.String({ minLength: 1, pattern: '\\S' });
const strings = () => Type.Array(text());
export const CORPUS_DOMAINS = ['Visual style', 'Layout', 'Color', 'Typography', 'Navigation and flows',
  'Components and states', 'Motion and feedback', 'Inclusive design', 'Platform adaptation', 'Content and trust'] as const;
const domain = Type.Union(CORPUS_DOMAINS.map(value => Type.Literal(value)));
export const UI_TYPE_SCHEMA = Type.Union([Type.Literal('web'), Type.Literal('mobile-ios'), Type.Literal('mobile-android')]);
export const GUIDANCE_KIND_SCHEMA = Type.Union([Type.Literal('foundation'), Type.Literal('pattern'), Type.Literal('style-recipe')]);
export const RECORD_ID_SCHEMA = Type.String({ maxLength: 128, pattern: '^[a-z0-9]+(?:[._-][a-z0-9]+)*:[a-z0-9]+(?:[._-][a-z0-9]+)*$' });
export const DIGEST_SCHEMA = Type.String({ pattern: '^[a-f0-9]{64}$' });
export const EVIDENCE_REF_SCHEMA = object({ releaseId: DIGEST_SCHEMA, recordId: RECORD_ID_SCHEMA, recordVersion: DIGEST_SCHEMA });
export const PROVENANCE_SCHEMA = object({
  authorship: Type.Union((['original', 'derived', 'imported', 'inferred'] as const).map(v => Type.Literal(v))),
  author: text(), sourceRefs: strings(), modificationNotes: strings(),
});
export const APPLICABILITY_SCHEMA = object({
  uiTypes: Type.Array(UI_TYPE_SCHEMA, { minItems: 1, uniqueItems: true }),
  suitableConditions: Type.Array(text(), { minItems: 1 }), contraindications: strings(), units: strings(),
});
export const GUIDANCE_RECORD_SCHEMA = object({
  schemaVersion: Type.Literal(1), recordId: RECORD_ID_SCHEMA, recordVersion: DIGEST_SCHEMA,
  title: text(), domains: Type.Array(domain, { minItems: 1, uniqueItems: true }), kind: GUIDANCE_KIND_SCHEMA,
  guidanceClass: Type.Union((['requirement', 'convention', 'heuristic', 'preference'] as const).map(v => Type.Literal(v))),
  explanation: text(), rationale: text(), problem: text(), tradeoffs: Type.Array(text(), { minItems: 1 }),
  checks: Type.Array(object({ check: text(), requiredInputs: strings(), exceptions: strings(), limits: Type.Array(text(), { minItems: 1 }) })),
  noMeasurableChecksRationale: Type.Optional(text()),
  domainPayload: object({
    color: Type.Optional(object({ roles: Type.Array(object({ name: text(), value: text() }), { minItems: 1 }),
      pairings: Type.Array(object({ foregroundRole: text(), backgroundRole: text(), usage: text() }), { minItems: 1 }) })),
    layout: Type.Optional(object({ contentPriority: Type.Array(text(), { minItems: 1 }),
      adaptationRules: Type.Array(object({ condition: text(), rule: text() }), { minItems: 1 }) })),
    style: Type.Optional(object({ composition: text(), typography: text(), color: text(), interaction: text() })),
  }),
  applicability: APPLICABILITY_SCHEMA,
  examples: Type.Array(object({ kind: Type.Union([Type.Literal('example'), Type.Literal('misuse')]), contentRef: text(), uiType: UI_TYPE_SCHEMA })),
  relations: Type.Array(object({ kind: Type.Union((['compatible', 'conflicting', 'prerequisite', 'alternative'] as const).map(v => Type.Literal(v))),
    recordId: RECORD_ID_SCHEMA, recordVersion: DIGEST_SCHEMA })),
  provenance: PROVENANCE_SCHEMA,
  // Empty review metadata is representable only as a draft; admission checks it separately.
  review: object({ status: Type.Union([Type.Literal('draft'), Type.Literal('reviewed')]), reviewer: Type.String(),
    contentDigest: Type.Union([DIGEST_SCHEMA, Type.Literal('')]), reviewedAt: Type.String() }),
});
export const RELEASE_MANIFEST_SCHEMA = object({
  schemaVersion: Type.Literal(1), releaseId: DIGEST_SCHEMA, label: text(), createdAt: text(), maintainer: text(),
  records: Type.Array(object({ recordId: RECORD_ID_SCHEMA, recordVersion: DIGEST_SCHEMA, path: text(), digest: DIGEST_SCHEMA }), { minItems: 1 }),
  files: Type.Array(object({ path: text(), digest: DIGEST_SCHEMA, mediaType: text() }), { minItems: 1 }),
  sourceManifestPath: text(), noticesPath: text(), coveragePath: text(), reviewDigest: DIGEST_SCHEMA,
});
export const ISSUE_CODES = ['schema.unsupported', 'schema.invalid', 'guidance.incomplete', 'provenance.incomplete',
  'domain.invalid', 'review.required', 'review.stale', 'reference.missing', 'reference.cycle', 'path.invalid',
  'inventory.invalid', 'digest.mismatch', 'assessment.missing', 'assessment.failed', 'assessment.stale', 'limit.exceeded'] as const;
export const VALIDATION_ISSUE_SCHEMA = object({ code: Type.Union(ISSUE_CODES.map(v => Type.Literal(v))), path: Type.String(), message: text() });
export const STAGE_ASSESSMENT_SCHEMA = object({
  stage: Type.Union([Type.Literal('eligibility'), Type.Literal('coverage')]), candidateContentDigest: DIGEST_SCHEMA,
  passed: Type.Boolean(), issues: Type.Array(VALIDATION_ISSUE_SCHEMA),
});
export const PUBLICATION_CHECK_SCHEMA = object({ eligible: Type.Boolean(), issues: Type.Array(VALIDATION_ISSUE_SCHEMA),
  manifestDigest: Type.Union([DIGEST_SCHEMA, Type.Literal('')]) });
export const RELEASE_AVAILABILITY_SCHEMA = object({ releaseId: DIGEST_SCHEMA,
  state: Type.Union((['published', 'deprecated', 'withdrawn'] as const).map(v => Type.Literal(v))), reason: Type.Optional(text()),
  catalogGeneration: Type.Integer({ minimum: 0 }) });

export type UiType = Static<typeof UI_TYPE_SCHEMA>;
export type GuidanceKind = Static<typeof GUIDANCE_KIND_SCHEMA>;
export type EvidenceRef = Readonly<Static<typeof EVIDENCE_REF_SCHEMA>>;
export type Provenance = Readonly<Static<typeof PROVENANCE_SCHEMA>>;
export type Applicability = Readonly<Static<typeof APPLICABILITY_SCHEMA>>;
export type GuidanceRecord = Readonly<Static<typeof GUIDANCE_RECORD_SCHEMA>>;
export type ReleaseManifest = Readonly<Static<typeof RELEASE_MANIFEST_SCHEMA>>;
export type ValidationIssue = Readonly<Static<typeof VALIDATION_ISSUE_SCHEMA>>;
export type StageAssessment = Readonly<Static<typeof STAGE_ASSESSMENT_SCHEMA>>;
export type PublicationCheck = Readonly<Static<typeof PUBLICATION_CHECK_SCHEMA>>;
export type ReleaseAvailability = Readonly<Static<typeof RELEASE_AVAILABILITY_SCHEMA>>;
export type ValidationResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const ajv = new Ajv({ allErrors: true, strict: true, useDefaults: false, coerceTypes: false, removeAdditional: false });
const recordValidator = ajv.compile<GuidanceRecord>(GUIDANCE_RECORD_SCHEMA);
const manifestValidator = ajv.compile<ReleaseManifest>(RELEASE_MANIFEST_SCHEMA);
const assessmentValidator = ajv.compile<StageAssessment[]>(Type.Array(STAGE_ASSESSMENT_SCHEMA));
const availabilityValidator = ajv.compile<ReleaseAvailability>(RELEASE_AVAILABILITY_SCHEMA);
const evidenceValidator = ajv.compile<EvidenceRef>(EVIDENCE_REF_SCHEMA);

export function sortIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return [...issues].sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code) || compare(a.message, b.message));
}
function decode<T>(validate: ValidateFunction<T>, value: unknown): ValidationResult<T> {
  if (validate(value)) return { ok: true, value };
  return { ok: false, issues: sortIssues((validate.errors ?? []).map(e => ({
    code: e.instancePath === '/schemaVersion' ? 'schema.unsupported' : 'schema.invalid',
    path: e.instancePath, message: `Schema requirement failed: ${e.keyword}.`,
  }))) };
}
/** Structural validation only. Publication requires the semantic preflight too. */
export const decodeGuidanceRecord = (value: unknown): ValidationResult<GuidanceRecord> => decode(recordValidator, value);
export const decodeReleaseManifest = (value: unknown): ValidationResult<ReleaseManifest> => decode(manifestValidator, value);
export const decodeEvidenceRef = (value: unknown): ValidationResult<EvidenceRef> => decode(evidenceValidator, value);

export const decodeStageAssessments = (value: unknown): ValidationResult<StageAssessment[]> => decode(assessmentValidator, value);

export const decodeReleaseAvailability = (value: unknown): ValidationResult<ReleaseAvailability> => decode(availabilityValidator, value);
