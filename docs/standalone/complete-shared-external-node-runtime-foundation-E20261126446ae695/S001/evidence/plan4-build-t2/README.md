# PLAN4 T2 — strict runtime verification and owned test cleanup

Owning task `446ae69566d352dd/s1/t2` was admitted after T1 passed. LLD8/PLAN4
are approved; final Story BUILD approval remains outstanding.

Canonical resolution requires the exact published POSIX form: root/directories
0500, metadata0400, and every pinned file's original mode with all write bits
removed. Source-stage verifies original modes; permission-transition permits
only root0700 or0500 with every descendant protected. These pure verification
lanes return void. Resolver options cannot weaken canonical launch admission.
Official inventory/completion bytes, hashes, identity/layout and public schemas
are unchanged.

Exact LLD8 manual, unfinished-publication and unsupported-development-layout
diagnostics are implemented. Classification verifies the complete alternative
form before emitting either special diagnostic, within the same outer deadline.
It performs no repair, lock acquisition, deletion, chmod or operator move.
An actual shell argument probe validates the returned quote for a path containing
spaces, Unicode and an apostrophe; it executes printf only.

The test-only `_owned-runtime-home.ts` factory captures a new mkdtemp root's
device/inode/UID. It cannot adopt a caller path. Cleanup uses retained fixture
group handles and explicit resource closure, checks a bounded nofollow tree,
restores ownerwrite to directories through checked descriptors, then unlinks
captured files/known links and removes checked empty directories. Unknown links,
replacement roots, failed/unconfirmed closure and traversal-limit failures retain
evidence before any permission restoration/deletion. No shared mutable SDK cache,
installed host runtime, or pre-existing blocked root is adopted.

Resolver fixtures independently seed protected official-profile copies before
T4 publication exists. Every rejection mutation has a successful baseline and
successful restoration with specific error assertions. All changed fixture
allocation/finally paths await cleanup; verifier resource-close uncertainty is
registered with the cleanup owner rather than erased.

## Validation checkpoint

- Initial run `df538d08-5f71-4f3b-a584-04472d51d544`: build/typechecks passed;
  cleanup helper8, production-deadline2 and qualification-timing3 cases passed.
  Resolver7/9 passed. Two exact expectations were wrong: missing top-level
  metadata triggers membership admission first; group/other-write mode triggers
  ownership admission first. The failed TAP is preserved.
- Corrective resolver run `d90266bb-f337-4584-a280-b45ff2542402`: all9 passed
  in152.10s after correcting those expectations and exercising the remaining
  restored mutation cases. Across the latest file outcomes all22 cases in four
  files pass. File allowance was explicitly1200s; ordinary runtime verification
  remains120s. Both runs used Node22.22.1 and confirmed owned-group closure with
  no evidence/cancellation errors; their checkout leases were released.
- Tests prove actual EACCES for canonical executable writes and directory
  creation as the ordinary macOS user; mode masking preserves original pinned
  inventory bytes and execute intent.
- Deliberate negative cleanup fixtures retain small isolated roots, named in
  the helper TAP diagnostics. Their controlled unconfirmed promises own no live
  resource. They are not deleted by PID/age or treated as successful disposal.
- Registered T2 validation is pending at this implementation checkpoint.

`source-inputs.json` binds the four edited inputs. T3/T4 production acquisition
and publication, T7 SDK isolation, T8 consumer wiring, T9 full scoped regression
and T10 current macOS/Linux VM qualification remain separate pending work.
Windows native execution/enablement and host-v2 migration were not performed.
