# S3 native Ollama qualification

Task `c3d71313f34bce71/s3/t9` (#285), 2026-11-25. The exact Linux ARM64/glibc 2.35 dependency route now passes and is enabled in the policy catalog. This is dependency-only qualification; full daemon installation, lifecycle, migrations and IDE parity remain outside this result.

The isolated OrbStack machine `insrc-s3-ollama-arm64` runs native ARM64 Ubuntu 22.04.5, with an 8 GiB memory limit and a two-CPU quota. Actual installation ran as UID 501 using verified private Node 22.22.1 and matching npm. Compiler/zstd tools were provisioned only for the VM harness; the tested route downloaded and decoded through the production Node implementation without elevation, system writes or models. Host daemon and host Ollama were untouched.

The pinned official Ollama v0.40.18 ARM64 archive is 1,704,011,634 bytes, SHA-256 `63f01dae3b65641866991e75e2aecb7aed8a4041f4c2c3c7d92862c5a47ebed6`. Independent inspection found one 8 MiB zstd frame with XXH64, 32 regular files and 17 internal aliases. Contained alias materialization produces 49 regular files totaling 4,005,889,908 bytes. These dependency bytes are downloaded live, not shipped in insrc bundles.

## Current passing run

A fresh installation under a separate private VM home completed verified live HTTPS acquisition, bounded extraction, target/library validation, durable publication and user-session readiness in 81.79 seconds. CLI and `/api/version` both reported 0.40.18. Kernel observations confirmed the exact private executable, argv `serve` and scoped environment. Decline changed no dependency files; ready reuse changed no attempt records. Models remained empty, logs bounded, and application data unchanged. Preparation and finite handoff closure/disposal evidence is separate from the intentionally retained service.

Fresh-process inspection passed in 29.99 ms warm and 36.00 ms after unprivileged `posix_fadvise(DONTNEED)` scoped to the 49 owned payload files. The latter read 39,507 characters according to `/proc/self/io`, including metadata and bounded executable headers, rather than rereading the 4.01 GB payload. Cache advice is not a guarantee that every mapped page was evicted; the measured read volume independently demonstrates absence of a full content pass. Attempt records stayed unchanged. The existing three-second aggregate inspection target is unchanged.

Raw current evidence: [installation](native-no-rehash-install.json), [decline](native-no-rehash-decline.json), [warm inspection](native-no-rehash-inspection-warm.json), [cold inspection](native-no-rehash-inspection-cold.json), [source/bundle hashes](native-no-rehash-source-hashes.json), and [qualification/target matrix](qualification.json).

## Historical failures and correction

The original install/start passed, but full installed-tree hashing took 4.13–4.33 seconds and cold inspection timed out at three seconds. The original [installation](native-install.json), [measurements](verification-after.json) and [cold failure](cold-inspection-failure.log) remain historical evidence. A proposed twenty-second reconciliation extension was never approved and is superseded by approved S3 LLD revision 5: verify the archive at acquisition, then use bounded receipt/identity/closure/layout checks without rehashing installed contents. Same-size installed-file changes are no longer detected cryptographically by inspection.

The first no-rehash rerun exposed a separate timer interaction: a per-probe timer cancelled the whole thirty-second service readiness window after three seconds, even though Ollama listened about one second after launch. That attempt remains failed in [its log](readiness-probe-failure.log). Production closed rechecks already own the three-second probe bound; removing the redundant timer lets transient unavailable probes use the remaining thirty-second readiness window. The `transient-presence-probe-timeout-preserves-service-readiness-window` regression and a second fresh native install passed. No deadline was extended.

## Remaining targets and cleanup

Only Linux ARM64/glibc 2.35 is enabled. Linux x64, macOS ARM64/x64 and Windows ARM64/x64 remain pending with concrete reasons in the matrix. The macOS ARM64 UTM guest previously failed to restore with permission denied; no bypass or host mutation was attempted. Passing Linux does not qualify another architecture or operating system.

The named OrbStack VM was stopped after collection. Its retained service ended at that VM boundary, which is not a daemon shutdown test or PID-based closure claim. The VM and evidence remain available. S1/S2 still own the approved change to remove embedded Node from application payloads and resolve separately downloaded runtimes.

## Manual routes for pending targets

These routes are guidance, not passed native qualification. Download the matching official payload from the [release assets](https://github.com/ollama/ollama/releases); if no compatible payload exists, keep the target pending. Verify the release digest before extracting. Preserve existing installations and use a new private destination.

- **Linux x64:** extract the full archive with an available zstd-capable tool into a user-owned directory such as `~/.local/opt/ollama`, retaining both `bin/` and `lib/`. Run the absolute `bin/ollama` path with `serve` in a terminal. This adapts the official [manual archive route](https://docs.ollama.com/linux) to a private destination: do not run its privileged system-install commands. If extraction or baseline requirements cannot be met without elevation, leave installation unmet.
- **macOS ARM64/x64:** place the official `Ollama.app` in `~/Applications` and run `~/Applications/Ollama.app/Contents/Resources/ollama serve`. Decline moving to system Applications or creating global CLI links. The official [custom location documentation](https://docs.ollama.com/macos) identifies this CLI path; confirm OS/CPU requirements. No quarantine bypass is proposed.
- **Windows ARM64/x64:** where an official matching standalone CLI ZIP is available, extract the complete ZIP and its libraries into `%LOCALAPPDATA%\Ollama\manual`, then use PowerShell: `& "$env:LOCALAPPDATA\Ollama\manual\ollama.exe" serve`. This adapts the official [standalone CLI route](https://docs.ollama.com/windows) without Administrator, PATH edits or service registration. Missing native ARM64 assets are a limitation; x64 emulation is not ARM64 native evidence.

Keep the serve terminal open, select the configured local endpoint, and retry inspection. Starting the service does not require downloading models. Each pending matrix entry also carries its applicable manual guidance.
