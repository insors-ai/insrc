# S3 native Ollama qualification — blocked on inspection budget

Task `c3d71313f34bce71/s3/t9` (#285), 2026-11-25. This is partial native evidence, not a completed route qualification or release approval. The shipped policy catalog remains empty.

The isolated OrbStack machine `insrc-s3-ollama-arm64` runs native ARM64 Ubuntu 22.04.5 with glibc 2.35, an 8 GiB memory limit and a two-CPU quota. The verified official Node 22.22.1 distribution and matching npm are private to the test user. VM provisioning installed a compiler and independent zstd inventory tool; the tested dependency installation ran as UID 501, used the production Node decoder, and required no elevation or system installation.

The pinned [official v0.40.18 release](https://github.com/ollama/ollama/releases/tag/v0.40.18) ARM64 archive is 1,704,011,634 bytes with SHA-256 `63f01dae3b65641866991e75e2aecb7aed8a4041f4c2c3c7d92862c5a47ebed6`. Independent archive inspection found one 8 MiB zstd frame with XXH64, 32 regular files and 17 internal aliases. The production materializer produced 49 regular files totaling 4,005,889,908 bytes.

The actual HTTPS download, bounded decoding, library/executable validation, durable private publication and retained user-session startup passed in about 147 seconds. The native CLI and `/api/version` both reported 0.40.18. Kernel observations confirmed one exact private executable with argv `serve` and the scoped HOME, endpoint, model, temporary-data and PATH environment. Private logs were bounded; no model files were downloaded. Decline preserved dependency files, ready reuse preserved attempt records, and application data stayed unchanged. Preparation and finite service-handoff closure/disposal records are retained separately from the intentionally retained service. No daemon release, lifecycle or migration was installed or claimed.

## Blocking native result

The approved S3 LLD requires the entire read-only inspection, including complete recorded-payload reconciliation, to finish within three seconds. Full verification measured about 4.33 seconds with 64 KiB reads and 4.13 seconds with bounded 1 MiB reads. The latter preserves all byte counts, hashes, layout, link and identity checks; its 12 surrounding archive/preparation/service tests pass.

A warm fresh process passed inspection in about 2.10 seconds. After evicting only the qualification payload's file caches with unprivileged `posix_fadvise`, a new process timed out at the three-second bound and returned `unavailable` despite the healthy service. This cold-cache failure remains unresolved. It must not be hidden by the warm result or used to enable the Linux offer.

Proposed design correction: retain the three-second configuration/runtime/executable/HTTP presence-probe budget and give complete recorded private-payload reconciliation a separate 20-second deadline, with cancellation and positive closure. Preserve complete digest/layout/receipt validation. Public wire schemas and the IDE's initial daemon reachability probe stay unchanged. The HLD performance target also bounds local read-only inspection to three seconds, so a scoped HLD amendment must precede aligned LLD/plan approval and implementation. An exploratory S3 LLD revision 4 is a draft only and is not ready for approval against the unchanged HLD.

## Target status and cleanup

The six-target status table is in [qualification.json](qualification.json). Linux ARM64 is blocked by the inspection deadline. The existing macOS ARM64 UTM guest failed to restore with `permission denied` and remains stopped; the user was informed. Other native targets were not provisioned or exercised, and no translated run is claimed as native qualification. Nonenabled targets retain manual user-level guidance; official archives can be unpacked into a user-owned location, without using privileged system-install scripts.

After collecting evidence, the named disposable OrbStack VM was stopped. Its intentionally retained Ollama service ended at that VM boundary; this is not an insrc daemon shutdown test or a PID-based closure claim. The VM and evidence are retained for the next qualification attempt. Host daemon and host Ollama were not changed.

Raw results: [native installation](native-install.json), [decline](decline.json), [warm inspection](fresh-inspection-warm.json), [cold failure](cold-inspection-failure.log), [archive layout](archive-layout.json), [before](verification-before.json) and [after](verification-after.json) full-verification measurements.
