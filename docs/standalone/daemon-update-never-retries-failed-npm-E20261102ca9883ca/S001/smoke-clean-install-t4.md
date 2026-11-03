```
## Clean install smoke (ISSUE-ca9883ca S001 t4)
Mon Nov  2 12:21:27 UTC 2026
node v22.23.2, npm 10.9.8, bundled node-gyp   "version": "11.5.0",
af6e3161e chore(workflow): record ca9883ca:S001/t3 gate-passed
### run 1: daemon-ctl.sh update --skip-sync --skip-build (no marker -> real npm install)
[17:51:31] npm install (/tmp/insrc-clean-smoke/daemon)
[17:52:11] update complete (daemon NOT restarted)
exit=0
### marker
074ee3087222f28327eb34eea9016fc40f16516f
lockfile blob hash: 074ee3087222f28327eb34eea9016fc40f16516f
### fs-ext built and loadable
-rwxr-xr-x@ 1 subhagho  wheel  60600 Nov  2 17:51 /tmp/insrc-clean-smoke/daemon/node_modules/fs-ext/build/Release/fs_ext.node
fs-ext flockSync: function
### other native modules load
ok tree-sitter
ok lmdb
ok @duckdb/node-api
ok @lancedb/lancedb
### compile flag seen in the npm log for fs-ext
### run 2: same lockfile -> skip
[17:52:17] npm install: the install marker matches package-lock.json; skipping
[17:52:17] update complete (daemon NOT restarted)
exit=0
```

Control (same toolchain, before the fix, 2026-11-02): `npm install fs-ext@2.1.1` with no CXXFLAGS failed under npm-bundled node-gyp 11.5.0 (no -std flag; std::is_void_v errors in v8-internal.h); see the LLD citation c8. The empty 'compile flag seen' section is because npm does not echo compiler command lines without --foreground-scripts.
