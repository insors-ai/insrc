<!-- insrc:artifact SPEC-16f49beb846e02b4 -->

# Spec: Replace the removed DEF/HLD/LLD design-review engine with background, independent, read-only reviews of latest artifacts.

**Category:** design

## Intent

Replace the removed DEF/HLD/LLD design-review engine with background, independent, read-only reviews of latest artifacts. Confirmed by user: replace removed design-review framework from blank slate. Prompt contains guidelines and artifact paths, not copied artifact content; reviewer may inspect any codebase content. Latest artifact, no commit pinning. Artifact change mid-review stops/invalidates attempt; controller notifies user and obtains approval before fresh full restart. External changes ignored for invalidation. Background execution and polling. Reviewer plans coherent chunks: DEF capability/requirements/stories/constraints/acceptance together plus cross-chunk consistency; HLD subsystem/contracts/ownership/dependencies/interactions plus system integration; LLD implementation responsibility/interfaces/logic/errors/test coverage plus story/HLD end-to-end check. Completed chunks checkpointed, feedback visible immediately, controller no intermediate corrective action before full review. Continue all chunks despite findings. Technical failures get at most three automatic retries of only failed chunk; after exhaustion pause for user input, preserve completed chunks. No fixed deadline; 30-minute inactivity grace with active tools separately tracked. Subsequent corrected attempts analyze direct and implicit impact, review affected chunks, expand full artifact if scope uncertain; previous review history available. Read-only reviewer. HIGH/MED block, LOW allows approval. Independent party routing daemon/controller opposite author, identical guidelines. Checkpoints retained until artifact approval, permanent consolidated review and attempt history preserved before cleanup. Reuse infrastructure relationship NOT decided; do not impose shared engine extraction, legacy compatibility, activation qualification, trust-key or evidence machinery. No implementation yet. User explicitly confirmed all this scope.

## Scope boundary

Design-artifact review only. Working task-based code review remains operational. No replacement implementation is authorized by this specification alone; implementation follows approved epic, designs and build stages. Infrastructure reuse is an implementation design choice, not a confirmed shared-engine extraction requirement. Preserve historical artifacts and normal explicit approval discipline.

## Non-goals

- Embedding artifact content in review prompts
- Commit-pinned design reviews
- Automatic restart after artifact changes
- Reusing completed chunks after a mid-review artifact change
- Restarting because inspected references or source files change
- Holding MCP requests open for review completion
- Fixed review deadlines
- Arbitrary size-only splits
- Intermediate controller corrections
- Stopping remaining chunks because of HIGH/MED findings
- Repeating completed chunks on technical retries
- Continuing automatically after retry exhaustion
- Always repeating the entire review after corrections
- Reviewing only explicitly edited chunks without impact analysis
- Reviewer auto-fixes
- Same-party independent review
- Deleting checkpoints before artifact approval
- Deleting permanent review history
- Restoring removed legacy review engines, flags or compatibility execution paths
- Reworking working code-review semantics
- Token accounting implementation
- Activation-proof, trust-key or native qualification machinery

## Decisions

- **Guidelines and document paths in prompts; no copied artifact content; reviewer can access the entire codebase.** — User explicitly chose document access over prompt copies.
  - Ruled out: _Embedding artifact content in review prompts_
- **Review latest artifact without commit pinning. Artifact changes stop and invalidate the attempt; notify user and obtain explicit approval before restarting the entire review.** — User requires latest designs and approval before repeating work.
  - Ruled out: _Commit-pinned design reviews_, _Automatic restart after artifact changes_, _Reusing completed chunks after a mid-review artifact change_
- **Ignore changes outside the reviewed artifact for restart purposes.** — User wants to prevent restart loops.
  - Ruled out: _Restarting because inspected references or source files change_
- **Background execution with controller polling, no fixed deadline, 30-minute inactivity grace, active tools tracked separately.** — User confirmed code-review-style background operation and inactivity policy.
  - Ruled out: _Holding MCP requests open for review completion_, _Fixed review deadlines_
- **Reviewer plans coherent DEF capability chunks, HLD subsystem chunks and LLD implementation-responsibility chunks; finish with cross-chunk checks.** — User requires explicit artifact-specific chunking guidelines.
  - Ruled out: _Arbitrary size-only splits_
- **Checkpoint completed chunks and expose findings immediately; controller takes no corrective actions until the full review finishes; findings do not stop remaining chunks.** — User wants complete review feedback before changes.
  - Ruled out: _Intermediate controller corrections_, _Stopping remaining chunks because of HIGH/MED findings_
- **For technical failures retry only the failed chunk up to three times automatically; after exhaustion pause for user direction and preserve completed chunks.** — User explicitly specified bounded retries followed by user input.
  - Ruled out: _Repeating completed chunks on technical retries_, _Continuing automatically after retry exhaustion_
- **Subsequent corrected attempts analyze direct and implicit impacts, review affected chunks with previous feedback, and expand to full-artifact review when impact cannot be bounded confidently.** — User requires proper analysis of non-obvious impact.
  - Ruled out: _Always repeating the entire review after corrections_, _Reviewing only explicitly edited chunks without impact analysis_
- **Read-only reviewer, HIGH/MED block approval and LOW permits approval; opposite party reviews author with identical daemon/controller guidelines.** — User confirmed read-only independent reviews and severity policy.
  - Ruled out: _Reviewer auto-fixes_, _Same-party independent review_
- **Keep checkpoints until artifact approval; preserve consolidated review and attempt history permanently before deletion.** — User confirmed durable history and approval-triggered cleanup.
  - Ruled out: _Deleting checkpoints before artifact approval_, _Deleting permanent review history_

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `stakeholder` `Current chat: sequential design-review decisions and final user confirmation` — "confirmed"
- **[[c3]]** `doc` `plans/design-review-redesign.future-work.json`
