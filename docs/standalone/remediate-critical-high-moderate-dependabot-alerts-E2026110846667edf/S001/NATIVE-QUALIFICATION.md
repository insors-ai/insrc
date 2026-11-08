# Daemon native dependency qualification

Clean installs ran on Node 22.22.1 using npm ci and CXXFLAGS=-std=c++17. Both platforms started the daemon's local Nomic ONNX pipeline and returned a finite 768-component vector for the same input. Model files were loaded into disposable caches. Inference executed through the local CPU binding.

| Platform | Sharp | libvips | ONNX Runtime | Vector dimensions | L2 norm |
| --- | --- | --- | --- | --- | --- |
| macOS arm64 | 0.35.5 | 8.18.7 | 1.21.0 | 768 | 0.9999997458788267 |
| Linux arm64, Debian Bookworm | 0.35.5 | 8.18.7 | 1.21.0 | 768 | 0.9999997377683569 |

The root lockfile resolves Sharp 0.35.5 and tar 7.5.22 for all applicable consumers. Its two ONNX Runtime versions remain 1.19.2 under LanceDB and 1.21.0 under the daemon's Transformers dependency. Comparing all resolved instances to the captured ranges shows zero matches for the 110 scoped root alerts. The offline native regression runs Sharp on a raw pixel through the actual Transformers dependency path, then runs the complete Nomic pipeline from an isolated model cache with fetch disabled. Set INSRC_TEST_ONNX_HOME to that cache home or place it at node_modules/.cache/insrc-onnx-home to run the opt-in test. The model test executes inference in a subprocess so forced test-runner teardown cannot interrupt ONNX cleanup.

## Standalone memory upgrade and backup restoration

The same release tarball was installed independently on macOS arm64/APFS and Linux arm64/ext4. Both used Node 22.22.1 and ordinary npm optional dependency selection. Each ran nine packed tests with zero failures and zero skips. The two consumers loaded the respective official LanceDB 0.40.0 native bindings. The release tarball SHA-256 was `efb471757e1b589f7825f5d1be32af4f7a5dd7340de7aafb497c7dde109a104c`.

The baseline tarball was built from the previous package source at `33eefb2693c64ae393b54ebda479c5dce182d846` and had SHA-256 `0ba845cea35b693a6d3f01607244283f21170e86b1f14d0fa136d182b23b137a`. The previous package populated the store with a Unicode record, its exact vector, a committed receipt and an accepted but pending queue frame. Once the baseline closed, the test copied the store and queue to a backup. The release verified the row, vector, committed receipt, pending receipt and pending replay in the original directory. A scratch restore of the pre-upgrade backup opened and passed the same checks with the baseline package.

The Linux container's default storage did not satisfy the existing ext4 guard. The successful Linux test used a disposable ext4 image mounted inside the container and retained the normal store filesystem checks.
