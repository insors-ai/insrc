# S005 independent manual review — 2026-11-01

Status: **needs another cycle**. The user authorized a manual workaround and explicitly authorized sending bounded private code batches through the installed Claude CLI. This produced independent inspection and targeted fix verification; full requirements coverage remains unverified. No current canonical CR, BUILD approval or release certification was produced.

The source snapshot is `90404ac88fe6c3f424d9cc80352bf6dac5f49085`, fingerprint `7acdfa3347a3674cd3895ef5116516bae0e25a59eee5302b392420392a524807`. Corrective edits remain in the working tree, identified by SHA256 in `evidence/manual-review/validation.json`, pending resolution of the remaining credential-handling finding. They have not been pushed for daemon/plugin pickup. The daemon was not restarted.

## Method and scope

All 155 attributed changed paths were assigned to 24 source batches. Two additional batches assessed recorded coverage and implementation artifacts; three integration passes adjudicated cross-module findings; two fix-review passes and one final verification completed three manual review rounds. All 32 sessions returned results, with no timeout or omitted assigned obligation entry. Every call was serial, fresh, tool-free, without inherited conversation or MCP tools, through `CliProvider.completeStructured` using configured `sonnet`/`high`. The complete normalized input was capped at 128,000 characters; the largest packet text was 95,733 characters before provider framing. Concrete underlying model version was not captured.

Per-batch results were saved independently, so the workaround preserved progress. Prompt hashes, file assignments and baseline identity are in `evidence/manual-review/manifest.json`; raw independent results are in `evidence/manual-review/results/`. Prompts and the frozen source copy are retained locally at `/tmp/insrc-s5-manual-review`; they are not duplicated into the repository.

Generated inventories and fixture bytes were inventoried and hashed rather than individually reviewed semantically. Generators/consumers were inspected; icon regeneration reproduced the module byte-for-byte, all 24 pinned SVG hashes matched, and the corpus digest matched. Individual SVG rendering, live services and native UI were not newly verified.

**Coverage limit:** all 83 LLD/PLAN obligations received baseline entries, but isolated packets established only 16 partial positive assessments; one failed and 66 remained `could-not-verify`. Focused integration and fix passes do not establish complete end-to-end adherence for those 66 gaps. The baseline ledger preserves these distinctions and is not an approval report.

## Corrections made during the cycle

| Finding | Correction and verification |
|---|---|
| Kotlin endpoint credential/URL handling | Added an authority user-info guard and validation-only path/query quoting. Tests cover underscore/multi-host credentials, escapable query/path values, unchanged returned values, and invalid raw authorities. The final round found additional forms still unsafe; this correction remains incomplete. |
| Ajv validator retention | Replaced the process-wide compiler with weak schema-keyed validator reuse and per-schema compilers. The reproduction grew to 102 retained schemas after 100 renders before the fix; the regression verifies two compile calls per descriptor generation after it. |
| Kotlin draft-test rejection parity | Added strict rejection decoding, fixed code-specific safe messages, release of fresh non-busy reservations, and retention of the original source for busy/uncertain retries. New native tests cover those states and raw-message non-echo. |
| Expired ticket received before mutation | Both clients now end a known-unsent attempt as dismissible `ticket-error`/`ticket-expired`, retain the draft, send zero mutations, and permit a fresh explicit attempt. Expired attempts with uncertain prior delivery remain blocked and never automatically replay. Both clients now describe reload-and-authoritative-inspection recovery; implementation definitions and companions were regenerated. |
| Extension lockfile metadata | Aligned both root version fields with the existing package manifest version `0.5.24`; no dependency versions changed. |

Four earlier candidates were rejected independently with source counterevidence: ordinary daemon failures already become structured rejections; the native lane's 15-second timeout precedes the owner's 16-second backstop; blank replacement widgets with retained Project-memory values are disclosed/tested behavior; and probe listeners publish after an unregistered-root draft is removed. The raw results preserve these adjudications.

## Remaining findings after round 3

1. **MED — special-scheme credential URL acceptance.** Kotlin's literal-`//` authority detection accepts forms such as `https:user:pw@host/`, `https:///user:pw@host`, and backslash forms that TypeScript's WHATWG URL parser interprets as credentials and rejects. A local JDK reproduction of the current Kotlin algorithm and the actual TypeScript decoder confirms the disagreement. This is not a full native-client execution. See `19-final-fix-verification.result.json`, `FinalEndpointCheck.java` and `final-endpoint-reproduction.txt`.
2. **LOW — residual URL compatibility.** A second `#` in a fragment and an NBSP in a query still cause Java URI validation to refuse endpoints TypeScript accepts. The same reproduction confirms those examples. Full WHATWG conformance was not established.
3. **Testing advice.** The reviewer requests an explicit rendered recovery-message parity test. Its stated trigger is future wording drift, so this is advisory rather than a demonstrated current defect. The renderer's `problems` binding exists at its declaration and imports `CONNECTION_PROBLEMS`; the final packet omitted that declaration. The complete Kotlin controller was supplied in earlier integration/fix packets, although the final packet omitted it.

Per AGENTS.md's three-round limit, stop before another review cycle. Resolve these with a shared, explicitly defined URL boundary and cross-language cases; avoid accumulating ad hoc parser patches. Another cycle requires the user's authorization.

## Validation and completion status

- VS Code Connections: **42 pass**, zero fail/skip, after behavioral corrections. Subsequent static recovery-copy changes were checked by source review, both TypeScript checks and extension bundling.
- Shared wire/draft: **7 pass**. Final wire/release checks: **6 pass**.
- Serial native JUnit classes: protocol **6 pass**, draft-test **5 pass**, mutation **7 pass**. These are automated checks; JetBrains live UI remains **deferred-user**.
- Root and extension TypeScript checks and the extension bundle passed. Generated companion source and links were checked; no new visual acceptance is claimed.

An initial concurrent native-wrapper invocation collided in shared instrumentation; serial reruns passed. New mutation regression setup/returned-state failures were corrected before the passing runs. These checks do not replace the historical full sweeps, whose failures/timeouts remain recorded. VS Code live acceptance remains user-reported for **0.5.23**, not a claim for the current correction bytes. SQL Server, provider/service and positive worker-affinity evidence remain pending. Runtime enablement and independent release-audit status are unchanged.

The repaired canonical pipeline still owns formal Story completion. No approval record or review fingerprint was fabricated from this manual evidence.
