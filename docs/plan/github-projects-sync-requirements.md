# GitHub Projects synchronization — requirements

Status: Draft requirements; not an approved workflow artifact.

## Purpose

Keep the GitHub Project delivery board aligned with insrc's Epic → Story → Task workflow, while preserving explicit approvals and a traceable history of synchronized changes.

## Current gap

The existing tracker sync reads GitHub issue state and `insrc:in-progress` / `insrc:blocked` labels. It does not read Project Status or custom planning fields. Project setup and automatic issue addition alone do not provide ongoing field synchronization.

## Requirements

1. **Configuration:** Allow selection of an existing GitHub Project per repository. Discover and validate field IDs and status options. Configure field mappings, sync direction and ownership; surface missing permissions or deleted fields without silently remapping them. Use the authenticated `gh` session.
2. **Publication and identity:** Ensure published epics, stories and tasks are project members without duplication. Persist the association between insrc artifact, GitHub issue and project item. Preserve existing parent/sub-issue relationships; synchronization must not invent or reparent work.
3. **Outbound status:** Reflect supported insrc delivery transitions in Project Status. Map Backlog, Ready, In Progress, In Review, Blocked and Done explicitly; unsupported or ambiguous transitions require a documented rule rather than a guessed mapping. Distinguish completed work from issues closed as not planned.
4. **Inbound planning:** Read Priority, Start date, Target date and issue assignees into insrc's delivery view. Treat assignees as issue data, not a duplicate custom field. Preserve unset values and distinguish an intentional clear from a failed read.
5. **Controlled inbound status:** Support GitHub-to-insrc delivery status updates only through explicit mappings and permitted transitions. A board move must never approve an artifact, bypass review, complete a build, or manufacture approval evidence. Show discrepancies between board status and verified workflow progress.
6. **Conflicts and recovery:** Define an authoritative source for each synchronized field. Detect changes on both sides since the last successful sync and expose conflicts instead of silently overwriting them. Make retries idempotent, prevent feedback loops, and report partial failures. Provide manual sync plus configurable periodic reconciliation while the daemon runs; catch up after downtime.
7. **Audit trail:** Append a record for each applied change, rejected transition, conflict and failed attempt. Include artifact/issue/project references, field, old and new values, direction, source, timestamp, outcome and correlation ID. Record the initiating actor when available; otherwise mark it unknown and distinguish it from the account executing the sync. Preserve conflict resolutions and retry history. Make records inspectable and exportable alongside existing workflow evidence; do not claim regulatory compliance solely from this feature.
8. **User feedback:** Show last successful sync, pending changes, conflicts and actionable failures in tracker settings and the delivery view. Support a preview of proposed changes before enabling a new mapping.

## Delivery scope

- **First increment:** Project configuration, stable item links, outbound delivery status, inbound planning fields, manual/periodic sync, conflict handling and audit records.
- **Follow-up:** Controlled inbound status changes with explicit transition policy.
- **Out of scope:** Jira implementation, custom dashboard rendering, automatic approval, and a regulatory certification claim. Keep the tracker contract extensible for future adapters.

## Acceptance criteria

- Publishing the same artifact twice produces one linked project item and retains its hierarchy.
- A supported insrc transition updates the mapped GitHub status; repeating sync causes no duplicate mutation.
- Editing a planning field in GitHub appears in insrc after sync, including intentional clears.
- Moving a card to Done cannot complete unreviewed work or create an approval record.
- Concurrent edits produce a visible conflict with recorded resolution; permission failures and outages can be retried without losing changes.
- Every applied change can be traced from the delivery view to its artifact, GitHub item and audit record, including provenance limitations.
- Existing issue/label sync continues to work when Project synchronization is disabled.
