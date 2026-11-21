# Node runtime policy provenance

Task `175ab0d1d56838a9/s1/t1`, recorded 2026-11-21.

The authoritative source-install policy is `src/assets/node-runtime-policy.json`.
It pins Node 22.22.1, the complete distribution's Node/npm/license paths and
four candidate archive SHA-256 values. All candidates remain disabled pending
the plan's actual native/platform qualification in t7. Existing signed daemon
release formats, fingerprints and qualification requirements are unchanged.

## Acquisition and authentication

- Downloaded `SHASUMS256.txt` and its detached `SHASUMS256.txt.sig` over HTTPS
  from <https://nodejs.org/download/release/v22.22.1/>.
- Obtained `release-key.asc` from the official Node release-key repository,
  <https://github.com/nodejs/release-keys>, and checked the signer fingerprint
  against its published list:
  `CC68F5A3106FF448322E48ED27F5E38D5B0A215F` (Marco Ippolito).
- Imported that public key into an isolated local GPG home, without automatic
  key retrieval, and verified the detached signature against the exact checksum
  bytes. `verification.txt` retains the `GOODSIG` and `VALIDSIG` output. The
  `TRUST_UNDEFINED` line concerns GPG's local web-of-trust; the publisher identity
  was checked against the Node project's own HTTPS key listing.
- Selected only the `.tar.gz` rows for darwin-arm64, darwin-x64, linux-x64 and
  linux-arm64. The policy also pins the SHA-256 of the complete checksum file.
  The checksums and signature here are evidence, not a runtime network fallback.

The policy is trusted project/release content. Runtime installation must compare
an archive with this pinned policy; fetching a different sidecar alongside an
archive must never replace that authority. No archive has been executed or
qualified by this task. Authentic checksum verification establishes expected
bytes, not native compatibility or runtime portability.

## Regeneration and drift checks

Run `node scripts/sync-node-runtime-policy.mjs` after an explicit policy change.
This generates the shell selector and JSON assets for VS Code and JetBrains.
`node scripts/sync-node-runtime-policy.mjs --check` checks those assets, existing
production/development/Linux metadata pins, bootstrap/installer pins and native
headers in `.npmrc`. The normal build invokes the same check from
`copy-assets.mjs`; a pin upgrade therefore requires deliberate release changes.

Reproduce checksum signature verification using a fresh private GPG home:

```sh
gpg --no-options --homedir "$verification_home" --batch --no-auto-key-retrieve \
  --import docs/plans/node-runtime-evidence/release-key.asc
gpg --no-options --homedir "$verification_home" --batch --no-auto-key-retrieve \
  --status-fd 1 --verify docs/plans/node-runtime-evidence/SHASUMS256.txt.sig \
  docs/plans/node-runtime-evidence/SHASUMS256.txt
```

The operator creates `verification_home` with mode 0700. Never import these
verification assets into the user's personal keyring as part of installation.
