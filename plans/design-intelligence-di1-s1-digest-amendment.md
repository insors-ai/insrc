# DI1 S001 candidate identity amendment

Status: revised HLD, LLD and refreshed PLAN approved. The digest correction is implemented and all affected daemon build gates pass. Fresh independent code review is pending because the daemon's Claude CLI exhausted its session quota; BUILD completion remains unapproved.

## Defect in the approved formula

The approved candidate digest covers record identity/version pairs and non-coverage file path/digest pairs. It omits manifest role paths and attribution metadata. Swapping `sourceManifestPath` and `noticesPath`, then recomputing the release identity, can preserve the candidate digest and permit reuse of an earlier eligibility assessment against different file roles. This is an actual gap in the design, not a request to copy external design content.

## Proposed replacement

Compute candidate content identity from a canonical copy of the entire validated manifest:

1. Omit top-level `releaseId` and `reviewDigest`.
2. In the unique `files` entry whose path equals `coveragePath`, omit only its `digest`. Keep that entry's path and media type.
3. Preserve all other manifest fields, including schema version, label, createdAt, maintainer, source/notices/coverage role paths, complete record entries and every other complete file entry.
4. Sort record entries by recordId/version and file entries by path before canonical serialization and SHA-256.

The approved canonical JSON serialization, record identity, raw-file hashing, review-envelope identity and final release-identity rules stay the same. This preserves the acyclic order: records/files → candidate → coverage review → final release. There are no published corpus releases to migrate; existing development fixtures and golden vectors must be regenerated independently.

## Required implementation and proving tests

- Update `candidateContentDigest` and the dependency-chain documentation.
- Reject reuse of old assessments after changing role paths, maintainer, label, timestamp, record-entry metadata or file media types.
- Preserve exclusion of coverage bytes and the two top-level self-referential digests; preserve key/inventory-order independence.
- Recompute independent candidate/review/release golden vectors; record identity vectors remain unchanged.
- Rerun the corpus suite, strict build, affected insrc gates and independent code review before presenting BUILD completion approval.

The corrected code binds the complete manifest, preserves staged coverage path/mediaType, rejects noncomputable identities, and invalidates stale role/metadata assessments. It also preserves earlier specimen, snapshot, control-character and Unicode-collision fixes.

## Malformed coverage membership and upstream alignment

This replaces the HLD's normative candidate-content paragraph as well as the S001 LLD formula. Both require review and approval. The candidate digest is not computable when zero or multiple `files` entries match `coveragePath`: internal composition uses an empty value, preflight remains ineligible, and every supplied assessment is stale. Do not hash an arbitrary choice or strip all matching digests. `manifestDigest` may still be computed independently from a structurally valid manifest for diagnostics.

A staged manifest must declare the coverage entry's path and mediaType before candidate hashing; its placeholder digest is ignored until the coverage bytes exist. Final release validation still verifies that file's exact byte digest. Add missing/duplicate coverage-entry regressions alongside role-reassignment tests.
