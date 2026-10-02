/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-93081bff91ae5108 / S001 / t2 — BYTE-IDENTITY goldens.
 *
 * Each record below is a VERBATIM copy of a real, committed BUILD record from
 * this repo's own `.insrc/artifacts` tree, and each golden is what that record
 * renders TODAY, captured before the renderer convergence (t8) lands.
 *
 * They are real rather than constructed on purpose. A fixture built from the
 * new understanding of how the renderer *should* behave would agree with the fix
 * by construction and prove nothing; these agree with the fix only if the fix
 * genuinely preserves what already shipped.
 *
 * ---------------------------------------------------------------------------
 * EXPECTATION AT t8 — stated here so a byte movement is never ambiguous:
 *
 *   WELL_FORMED_STANDALONE  MUST NOT change.  Convergence must preserve it.
 *   PLAN_DRIVEN             MUST NOT change.  Convergence must preserve it.
 *   PATHOLOGICAL            IS EXPECTED TO CHANGE. It records a DEFECT.
 *
 * ---------------------------------------------------------------------------
 * Why PATHOLOGICAL records a defect rather than desired behaviour.
 *
 * `BUILD-be8708a9cd20e286-S001.json` is a genuine shipped record: standalone
 * true, NO sizeClass, and a plan-driven `{commit, tasks}` body. Routed by
 * `meta.standalone` to the standalone renderer, it produces markdown that is
 * wrong in three distinct ways, all visible in its golden:
 *
 *   1. the TITLE reads "# Build (standalone undefined)" — a bare template
 *      interpolation of an absent field;
 *   2. the "Size class:" line reads "undefined" for the same reason — so the
 *      word appears TWICE, not once;
 *   3. its real content renders NOWHERE. The record carries `commit: feba6f0`
 *      and SIX passing tasks; the standalone renderer reads neither, and emits
 *      an EMPTY "## Scope" heading because `body.focus` is absent.
 *
 * So t8 changing this golden is the point. When it does, the diff should show
 * the two "undefined"s gone, the commit and the six tasks rendered, and no
 * vacuous empty Scope heading — a reviewed improvement, not drift.
 *
 * NOTE: the record shapes are typed through `as unknown as BuildRecord` because
 * they are copied verbatim from disk, and real records carry keys the declared
 * type does not (PATHOLOGICAL predates nothing in particular — it simply holds a
 * body shape its own `standalone: true` meta implies it should not have). Casting
 * is deliberate: narrowing the fixtures to the declared type would edit the
 * evidence.
 */

import type { BuildRecord } from '../../standalone-record.js';

export const WELL_FORMED_STANDALONE_RECORD = {
 "meta": {
  "workflow": "build",
  "standalone": true,
  "sizeClass": "small",
  "triageRationale": "Scope-aware proven-receiver dataflow (nested shadow + inner class + rebind) — precision fast-follow (2 MED + 1 LOW) from the S001 review; internal-only recognizer hardening in typescript.ts + python.ts, no API/schema change.",
  "epicHash": "1d3bd81c5560de0d",
  "storyId": "S001",
  "createdAt": "2026-08-07T15:23:22.645Z",
  "approvedAt": "2026-08-07T15:37:12.617Z"
 },
 "body": {
  "focus": "MED1 nested-closure shadow (walkForCalls axios proof → per-scope AxiosScope stack via collectScopeFrame/isProvenAxios; nearest declaring scope decides, outer-capture preserved); MED2 inner class in method (save/switch/restore currentClassHttpFields on entering any class node in walkForCalls); LOW Python same-function rebind (collectPyProvenHttpReceivers last-binding-wins). 5 new TS + 2 new Python precision tests; tsc clean; 165 indexer tests pass.",
  "producesLld": true
 }
} as unknown as BuildRecord;

export const WELL_FORMED_STANDALONE_GOLDEN = "# Build (standalone small) — Story S001\n\n**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-08-07T15:23:22.645Z\n\n## Scope\n\nMED1 nested-closure shadow (walkForCalls axios proof → per-scope AxiosScope stack via collectScopeFrame/isProvenAxios; nearest declaring scope decides, outer-capture preserved); MED2 inner class in method (save/switch/restore currentClassHttpFields on entering any class node in walkForCalls); LOW Python same-function rebind (collectPyProvenHttpReceivers last-binding-wins). 5 new TS + 2 new Python precision tests; tsc clean; 165 indexer tests pass.\n\n## Triage rationale\n\nScope-aware proven-receiver dataflow (nested shadow + inner class + rebind) — precision fast-follow (2 MED + 1 LOW) from the S001 review; internal-only recognizer hardening in typescript.ts + python.ts, no API/schema change.\n";

export const PLAN_DRIVEN_RECORD = {
 "meta": {
  "workflow": "build",
  "standalone": false,
  "epicHash": "9b72686c1746af2b",
  "storyId": "s3",
  "createdAt": "2026-09-30T08:04:25.863Z",
  "updatedAt": "2026-09-30T08:04:38.037Z",
  "approvedAt": "2026-09-30T08:04:38.077Z"
 },
 "body": {
  "tasks": [
   {
    "id": "t1",
    "passed": true
   },
   {
    "id": "t2",
    "passed": true
   }
  ],
  "changeLog": [
   {
    "target": {
     "file": "src/mcp/build-step/__tests__/build-step.test.ts"
    },
    "author": "insrc-build",
    "timestamp": "2026-09-30T08:04:38.037Z"
   },
   {
    "target": {
     "file": "src/mcp/build-step/phases/validate.ts"
    },
    "author": "insrc-build",
    "timestamp": "2026-09-30T08:04:38.037Z"
   },
   {
    "target": {
     "file": "src/mcp/build-step/render.ts"
    },
    "author": "insrc-build",
    "timestamp": "2026-09-30T08:04:38.037Z"
   },
   {
    "target": {
     "file": "src/mcp/build-step/types.ts"
    },
    "author": "insrc-build",
    "timestamp": "2026-09-30T08:04:38.037Z"
   },
   {
    "target": {
     "file": "src/workflow/__tests__/diagram-companion-finalize.test.ts"
    },
    "author": "insrc-build",
    "timestamp": "2026-09-30T08:04:38.037Z"
   },
   {
    "target": {
     "file": "src/workflow/orchestrator.ts"
    },
    "author": "insrc-build",
    "timestamp": "2026-09-30T08:04:38.037Z"
   },
   {
    "target": {
     "file": "src/workflow/runners/build/standalone-record.ts"
    },
    "author": "insrc-build",
    "timestamp": "2026-09-30T08:04:38.037Z"
   },
   {
    "target": {
     "file": "vscode-plugin/package.json"
    },
    "author": "insrc-build",
    "timestamp": "2026-09-30T08:04:38.037Z"
   }
  ],
  "summary": "Enriched the BUILD ledger record with an additive optional narrative `summary` (rendered as a `## Summary` omit-slot in renderPlanBuildRecordMd) and wired build-cycle feedback capture through the existing append-only appendFeedback writer. Both additions are omit-slot, so a record carrying neither is byte-identical to the pre-S003 output (k4); persistBuildRecord’s merge and the S002-owned writer are untouched (k5)."
 }
} as unknown as BuildRecord;

export const PLAN_DRIVEN_GOLDEN = "# Build (plan-driven) — Story s3\n\n**Standalone:** no  ·  **Created:** 2026-09-30T08:04:25.863Z  ·  **Updated:** 2026-09-30T08:04:38.037Z\n\n## Summary\n\nEnriched the BUILD ledger record with an additive optional narrative `summary` (rendered as a `## Summary` omit-slot in renderPlanBuildRecordMd) and wired build-cycle feedback capture through the existing append-only appendFeedback writer. Both additions are omit-slot, so a record carrying neither is byte-identical to the pre-S003 output (k4); persistBuildRecord’s merge and the S002-owned writer are untouched (k5).\n\n## Tasks validated\n\n- ✓ `t1`\n- ✓ `t2`\n\n## Changes\n\n- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-09-30T08:04:38.037Z)\n- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-09-30T08:04:38.037Z)\n- `src/mcp/build-step/render.ts` — **insrc-build** (2026-09-30T08:04:38.037Z)\n- `src/mcp/build-step/types.ts` — **insrc-build** (2026-09-30T08:04:38.037Z)\n- `src/workflow/__tests__/diagram-companion-finalize.test.ts` — **insrc-build** (2026-09-30T08:04:38.037Z)\n- `src/workflow/orchestrator.ts` — **insrc-build** (2026-09-30T08:04:38.037Z)\n- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-09-30T08:04:38.037Z)\n- `vscode-plugin/package.json` — **insrc-build** (2026-09-30T08:04:38.037Z)\n";

export const PATHOLOGICAL_RECORD = {
 "meta": {
  "workflow": "build",
  "standalone": true,
  "epicHash": "be8708a9cd20e286",
  "storyId": "S001",
  "createdAt": "2026-09-26T00:00:00.000Z",
  "updatedAt": "2026-09-26T00:00:00.000Z",
  "approvedAt": "2026-09-26T08:43:07.990Z"
 },
 "body": {
  "commit": "feba6f0",
  "tasks": [
   {
    "id": "t1",
    "passed": true
   },
   {
    "id": "t2",
    "passed": true
   },
   {
    "id": "t3",
    "passed": true
   },
   {
    "id": "t4",
    "passed": true
   },
   {
    "id": "t5",
    "passed": true
   },
   {
    "id": "t6",
    "passed": true
   }
  ]
 }
} as unknown as BuildRecord;

/**
 * REPAIRED at t8, and this is the ONE golden that was expected to change.
 *
 * Before (the recorded defect, frozen at t2):
 *   "# Build (standalone undefined) — Story S001\n\n**Size class:** undefined  · …
 *    \n\n## Scope\n\n\n"
 *
 * The reviewed diff repairs exactly the three defects t2 catalogued and nothing
 * else:
 *   1. the title no longer interpolates an absent sizeClass — 'undefined' gone
 *   2. the size-class LINE is omitted rather than printing 'undefined' — the
 *      second occurrence gone, so the word appears nowhere
 *   3. the record's real content now renders: `**Commit:** feba6f0` and its SIX
 *      passing tasks, both previously dropped; and the vacuous empty '## Scope'
 *      heading is gone, because body.focus is genuinely absent and the omit-slot
 *      now honours that
 *
 * `**Updated:**` also appears, which the old standalone renderer never emitted
 * even when the record carried it. That is a gain, not drift: the value was
 * always in the json.
 */
export const PATHOLOGICAL_GOLDEN = "# Build (standalone) \u2014 Story S001\n\n**Standalone:** yes  \u00b7  **Created:** 2026-09-26T00:00:00.000Z  \u00b7  **Updated:** 2026-09-26T00:00:00.000Z\n\n**Commit:** feba6f0\n\n## Tasks validated\n\n- \u2713 `t1`\n- \u2713 `t2`\n- \u2713 `t3`\n- \u2713 `t4`\n- \u2713 `t5`\n- \u2713 `t6`\n";
