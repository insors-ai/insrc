<!-- insrc:artifact ISSUE-748edb69bd23f767 -->

# Honor configurable timeouts in DEF reviews

## Reproduction

Start a daemon review of a controller-authored DEF whose individual model call exceeds ten minutes. Observed on DEF-670419c4ad8bea8e: premise p022 completed on 17 October 2026 at 14:54:29 IST (09:24:29 UTC); the following Codex call was terminated at 15:04:29 IST (09:34:29 UTC), exactly 600 seconds later, with `codex exited with -9`. The daemon recorded `workflow.review: no review recorded`, leaving the earlier review in place. The five-minute MCP connection timeout happened independently and did not stop the daemon. Expected: a supported DEF timeout override reaches the actual CLI subprocess so a call within the configured limit can finish; exceeding that limit remains bounded and reports a timeout clearly. Evidence: [[c1]], [[c2]], [[c5]].

## Root cause

The DEF review handler constructs createRoleRouter({}) without cliTimeoutMs, although RoleRouterDeps already supports that override and forwards it during provider construction. CliProvider therefore uses opts.timeoutMs ?? 600_000. The existing designReview.timeLimitMs settings are selected only for design.epic/design.story (HLD/LLD), so increasing them does not affect this DEF per-claim pipeline. The provider maps a timed-out subprocess to -9, obscuring the limit in the surfaced error. This diagnoses the premature termination; why that particular model call took so long is unknown. Evidence: [[c1]], [[c2]], [[c3]], [[c4]].

## Fix intent

Expose and honor a supported configurable timeout for DEF review model calls through the existing provider override mechanism. Define the setting's units, default, valid range and scope; distinguish it from the whole-review and transport waits. Preserve role-based model routing, HLD/LLD review deadline behavior, bounded subprocess cleanup and existing cancellation semantics. Acceptance: (1) a valid override reaches the actual subprocess; (2) a call longer than the old default but shorter than its configured limit can complete; (3) invalid/missing values have documented safe behavior; (4) exceeding the effective limit reports the timeout and limit without stamping a successful or partial review; (5) deterministic tests use controlled clocks/fake CLI processes rather than a real twenty-minute run. Record this issue only; do not implement or auto-advance it.

## Citations

- **[[c1]]** `code` `src/daemon/workflow-review-rpc.ts:116` — "const router = createRoleRouter({});"
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:162` — "this.timeoutMs = opts.timeoutMs ?? 600_000;"
- **[[c3]]** `code` `src/analyze/context/role-router.ts:177` — "...(deps.cliTimeoutMs !== undefined ? { cliTimeoutMs: deps.cliTimeoutMs } : {}),"
- **[[c4]]** `code` `src/workflow/review/template.ts:142` — "return stage === 'design.epic' || stage === 'design.story';"
- **[[c5]]** `prior-artifact` `.insrc/artifacts/DEF-670419c4ad8bea8e.json` — "The review override records the incomplete re-review caused by the ten-minute subprocess timeout."
