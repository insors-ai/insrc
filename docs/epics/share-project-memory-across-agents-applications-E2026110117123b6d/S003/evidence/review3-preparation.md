# S3 design review round three preparation

Author corrections to the two blockers in [round two](review-round2.json):

- **coverage-of-intent.2 / HIGH:** BroadForgetBarrierV1 defines project,
  source-session and source-conversation targets, their project/epoch authority,
  durable queue identity/cutoff, and closed-lifecycle matching independent of
  known memory IDs. New activity needs a genuinely new host-authorized lifecycle.
  A private pre-inference guard and the final writer check protect unseen pending
  effects. Rejected work receives only a minimal no-effect terminal receipt.
- **change-sites.2 / MED:** AdmittedProvenanceV1 specifies raw producer input,
  trusted policy output and the final payload persisted inside the existing S2
  frame. The module derives exact content/request hashes and validates source
  spans, occurrence-time verification/null handling and deterministic retries.
  Policy callbacks remain the explicit host trust boundary. The new wrapper,
  host/test/README changes and unsupported-host behavior are identified without
  changing public signatures or S2 frame format.

Tests are designed for unseen pending IDs, forget-after-plan races, crash/recycle
recovery, caller-only lifecycle rename attempts, explicitly authorized later
activity, forged metadata, unsupported identity-echo policies, Unicode/span/time
edge cases and real queue admission. These are proposed tests, not execution
evidence for an unbuilt store.

Workflow schemas and git diff --check passed. Regenerated companions were
prepared using the existing artifact-only font repair and rendered locally in
headless Chrome. Both [ER](review3-er.png) and [sequence](review3-sequence.png)
screenshots were inspected. The sequence shows all seven participants and
twenty-three messages. Native crash/platform qualification and later-story
integration gates remain pending. No production implementation or configuration
was changed in this correction.
