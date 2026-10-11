import { recordContentDigest } from '../canonical.js';
import type { GuidanceKind, GuidanceRecord } from '../contracts.js';

/** Original test guidance, not a licensed source import or curated corpus release. */
export function recordFixture(kind: GuidanceKind = 'pattern'): GuidanceRecord {
  return {
    schemaVersion: 1, recordId: 'test:overview', recordVersion: '0'.repeat(64), kind,
    title: 'Preserve reading position', domains: ['Navigation and flows'], guidanceClass: 'heuristic',
    explanation: 'Restore reading position when returning from detail.', rationale: 'Avoid repeated scanning.',
    problem: 'People lose their place after inspecting detail.', tradeoffs: ['Stored position can become stale after filtering.'],
    checks: [], noMeasurableChecksRationale: 'Requires a task-based usability review.', domainPayload: {},
    applicability: { uiTypes: ['web'], suitableConditions: ['Long object lists'], contraindications: [], units: [] },
    examples: [{ kind: 'example', uiType: 'web', contentRef: 'examples/good.json' },
      { kind: 'misuse', uiType: 'web', contentRef: 'examples/bad.json' }], relations: [],
    provenance: { authorship: 'original', author: 'insrc test fixture', sourceRefs: [], modificationNotes: [] },
    review: { status: 'draft', reviewer: '', contentDigest: '', reviewedAt: '' },
  };
}

/** Bind a fixture after intentional edits, without changing its authored content. */
export function sealRecord(record: GuidanceRecord): GuidanceRecord {
  const recordVersion = recordContentDigest(record);
  return { ...record, recordVersion, review: { status: 'reviewed', reviewer: 'Fixture reviewer',
    contentDigest: recordVersion, reviewedAt: '2026-10-11T00:00:00.000Z' } };
}
export const specimenPaths = new Set(['examples/good.json', 'examples/bad.json']);
