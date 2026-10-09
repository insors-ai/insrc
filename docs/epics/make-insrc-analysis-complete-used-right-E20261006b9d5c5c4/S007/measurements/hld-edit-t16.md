# Smoke check: the HLD's wording edit (Story s7, task t16)

Run on 2026-10-09, after the stakeholder approved the amended HLD by override
in chat ("A. Approve by override, with no fresh daemon review").

**What was done.** The HLD was edited in place (commit `ae1b8831`), which
cleared its approval. It was approved with `insrc_workflow_approve` and an
override reason. The designs of Stories s1, s6 and s7 were then acknowledged
against it with `ackStaleArtifact`, and the approved-and-fresh gate
(`requireApprovedHld`, `requireApprovedLld`, `requireApprovedPlan` in
`src/workflow/gates.ts`) was run for each. The rendered `HLD.md` was compared
with `renderHldMarkdown` of the stored data.

**Output of the check, as printed:**

```
acknowledged s1 2026-10-09T09:50:19.980Z
acknowledged s6 2026-10-09T09:50:19.983Z
acknowledged s7 2026-10-09T09:50:19.985Z
HLD approved 2026-10-09T09:49:43.744Z
gate passed s1 LLD approved 2026-10-08T06:37:47.636Z | PLAN approved 2026-10-08T07:07:49.287Z
gate passed s6 LLD approved 2026-10-07T09:01:35.361Z | PLAN approved 2026-10-07T09:23:32.470Z
gate passed s7 LLD approved 2026-10-08T13:54:57.478Z | PLAN approved 2026-10-08T14:32:33.061Z
rendered HLD equals the renderer output for the stored data: true (84753 chars)
  old wording 'set of run ids' in HLD.md: false
  old wording 'set of running ids' in HLD.md: false
  old wording 'three readers' in HLD.md: false
  old wording 'not in that set' in HLD.md: false
  new wording 'count of the runs it is executing per' occurrences: 2
```

**Note on the gate.** A design's freshness is computed from the HLD's run id
and its approved amendments, neither of which an edit in place changes, and
the three designs already carried an acknowledgement from amendment AMD-1. So
the gate would have passed without a new acknowledgement; the acknowledgement
was renewed all the same, with a reason that names this edit, so that the
record says the designs were looked at against the amended text.
