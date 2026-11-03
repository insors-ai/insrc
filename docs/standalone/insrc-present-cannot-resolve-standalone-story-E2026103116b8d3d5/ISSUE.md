<!-- insrc:artifact ISSUE-16b8d3d50f14fc1d -->

# insrc_present cannot resolve a standalone Story's BUILD record (no CR sibling exists to satisfy the pending-list gate)

## Reproduction

Build a standalone (triage-routed small/trivial, no-epic) Story through insrc_build_step to the point where its validate phase has written .insrc/artifacts/BUILD-<hash>-<story>.json and docs/standalone/<slug>/<story>/BUILD.md (confirmed reproduced 2026-10-31 with BUILD-7b6a5fa936278e5d-S001, both files present on disk). Call insrc_present({ documents: ["BUILD-<hash>-<story>"] }). Observed: the answer is always {"presented":[],"notPending":["BUILD-<hash>-<story>"]}, every time, for every standalone BUILD record attempted across multiple sessions -- the chat review pane never opens it, so the BUILD summary has to be relayed as plain chat text before asking the user to approve. Expected: a standalone BUILD record is presentable the same way a tracked epic's BUILD record is (once its Story's code review, when one runs, is accounted for) -- the user should be able to review the actual document before approving, not just a chat-relayed summary.

## Root cause

insrc_present (handleInsrcPresent, src/mcp/server.ts:1197-1227) calls pendingWorkflow (src/mcp/daemon-stream.ts:311-316), which forwards to the daemon's workflow.pending IPC and ultimately to listPendingArtifacts (src/workflow/pending.ts:108-141). That function scans .insrc/artifacts directly, but for kind === 'BUILD' it has an extra precondition no other PENDING_KINDS member has: `if (kind === 'BUILD' && !names.has(`CR${file.slice('BUILD'.length)}`)) continue;` (src/workflow/pending.ts:123) -- a BUILD record is only added to the pending set if a sibling CR-<hash>-<story>.json artifact also exists in the same directory, per the module's own documented design for the tracked-epic reviewer-approval-panel flow (src/workflow/pending.ts:36-40, 120-122: "A BUILD record is listed once its Story's code review has run"). A standalone, triage-routed Story's build goes through insrc_build_step's validate phase and the project's standing manual-code-review-only process (the automated insrc_code_review_step / CR-artifact path is not run for it), so no CR-<hash>-<story>.json file is ever written alongside its BUILD record. The BUILD artifact is therefore filtered out at pending.ts:123 before reaching toDescriptor (pending.ts:143-165) or buildRecordMdPath (pending.ts:178-195) -- it never enters the `openable` set handleInsrcPresent filters to (server.ts:1218-1221), so namesPending (server.ts:1190-1193) can never match it and insrc_present reports notPending regardless of whether the BUILD's own .json/.md files genuinely exist. LLD/DEF/HLD/SPEC/PLAN/ISSUE in the same PENDING_KINDS list (pending.ts:41) hit no analogous sibling-artifact precondition -- they resolve via the generic deriveMdPath from their own meta alone (pending.ts:159) -- which is why insrc_present already worked for this same standalone Story's own LLD-7b6a5fa936278e5d-S001 but not for its BUILD-7b6a5fa936278e5d-S001.

## Fix intent

Let a standalone Story's BUILD record enter the pending set (and resolve its .md path) without requiring a sibling CR artifact, while leaving the existing CR-sibling gate intact for tracked-epic BUILD records where it correctly reflects 'approval is the Story's completion, gated on its code review having run' (pending.ts:36-40). The distinguishing signal already exists in the artifact's own meta (meta.standalone, written by every standalone BUILD record this session's workflow produces) -- the fix narrows pending.ts:123's CR-sibling requirement to apply only when the BUILD artifact's own meta does not mark it standalone, so a standalone BUILD resolves through the same deriveMdPath + marker-check path buildRecordMdPath already uses (pending.ts:178-195), and insrc_present can present it for review before the user approves.

## Citations

- **[[c1]]** `code` `src/mcp/server.ts:1197-1227`
- **[[c2]]** `code` `src/mcp/daemon-stream.ts:311-316`
- **[[c3]]** `code` `src/workflow/pending.ts:108-141`
- **[[c4]]** `code` `src/workflow/pending.ts:123`
- **[[c5]]** `code` `src/workflow/pending.ts:36-41`
- **[[c6]]** `code` `src/workflow/pending.ts:143-165`
- **[[c7]]** `code` `src/workflow/pending.ts:178-195`
- **[[c8]]** `code` `src/mcp/server.ts:1190-1193`
