# Amendment presentation fix: validation evidence

Source commit: `8ca756d61`.

## Runtime and commands

The focused tests ran with `/opt/homebrew/opt/node@22/bin` first on PATH.
`/opt/homebrew/opt/node@22/bin/node --version` returned `v22.23.2`, within
the project's supported Node 22 range. The inherited CUDA-install setting
was preserved; when unset it was set to `skip`.

Commands used the canonical coordinator:

```sh
env PATH="/opt/homebrew/opt/node@22/bin:$PATH" ONNXRUNTIME_NODE_INSTALL_CUDA="${ONNXRUNTIME_NODE_INSTALL_CUDA-skip}" npm test -- src/workflow/__tests__/pending.test.ts src/mcp/__tests__/present-dispatch.test.ts src/workflow/amendments/__tests__/store.test.ts
env PATH="/opt/homebrew/opt/node@22/bin:$PATH" ONNXRUNTIME_NODE_INSTALL_CUDA="${ONNXRUNTIME_NODE_INSTALL_CUDA-skip}" npm test -- src/mcp/__tests__/present-dispatch.test.ts
```

The first run, `ae81c2fa-7ae1-45d7-8fe4-a19656e46bac`, passed the pending
suite (18 tests) and amendment-store suite (14 tests). Its new presentation
fixture initially failed because the temporary repository lacked the schema-2
marker required by the real presentation guard. The fixture now writes that
marker through `writeRepoSchema`; no production guard was bypassed.

The second run, `093817ad-1882-48eb-8f69-ab8e4748d758`, passed all six
presentation tests. The final applicable results are 38 passes, zero failures
and zero skips. Logs and coordinator metadata are retained beneath
`.insrc/tmp/test-harness/runs/<runId>/` for each named run.

The workflow validation gate independently reported `typecheckClean: true`
(`npx tsc --noEmit`) and `testsPassed: true` for both changed test files.
Its initial overall verdict withheld a pass solely because runtime and
deployment reporting were not yet in tracked evidence; this document supplies
that evidence. Its independently selected command environment is not claimed
to be the same as the explicit Node-22 coordinator runs above.

## Local source result versus running daemon

A read-only invocation of the rebuilt `out/workflow/pending.js` with the same
absolute Node-22 executable returned all four actual draft amendment IDs:
`AMD-c3d71313f34bce71-1`, `-2`, `-3` and `-4`. The integration test additionally
creates real amendment heads in a disposable repository, approves/rejects only
fixture records, and verifies the pending list and MCP presentation agree.

The existing host daemon was deliberately not stopped, restarted or updated.
It can retain the old pending-list implementation in memory. These source,
compiled-reader and fixture results do not establish that the already-running
MCP/daemon now presents the amendments. Deployment and live amendment
presentation remain unverified and require a separately authorized update of
the applicable runtime; no workspace amendment decision was changed.

No installer implementation, broad full-suite run or platform qualification
is claimed by this small bugfix.
