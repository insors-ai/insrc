# S003 — test transcripts

Captured by t8 because the build validation gate cannot execute anything in
its sandbox and said so plainly: "the commit message claims 70/70 and 695
tests with 0 failures; that claim is not evidence." It is right. These are the
runs themselves.

## docs-review-panel suite
```
ℹ tests 120
ℹ suites 0
ℹ pass 120
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12074.059417
```

## full plugin sweep
```
ℹ tests 745
ℹ suites 0
ℹ pass 741
ℹ fail 0
ℹ cancelled 0
ℹ skipped 4
ℹ todo 0
ℹ duration_ms 11998.64775
```

## typecheck

`tsc --noEmit`, reporting the COMPILER's exit status (an earlier capture here
reported grep's, which is how a clean run can read as a failure):

```
vscode-plugin : exit 0, 0 TS errors
daemon (src/) : exit 0, 0 TS errors
```

## VSIX size

```
baseline (pre-S003)  insrc-vscode-0.5.8.vsix : 241,713 bytes
rebuilt  (post-S003) insrc-vscode-0.5.9.vsix : 247,667 bytes
delta                                        : +5,954 bytes (+2.463%)
```

Computed from the two artefacts with `os.path.getsize`, not typed. Alternative a3
(bundle a diagram library) would have added ~3 MB — 13x the whole extension. This
route added 5.81 KB, which is 528x smaller than a3's addition and the number that
proves the DOM-construction decision kept its central promise.

## Which artefact ships which change

- **Daemon rebuild** — required by **t1 only**, the one task that changed a file
  under `src/` (`artifact-content.ts`, the sc1 projection). Done and verified live
  at t1; see `t1-manual-live-check.md`.
- **Extension rebuild** — required by **t2-t7**, all of which are confined to
  `vscode-plugin/`. Done here.

Conflating the two is how a correct change comes to look broken: at t1 the first
`daemon-ctl.sh update` fast-forwarded only to the PLAN commit, because the code had
been committed locally and not pushed, and a live check at that moment would have
reported the field missing.
