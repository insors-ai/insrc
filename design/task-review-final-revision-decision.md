# Task-review final revision decision

Status: proposed design for ISSUE-599f1d0bd42e0c37, subject to LLD review and approval.

The submitter supplies one immutable full commit OID as reviewRevision. The submitted change set remains the finding scope; review-set commits are lookup pointers and origin provenance. The host projects only selected segments into the explicit final revision, accounting for surviving, superseded and deleted portions. It never substitutes HEAD or treats all changes in the final commit as selected.

This choice addresses the approved issue's stale-version defect: a later included fix must be considered without admitting unrelated changes or suppressing genuine current defects. Historical-coordinate review plus prompt-only reconciliation was rejected because the host could still validate an obsolete finding location.

New pinned preparation explicitly rejects zero-segment original file selections with field=scope_conflict before admission/model dispatch. This is a deliberate change from the existing metadata/non-textual limitations path. Completed historical records keep their original read-only interpretation.

Publication persists a bounded host-derived final-scope snapshot, with per-task attribution, in each new pinned CR summary. Synchronous history validation and rendering use those saved final coordinates. Git reconstruction and verification occur before publication; historical no-pin records keep their original scope.

References: .insrc/artifacts/ISSUE-599f1d0bd42e0c37.json and .insrc/artifacts/LLD-599f1d0bd42e0c37-s1.json. This file records the selected design and its rationale; it does not assert an independently verifiable historical chat approval.
