<!-- insrc:artifact ISSUE-467db7a3ef5e87a1 -->

# Support ISSUE-anchored bugfix roots in automatic tracker readiness

## Reproduction

With GitHub tracking enabled, approve a standalone sized defect ISSUE and synthesize its Story LLD. Observed on 2026-11-21 for ISSUE-175ab0d1d56838a9 and LLD-175ab0d1d56838a9-s1: LLD was written, but the response reported issueReadiness.status=not-ready, kind=rejected, unit=epic, reason='cannot read the Define: Define artifact not found ... DEF-175ab0d1d56838a9.json'. Its diagnostic explicitly recognizes this as an ISSUE-anchored bugfix with no Define/HLD by design. No GitHub issue was created by that tracker step. Expected: recognize the actual ISSUE root and ensure/link the appropriate tracker issue idempotently, without requiring synthetic upstream documents. [c4]

## Root cause

The automatic draft-readiness path uses generic unit issue creation. In src/workflow/tracker/unit-issue.ts, ensureUnitIssueDetailed unconditionally reads readDefineArtifact before deriving issue content and hierarchy; the catch returns 'cannot read the Define'. This assumes every root is a Define, which conflicts with the valid standalone bugfix route. src/workflow/draft-issues.ts exposes the readiness dispatcher; src/workflow/bugfix/tracker.ts already supplies ISSUE-specific creation/reuse, so the failure is an integration mismatch between existing paths, not an absent GitHub transport. Full downstream parent/Task behavior needs design before implementation. [c1][c2][c3]

## Fix intent

Make automatic tracker readiness resolve the true work-item anchor and honor ISSUE-anchored bugfix roots, reusing appropriate existing tracker creation/binding behavior. Preserve Define-based Epic/feature flows, parent/Story/Task associations, approval/team gates, tracker-disabled and failure outcomes, and duplicate prevention/retry semantics. Add regressions for ISSUE-only root and sized bugfix LLD/plan paths, ordinary Define roots, existing issue reuse and partial tracker failures. Do not fabricate Define/HLD artifacts or weaken gates to hide the error. This record is logging only; implementation remains separate from the Node runtime work. [c1][c2][c3][c4]

## Citations

- **[[c1]]** `code` `src/workflow/tracker/unit-issue.ts`
- **[[c2]]** `code` `src/workflow/draft-issues.ts`
- **[[c3]]** `code` `src/workflow/bugfix/tracker.ts`
- **[[c4]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/LLD.md`
- **[[c5]]** `stakeholder` `User request 2026-11-21: log tracker Define-root failure as a separate issue before approving the Node runtime LLD.`
