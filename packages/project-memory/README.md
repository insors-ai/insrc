# @insrc/project-memory

Independent Node 22 ESM project-memory module. The S1 foundation provides public contracts and embedded lifecycle; durable ingestion, Lance storage, semantic processing, recall and IPC belong to later stories. Data methods remain explicitly unavailable until implemented.

The public import performs no I/O. Host policy, models, logging, limits and a dedicated data directory are supplied explicitly. No daemon, index store or backend source is required.

Native ownership uses fs-ext 2.1.1. Building from source requires Python, make, a C++ compiler, Node 22 headers and C++17. On macOS use `CXXFLAGS=-std=c++17 npm ci` (or `CXXFLAGS=-std=c++17 npm rebuild fs-ext`) under Node 22; the compiler default is insufficient on the qualification machine. The external-consumer test must reproduce this documented prerequisite. Linux/ext4 qualification passed on Node 22.22.1 in [run 41343486195](https://github.com/insors-ai/insrc/actions/runs/41343486195), covering native ownership/lifecycle and packed consumption.

Use the public entry in an ESM host:

```ts
import { MemoryFactory } from '@insrc/project-memory';

const memory = await MemoryFactory.open({
  dataDirectory: '/absolute/private/project-memory',
  models, // Host-owned complete/embed port plus embeddingModel/embeddingDimension
  policy, // Host-owned bind(projectId) and admit(binding, event) port
  logger, // Host-owned write(level, event, fields) port
  limits: {
    maxEventBytes: 64 * 1024,
    segmentBytes: 4 * 1024 * 1024,
    maxPendingBytes: 64 * 1024 * 1024,
    modelTimeoutMs: 60_000,
  },
});
await memory.ready();
const result = await memory.drain(5_000);
// An incomplete drain retains ownership; await close before replacing the owner.
await memory.close();
```

The limits above are examples supplied by the host. No default project, model,
credentials, or data path is selected. The host must keep this directory outside
its index/other stores and outside any overlapping cleanup roots. All installed
copies and processes must cooperate with this ownership protocol; external
renames or deletion of a live directory are unsupported.

The supported runtime is Node >=22.22.1 and <23 on local APFS/macOS or
ext4/Linux, subject to recorded qualification. Other runtimes, remote/shared
filesystems and unrecognized layouts are refused. A new private directory gets
only `layout.json` and a persistent `.owner.lock`; no queue or Lance store is
created by this foundation. Do not delete the lock file to clear contention.
Forced process death releases kernel ownership; a stopped live process retains
it. Ownership uses `flockSync(fd, 'exnb')`: the syscall never waits for a competing
owner. The asynchronous fs-ext callback path is deliberately avoided because
worker-isolate qualification exposed a native callback crash.

`ready()` confirms the foundation owns its initialized directory. In S1,
`submit`, `context`, `search`, `inspect`, and `operation` reject `NOT_READY`.
There is no IPC executable yet. The separate `./node` entry exposes the explicit
Node host; importing either entry does not load the addon or start a daemon.

`drain` closes admission and waits to its monotonic deadline without releasing
ownership. `close` is idempotent and releases ownership only after owned work
settles; a provider that ignores abort can delay it. The module never closes
supplied models, policy, or logger objects. Cleanup failures retain ownership
where release cannot be verified. Errors expose stable typed codes without raw
provider/native messages.

Build with `npm run build`; run package checks with `npm test` from this package.
Packed-consumer checks use npm to install an actual tarball and its dependencies
in a temporary directory, requiring registry access and the native toolchain.
They do not publish the package. Tests run without forced exit so leaked handles
cannot be hidden. The backend is not required by a packed consumer.
