# S005 independent manual review — cycle 2

Status: **scoped corrections closed by independent review; formal Story completion pending**. The user authorized this second cycle and the bounded private-code Claude CLI workaround. All three rounds completed. Round 3 reports no unresolved concrete defects in the supplied correction scope. This is manual evidence, not a canonical CR, BUILD approval or release certification.

The corrections are committed in `244aec78e`, `b0411102b`, `bf5b6728a` and `7a2e67d4e`. The final review inspected source snapshot `7a2e67d4e`. No daemon restart or plugin installation was performed during this cycle.

## Cycle 2 changes and findings

- Replaced platform URL-parser differences with a documented portable boundary and 77 shared vectors. Every vector executes safe read, list, public patch and nested option patch in both languages; accepted text is preserved unchanged. Non-string endpoint fields and opaque/nested SDK prefixes are refused.
- Round 1 confirmed the prior special-scheme and Java URI findings corrected, and found a nested opaque JDBC gap. Round 2 confirmed that direct gap closed, then identified a real producer/client mismatch for unusual saved path characters.
- The producer and TypeScript consumer now share a pure endpoint predicate. Projection marks unsupported endpoints read-only and omits them while retaining stored configuration. This prevents one unusual saved endpoint from invalidating the whole list. Existing producer strict percent/reference checks handle malformed UTF-8 escapes.
- Producer round-trip regressions cover eleven URL driver kinds, unsupported opaque inputs and unsafe saved-path forms. Authoritative mutation regressions verify refusal of nested JDBC/semicolon dialects and credential-bearing NATS/etcd public options. After seeing that code, round 3 rejected the remaining patch-parser candidates as defects under the explicit daemon-owned validation contract.
- Validator retention, native draft-test rejection, known-unsent expiry and recovery-copy corrections from cycle 1 are included in `244aec78e`.

## Bounded review method and evidence

Each round used a fresh serial, tool-free `CliProvider.completeStructured` call through the installed Claude CLI, configured `sonnet`/`high`, with no inherited chat or MCP tools. Complete normalized input was capped at 128,000 characters including supplied context: actual round sizes were 33,023, 39,290 and 63,235 characters. No model version beyond the configured alias was captured. Structured source entities, coordinates, summaries, relations, exact shared vectors and relevant producer counterevidence were supplied instead of a whole-repository dump. Local source packets are retained in `/tmp/insrc-s5-manual-review-cycle2`; input hashes and raw results are preserved in `evidence/manual-review-cycle2/`.

This cycle reviewed correction closure, not all 83 original obligations. The baseline ledger still contains 16 partial positive assessments, one historical failure and 66 `could-not-verify` entries; targeted correction evidence does not silently close those global coverage gaps.

## Validation and limits

The final focused wire/producer/release run passed 18 tests and the root typecheck passed. Earlier in this cycle 42 VS Code Connections tests passed, and serial native corpus/wire/recovery parity passed six Node wrapper tests against 77 endpoint vectors. The post-extraction parity rerun passed all three tests. Current task gates `t1`, `t2`, `t3`, `t10`, `t18`, `t19`, `t23`, `t30` and `t31` passed; unchanged correction gates `t12`, `t13` and `t15` passed earlier in this cycle. Final packaging passed fresh Node22 root/extension checks, bundling and eleven extension runtime/dependency smoke tests, plus JDK21 assemble and native descriptor JUnit. Raw results and source fingerprints are in `evidence/manual-review-cycle2/validation.json`.

An added round-trip test initially assumed the optional editable `readOnly` field was explicitly false; the producer omits it. The assertion was corrected and the complete focused run passed. Earlier transient root typecheck failure in a parallel graph change is preserved alongside the successful retry. Historical full-sweep failures/timeouts remain recorded; no fresh full-sweep success is claimed here.

VS Code live acceptance remains user-reported for 0.5.23, not current correction bytes. JetBrains live UI remains **deferred-user**. SQL Server, provider/service and positive worker-affinity evidence remain pending. Runtime default-on behavior and the independent release-audit hold remain unchanged. No canonical CR or BUILD approval was fabricated. The existing inventory hash for the parallel-stream `vscode-plugin/src/extension.ts` entry point remains stale; both hashes are recorded in the cycle validation record. Owned correction fingerprints match. This cycle does not certify the complete inventory.

The original `evidence/t30/task-validation.json` is retained as a historical tool transcript from before default runtime enablement. Its `producerPolicyModified:false` and old admission-policy statements are superseded; the current inventory records `producerPolicyModified:true`, runtime enabled and independent release audit held. Use `evidence/manual-review-cycle2/final-gate-t30.json` for this cycle’s validation. The generated BUILD checklist was refreshed by the successful gate; historical files were not rewritten as current proof.

The cycle 1 record below is historical; its uncommitted/remaining-finding statements describe that earlier snapshot and are superseded for these scoped corrections by cycle 2.

---

# Cycle 1 historical record — 2026-11-01

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
