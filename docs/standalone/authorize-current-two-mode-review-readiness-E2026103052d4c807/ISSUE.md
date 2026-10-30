<!-- insrc:artifact ISSUE-52d4c807091e0da8 -->

# Authorize current two-mode review readiness

## Reproduction

Both final-source installed modes completed independently replayed qualification on source 9710ca1f7 and are approved as ISSUE-43237626b4cf3368 and ISSUE-6976db3b0ae15f78. Oracle ISSUE-260d7c2e6ea183cc is independently person-approved. Separate source-only and indexed-impact deterministic evaluations retain every case, defect and coverage row. This manifest pins exact revisions and digests for those four records. Evaluation records ISSUE-94bcfc51783b73fd and ISSUE-2a016fecfd2800fd are pending approval when this manifest is authored; approving this manifest alone cannot waive their approvals.

## Root cause

The modes have different scoped catalogs and need different evaluation references. Version 2 binds each mode to its own evaluation while preserving current-source, binary/profile, launch-policy, independent-oracle and canonical-approval checks. Approval permits a bounded normal-admission acceptance run; it does not flip the engine default or assert real review quality, token savings or completion of the pending real review. The already approved AMD-8315a11f29fd2812-1 supplies the code-only predecessor reconciliation. Acceptance uses an already completed real Story; this fix Story's mandatory final code review follows task completion, avoiding a review-before-task-pass cycle.

## Fix intent

{"kind":"review-investigation-readiness","wire":1,"canonical":1,"sourceCommit":"9710ca1f71ab43e0d78aed04a34684dc10465923","sourceDigest":"50962ab9641d34cd7662417d4278928a958df236e21df3bab1189586f537188e","backendRefs":{"source-only":"approved:ISSUE-43237626b4cf3368@1#bd82d02f0a466d395b77627d6a1dba42b0b8da737391ba3d17af8a8fe808ace3","indexed-impact":"approved:ISSUE-6976db3b0ae15f78@1#375dbd16bf6dd910131aaede8000d63de47ffc0aedb73e2bdabf3c8176a2ba52"},"version":2,"evaluationRefs":{"source-only":"approved:ISSUE-94bcfc51783b73fd@1#7b96a8475cba7e37a0c56c4a6dd7cd59dbce1ff47516cdaec44364083429a226","indexed-impact":"approved:ISSUE-2a016fecfd2800fd@1#89b0a46e66a20b4c781d3bd473504db3a0c1c4e5dcd0519634946bc2ec1b7385"}}

## Citations

- **[[c1]]** `prior-artifact` `ISSUE-43237626b4cf3368`
- **[[c2]]** `prior-artifact` `ISSUE-6976db3b0ae15f78`
- **[[c3]]** `prior-artifact` `ISSUE-94bcfc51783b73fd`
- **[[c4]]** `prior-artifact` `ISSUE-2a016fecfd2800fd`
- **[[c5]]** `prior-artifact` `AMD-8315a11f29fd2812-1`
- **[[c6]]** `doc` `docs/review-investigation.md`
