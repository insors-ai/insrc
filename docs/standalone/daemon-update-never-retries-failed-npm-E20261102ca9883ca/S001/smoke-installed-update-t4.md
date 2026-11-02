## Installed-daemon update smoke (ISSUE-ca9883ca S001 t4), ~/.insrc/daemon, Node 22.23.2, 2026-11-02

```
### update 1 (old installed code: fast-forward + build)
[update] fast-forward: 27039bde -> af6e3161
[update] npm install: package-lock.json unchanged; skipping
UPDATE-RESULT {"ok":true,"steps":["sync","build","reconcile","steering-refresh"],"configReconcile":{"changed":false,"filled":0,"repaired":0,"pruned":0},"steeringRefresh":[{"file":"/Users/subhagho/work/projects/insors/insrc/CLAUDE.md","action":"unchanged"},{"file":"/Users/subhagho/work/projects/insor
af6e3161 chore(workflow): record ca9883ca:S001/t3 gate-passed
### update 2 (new code, no marker yet -> one real install with -std=c++17)
[update] already at af6e3161 (no-op)
[update] npm install (no install marker)
UPDATE-RESULT {"ok":true,"steps":["sync","install","build","reconcile","steering-refresh"],"configReconcile":{"changed":false,"filled":0,"repaired":0,"pruned":0},"steeringRefresh":[{"file":"/Users/sub
marker: 074ee3087222f28327eb34eea9016fc40f16516f
lock:   074ee3087222f28327eb34eea9016fc40f16516f
ls: node_modules/fs-ext/build/Release/fs_ext.node: No such file or directory
### update 3 (marker matches -> skip)
[update] already at af6e3161 (no-op)
[update] npm install: the install marker matches package-lock.json; skipping
UPDATE-RESULT {"ok":true,"steps":["sync","build","reconcile","steering-refresh"],"configReconcile":{"changed":false,"filled":0,"repaired":0,"pruned":0},"steeringRefresh":[{"file":"/Users/subhagho/work
### repair: CXXFLAGS=-std=c++17 npm rebuild fs-ext (the s9 --ignore-scripts workaround had left it unbuilt)
rebuilt dependencies successfully
-rwxr-xr-x@ 1 subhagho  staff  60584 Nov  2 17:53 node_modules/fs-ext/build/Release/fs_ext.node
fs-ext flockSync: function
ok tree-sitter
ok lmdb
```

Result: the update rule holds on the installed daemon. Update 1 ran the OLD installed code (fast-forward 27039bde -> af6e3161, lockfile unchanged so it skipped the install, then built the new code). Update 2 ran the new code: no marker, so it installed once and wrote the marker (= the lockfile blob hash). Update 3 skipped: the marker matches.

Finding: after update 2, node_modules/fs-ext had no build/Release/fs_ext.node although npm install exited 0. Cause: the Epic c2ba6fa6 s9 daemon update had been worked around by hand with `npm install --ignore-scripts`, which extracted fs-ext without running its build script; a later `npm install` treats the package as present and does not re-run that script. So the marker (which trusts npm's exit code) cannot repair a package whose install script was skipped by hand; the LLD migration note "the first update ... repairs a daemon whose earlier install failed" holds for a FAILED install, not for an --ignore-scripts install. Repaired here with `CXXFLAGS=-std=c++17 npm rebuild fs-ext`; fs-ext now loads. A clean install (smoke-clean-install-t4.md) builds fs-ext through the new path.

Control for the failed-install case (scratch package depending on fs-ext 2.1.1, same toolchain): `npm install` without the flag exits 1 and npm rolls fs-ext back (node_modules/fs-ext absent); the retried `npm install` with CXXFLAGS=-std=c++17 exits 0 with build/Release/fs_ext.node present and loadable. So a retry after a genuinely failed install does build the package; only a hand-run `--ignore-scripts` install escapes the marker.
