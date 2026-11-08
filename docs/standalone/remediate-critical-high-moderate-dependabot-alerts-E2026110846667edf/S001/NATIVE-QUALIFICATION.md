# Daemon native dependency qualification

Clean installs ran on Node 22.22.1 using npm ci and CXXFLAGS=-std=c++17. Both platforms started the daemon's local Nomic ONNX pipeline and returned a finite 768-component vector for the same input. Model files were loaded into disposable caches. Inference executed through the local CPU binding.

| Platform | Sharp | libvips | ONNX Runtime | Vector dimensions | L2 norm |
| --- | --- | --- | --- | --- | --- |
| macOS arm64 | 0.35.5 | 8.18.7 | 1.21.0 | 768 | 0.9999997458788267 |
| Linux arm64, Debian Bookworm | 0.35.5 | 8.18.7 | 1.21.0 | 768 | 0.9999997377683569 |

The root lockfile resolves Sharp 0.35.5 and tar 7.5.22 for all applicable consumers. Its two ONNX Runtime versions remain 1.19.2 under LanceDB and 1.21.0 under the daemon's Transformers dependency. Comparing all resolved instances to the captured ranges shows zero matches for the 110 scoped root alerts. The offline native regression runs Sharp on a raw pixel through the actual Transformers dependency path, then runs the complete Nomic pipeline from an isolated model cache with fetch disabled. Set INSRC_TEST_ONNX_HOME to that cache home or place it at node_modules/.cache/insrc-onnx-home to run the opt-in test. The model test executes inference in a subprocess so forced test-runner teardown cannot interrupt ONNX cleanup.
