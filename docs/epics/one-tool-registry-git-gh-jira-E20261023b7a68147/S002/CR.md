<!-- insrc:artifact CR-b7a68147dcf72034-s2 -->

# Code review: b7a68147dcf72034:s2

⚠️ **WARN** — HIGH 0 · MED 3 · LOW 6 · model `claude:opus`

**Changed files:** 25

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/tools/__tests__/convert-text.live.test.ts:49 | The live test named 'a deliberately altered output fails the cross-check' does not alter any output. It feeds the unmodified git-log-oneline.txt fixture with a schema whose required `ticket` pattern (^ZZ-[0-9]+$) cannot match the text. It then asserts only `r.ok === false`, so it passes whether the schema check or the cross-check rejects the value. It does not show that a value the model drew from altered text is caught by the key-value cross-check. The LLD's live level also names a deliberately truncated output, and no test covers that case. |
| LOW | src/daemon/tools/convert-text.ts:199 | convertText always returns ConversionFailure kind 'retries-exhausted' when it gives up. The failure kinds 'shape-mismatch' and 'value-not-in-text' are declared but never returned; the last cause appears only as a prefix in the `detail` string. The LLD's convertText error contract says 'shape-mismatch' is returned when no attempt produced a value that fits the schema, and 'value-not-in-text' when a value fits but a key value is missing. Callers cannot tell these causes apart by kind. The LLD's errorCases entry for the cross-check does say 'retries-exhausted with the last detail', so the LLD contradicts itself and the code follows only one side. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/tools/types.ts:146 | The new optional property `readonly outputSchema?: TSchema;` on the `Tool` interface is not declared `\| undefined`. The repo rule under exactOptionalPropertyTypes requires it, and the other optional fields added in this same diff follow it (`failure?: ToolFailure \| undefined`, `conversion?: ConversionProviders \| undefined`, `original?: string \| undefined`, `denial?: ToolDenialReason \| undefined`). It should read `readonly outputSchema?: TSchema \| undefined;`. |
| LOW | src/daemon/tools/convert-text.ts:109 | In the `TierOutcome` failure branch, the optional property `readonly stop?: 'cancelled' \| 'input too large'` is not declared `\| undefined`, which goes against the documented rule for optional properties. This is a module-local type literal, so the practical impact is small. |

## coverage — 0 finding(s)

_No findings._

## quality — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/tools/convert-text.ts:94 | Correctness risk to the serial-queue rule (k3). When the per-attempt deadline fires, boundedCall aborts the controller and rejects with 'timed out' right away, without waiting for the provider call to finish. The retry, and the next queued conversion once release() runs, can then start while the timed-out call is still running. Nothing checks that the provider honours the AbortSignal, and a CLI subprocess that ignores it or is slow to stop leaves two conversions reaching a provider at once, which the module header says never happens. Consider waiting for the aborted call to settle (with a hard cap) before retrying or releasing the slot, or stating the assumption that providers honour the signal. |
| MED | src/daemon/tools/call-tool.ts:31 | Correctness risk: callTool types its result from the definition the caller passes, but executeTool looks up and validates against whatever is registered under tool.id. If the registered tool is a different definition with the same id (registered twice, replaced, or registered without an outputSchema), the data is checked against another schema or not at all. callTool then casts it to Static<T['outputSchema']>, so unchecked data reaches the caller with a trusted type. Consider checking that getTool(tool.id) is the same object as `tool` (or has the same outputSchema), and failing with 'rejected' if not. |
| LOW | src/daemon/tools/executor.ts:69 | The input-schema check runs after the approval gate. For a schematized tool that requires approval, the user is asked to approve a call whose input is then rejected and never run. Running the input check before the gate would avoid prompting for a call that cannot go ahead. |
| LOW | src/daemon/tools/convert-text.ts:188 | A conversion cancelled while it waits in the queue is only noticed after it gets the slot. A caller that aborts can wait for every earlier conversion to finish (up to 4 attempts × 120 s each) before getting 'cancelled'. Consider listening for the abort while waiting for the slot. |
| LOW | src/daemon/tools/call-tool.ts:36 | callTool repeats the executor's 'returned no data for its declared output schema' schema-mismatch failure, with the same message text. The executor already turns a successful result with no data on a schematized tool into a failed result carrying failure, so this branch is mostly unreachable and the two copies can drift apart. |

