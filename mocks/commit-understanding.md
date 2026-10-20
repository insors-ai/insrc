# Pre-commit understanding check — VS Code mocks

Open [commit-understanding.html](commit-understanding.html) in a browser. The assessment occupies a VS Code editor tab next to the source file, with Source Control showing whether the pending commit can proceed. This is an interactive UX prototype, not an implemented extension or hook.

## Scenarios

Use the **Scenario** selector above the VS Code window:

- **High · review impact:** daemon classification rationale and entry to the assessment.
- **High · take test:** three questions covering behavior, design intent, and regression coverage. Select an answer and confidence for each, then submit.
- **Guidance · unsure:** selecting Unsure immediately opens a focused walkthrough, even before an answer is selected.
- **Guidance · incorrect answer:** checking an incorrect answer opens the same guided experience, tailored to that question.
- **High · passed:** commit unblocks automatically.
- **High · needs attention:** identifies the understanding gap; retry or explicitly override.
- **High · override:** require a reason and explicit acknowledgment; preview the commit trailers before applying them to the mock commit message.
- **Medium · strict mode:** require completion, but allow a commit regardless of the result. Complete the test with a wrong answer to explore this case.
- **Low · optional:** take the assessment or skip it.
- **Trivial · skipped:** no assessment required.
- **Staged changes updated:** previous results do not silently authorize a different staged snapshot; re-evaluation is required.
- **Project settings:** toggle the Medium completion requirement and High pass requirement in the preview.

The linked work item stays closed throughout. Individual understanding and commit eligibility are distinct from work-item completion. The prototype's Commit buttons only simulate committing; they perform no Git operations.

## Guided understanding

Guidance appears in the same editor pane and keeps the question and any selected answer in context. Three short steps explain the relevant concept, walk through concrete behavior, and connect it to the implementation or design evidence. The user then answers a new example of the same concept to demonstrate understanding.

The original response and confidence are retained for the preview session. Results distinguish understanding demonstrated after guidance from understanding demonstrated without assistance. Merely reading the explanation never counts as passing. A user may continue with a gap recorded; Medium completion remains non-blocking on outcome, while High still requires demonstrated understanding or an explicit recorded override. The walkthroughs and follow-up questions in this mock are authored examples; production guidance should be generated and grounded by the daemon.

## Agreed behavior represented

The pre-commit trigger asks the insrc daemon to classify staged-change impact contextually, using linked work, design, dependencies, and tests. Classification is not based on fixed change-size rules. Trivial changes bypass the check; Low changes offer it; Medium requires completion in strict mode without blocking on outcome; High requires a pass when enabled, or a tracked explicit override when failed/skipped. The immediate UI scope is VS Code.

## Illustrative choices, not finalized contracts

- The impact selector chooses canned scenarios for design review. It is not a product control that lets users self-classify a commit, and the mock does not call a daemon.
- The sample issue, files, source references, identity label, snapshot identifiers, and answers are illustrative. Medium/Low/Trivial rationales are alternate examples, not live analyses of the displayed sample files.
- Passing all three sample questions demonstrates the success state. Production grading criteria, author identity, failure/retry policy, and durable understanding storage require design.
- Trailer names and the required reason/acknowledgment interaction are proposed UI details. The intended requirement is an explicit override tracked in the commit message.
- Disabling the Medium or High requirement makes the assessment optional in this mock. Final policy for disabled gates, unavailable classification, and canceled assessments remains to be specified.
- Controls and progress are local to the open preview and reset on reload. Real source navigation, agent integration, hooks, staged-content verification, and commit-message writes are not implemented.
- The exported page includes its renderer shell; its icon runtime may need internet access.

## Editable source

[commit-understanding.fragment.html](commit-understanding.fragment.html) contains the mock's markup, styles, and interactions. `commit-understanding.html` is the standalone browser preview exported from that fragment. Keep both in sync when updating the mock.
