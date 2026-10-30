# Review engine implementation rolled back

On 2026-10-30 the user authorized a complete rollback of this engine before any redesign.

The executable changes introduced from `50ae942af` through `19de0842d`, including S1–S7, native isolation/qualification prerequisites and activation machinery, are reversed to the source baseline at `fbc1cfa1a`. The earlier legacy review engine and its existing budget/timing fixes remain. No replacement engine is introduced.

Two independent test maintenance corrections are retained: legacy timeout assertions matching the existing five-minute policy, and the TypeScript worker-loader bootstrap. They do not expose investigation execution.

The implementation is archived locally at `archive/review-engine-before-rollback-20261030`. Original workflow artifacts, approvals, reviews and failed acceptance results remain historical and are not rewritten as successful or enabled. S7 Task 2 did not pass, and subsequent S7 Tasks were not started. This rollback supersedes implementation/activation instructions in the retained epic and prerequisite documents; prior approvals do not authorize restarting the abandoned implementation.

Private run journals and qualification files are retained without an execution or resume route. The existing runtime ignore rule remains so historical journals do not enter source control. Old investigation configuration keys, if present on disk, have no catalog entry or consuming engine after deployment.

Deployment requires updating and restarting the installed daemon. Existing processes are not changed by a source checkout. Use a clean build output directory when deploying to remove orphaned JavaScript files, since TypeScript compilation does not delete outputs for removed source files. Unrelated local edits and documents are preserved.
