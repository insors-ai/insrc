<!-- insrc:artifact BUILD-8315a11f29fd2812-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-20T08:14:23.816Z  ·  **Updated:** 2026-10-20T13:05:18.377Z

**Commit:** 55426c36

## Summary

t13 smoke record (BUILD record entry): see docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/t13-smoke-record.txt. The installed daemon runs the new build: checkout 973fc8bd, built 18:26:28 IST; the daemon process (pid 43853, from ~/.insrc/daemon.pid) started 18:26:30 IST running ~/.insrc/daemon/out/daemon/index.js and has not restarted. On that process: an under-limit code review (CR-f431a4420d03374f-s1: 2 changed files, one chunk, verdict pass, daemon, full grounding; daemon log 12:57:11 UTC 'code-review record written') and an under-limit template design review (36,594-character LLD copy against the 384,000-character limit; one session, 169 s, verdict block H1 M1 L10, design-spec; daemon log 13:04:26 UTC 'workflow.review: reviewed'), both in today's result shape. Earlier premise and template smokes on the previous build 99ae70fc are kept as well.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✗ `t11`
- ✓ `t12`
- ✓ `t13`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-f431a4420d03374f-s1.json` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `.insrc/artifacts/CR-f431a4420d03374f-s1.json` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `.insrc/artifacts/ISSUE-f431a4420d03374f.json` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `.insrc/artifacts/TESTS-f431a4420d03374f-s1.json` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `README.md` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/envelope-cli-20261020T171730.txt` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/ollama-20261020T172812.txt` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/smoke-premise-review-installed-daemon.txt` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/smoke-template-review-installed-daemon-973fc8bd.txt` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/smoke-template-review-installed-daemon.txt` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/t13-smoke-record.txt` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/mocks/ontology-editor.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/mocks/ontology-mocks.md` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/mocks/ontology-source/ontology.template.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/mocks/ontology-source/render.mjs` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/mocks/ontology-viewer.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/ontology-builder-prd.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/ontology-builder-prd.md` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/standalone/count-commit-story-s-when-its-E20261020f431a442/ISSUE.md` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/standalone/count-commit-story-s-when-its-E20261020f431a442/S001/BUILD.md` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/standalone/count-commit-story-s-when-its-E20261020f431a442/S001/CR.md` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `docs/standalone/count-commit-story-s-when-its-E20261020f431a442/S001/TESTS.md` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/README.md` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/analyze.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/architecture.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/cli.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/css/tui.css` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/getting-started.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/index.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/insrc-icon-transparent-128.png` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/insrc-icon-transparent.png` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/philosophy.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/plugin.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/settings.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/tools.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/tracker.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/vscode.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `site/workflow.html` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/agent/providers/__tests__/abort-in-flight.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/agent/providers/__tests__/cli-review-session.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/agent/providers/__tests__/internal-retry.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/agent/providers/__tests__/ollama-review-session.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/agent/providers/ollama.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/agent/read-only-tool-loop.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/daemon/__tests__/workflow-review-rpc.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/daemon/steps/review-step/phases/claims.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/daemon/steps/review-step/schema.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/shared/process-group.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/__tests__/spec-review-approve.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/__tests__/review-job.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/__tests__/adherence.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/__tests__/code-review-cwd.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/__tests__/conventions.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/__tests__/functional-coverage.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/__tests__/quality.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/adherence.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/conventions.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/diagram/handlers/er.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/diagram/index.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/diagram/registry.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/functional-coverage.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/quality.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/dimensions/ux/index.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/pack-into-batches.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/review-job.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/__tests__/envelope.live.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/__tests__/enveloped.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/__tests__/review-job-core.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/__tests__/toy-adapter.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/code-review.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/design-review.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/driver.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/envelope.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/job.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/limit.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/pack-into-batches.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/prepare.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review-pipeline/types.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/__tests__/calibration.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/__tests__/review.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/__tests__/same-party-refusal.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/__tests__/source-root-reader.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/__tests__/template-review.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/index.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/review.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/template-review.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/types.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/review/verify.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
- `src/workflow/runners/build/story-commits.ts` — **insrc-build** (2026-10-20T13:05:18.377Z)
