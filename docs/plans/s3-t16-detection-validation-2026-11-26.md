# S3 T16 detection and validation corrections

Task #292 implements approved PLAN revision 3 / LLD revision 6. No new install behavior or target enablement is introduced.

- Linked installation ancestors remain unsupported. Detection reports the offending path and asks for a canonical physical `--home`; S1 control-root rejection and link ownership remain unchanged.
- Production recommendations and terminal fallback share one exact coding CLI advisory. Terminal output deduplicates recommendations. Zero/one/many CLI fixtures assert zero calls to all exported Node subprocess entrypoints, including packaged CLI detection; no installer/authentication/model subprocess is permitted. Terminal consent tests also enforce this boundary.
- Invalid receipt and closure reject `dependency-uncertain`; missing/size/link/mode layout evidence rejects `archive-unsafe`. A working acquisition transport records zero calls, so an accidental redownload cannot satisfy the rejection assertion. Acquisition digest mismatch still fails independently.
- Same-size installed content mutations remain reusable: installed metadata/closure/header admission does not repeat full content hashing. The read sentinel observes promises/callback/sync opens, bounded positional and vectored reads, path/Buffer/URL/fd/FileHandle whole reads, and bounded/unbounded streams. Unit coverage proves both allowed metadata/header operations and rejected full payload reads. Descriptors opened before observation and native-addon I/O are outside this test-local boundary; this is not an OS tracing or confinement claim. Stream and underlying read events can overlap and are not summed as unique physical I/O.
- Redirect tests use a second real local HTTP listener returning a valid version, with zero requests asserted for redirect and non-loopback configuration cases. No DNS failure is used as proof.
- Delayed detection/reconciliation tests release explicit barriers and await actual completion/descriptor close. Preparation waits for immutable disposal publication via filesystem events; its shared-cleanup budget assertion has a 1.5-second scheduling margin rather than 100 ms.

Surrounding canonical Node 22 runs:

- `018ab05f-49b0-4e99-a2a2-4812dcd9d569`: initial detection and service cases passed; new sentinel/terminal assertions and layout-code expectation exposed three fixture mistakes. Corrected the unsupported sync-read overload, terminal newline matching and layout error expectation; this run remains failed.
- `7e95d8a6-75be-4296-adda-2465c2d45f10`: sentinel 1/1, validation 4/4, terminal 10/10 passed.
- `3285dec7-e3af-4e11-bfaa-9ba13897264e`: detection 8/8, catalog 2/2, preparation 5/5 passed. Each run confirmed owned-group closure.

Traceability correction is submitted through registered mappings: remove the transient readiness case from T9's target-policy subject and attach it to T14's retained-service readiness/deadline subject. T9 native observations remain explicitly historical 2026-11-25 evidence; current native requalification belongs to T17. T10's existing terminal test now has actual zero-subprocess assertions; T16 adds zero/one/many terminal advisory coverage.

No full backend suite, host daemon change, host Ollama operation, or new native qualification is claimed here. Final all-installer regression remains T18.
