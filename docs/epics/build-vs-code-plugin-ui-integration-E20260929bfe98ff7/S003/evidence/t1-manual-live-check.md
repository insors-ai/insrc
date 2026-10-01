# S003 / t1 — MANUAL post-rebuild live verification

**This is a MANUAL verification. The build validation gate did NOT run it and does
not attest it.** The gate's sandbox cannot execute anything — its own verdict for
this task reported that "every `npx tsx --test` call needed approval and was not
allowed to run" — so a live end-to-end check has to be performed and recorded by
hand. That is what this file is. The plan anticipated this and wrote the check as
`live: MANUAL post-rebuild ... (result recorded in the task note, not
gate-attested)` precisely so it could not be quietly ticked on reasoning alone.

## What was done

1. `git push origin main` — `3f8efb9` (the t1 commit). The first `daemon-ctl.sh
   update` attempt fast-forwarded only to `98f6c5e1`, the PLAN commit, because the
   t1 commit had been committed locally and **not pushed**; the installed daemon
   syncs against `origin/main`, so an unpushed commit is invisible to it. Worth
   recording: a "the change doesn't work" report at that point would have been a
   stale-binary artefact, not a defect.
2. `bash scripts/daemon-ctl.sh update` — fast-forward `98f6c5e1 -> 3f8efb94`,
   `npm run build` in `~/.insrc/daemon`.
3. `bash scripts/daemon-ctl.sh restart` — daemon re-spawned on the rebuilt code,
   pid 2390.
4. One real document opened through the LIVE daemon over the actual
   `workflow.artifactContent` IPC (not a fixture, not an in-process call):
   `docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S002/LLD.md`.

## Result — PASS

```
artifactId   : LLD-bfe98ff7f97178cf-s2 | kind: LLD
'sequenceDefinition' in live response: true
  .id         : s2-render-order
  participants: 7
  messages    : 10
'erDefinition' in response (expect FALSE): false
companions   : ux-mock, diagram-mermaid
```

This is the exact document that motivated amendment `AMD-bfe98ff7f97178cf-1`, and
the response shape is the whole argument for it in one place: a
**`diagram-mermaid` companion ref** is present, **`erDefinition` is absent**, and
the record that actually draws that diagram — `sequenceDefinition` — now arrives.
Before this task the field was not projected, so S003 would have rendered
"a diagram was referenced but could not be shown" on this Story's own design
document. The absent-key behaviour is confirmed live too: `'erDefinition' in res`
is `false`, not a key holding `null` or `{}`.

## What this does NOT establish

- It exercises one document. The in-process suite covers the absent case, the
  malformed case and the unchanged-siblings case.
- It says nothing about the client-side rendering, which is t4–t6's work.
- The daemon is now running `3f8efb9`. Any later task that changes a file under
  `src/` needs its own rebuild; t2 onward touch only `vscode-plugin/`, so they do
  not.
