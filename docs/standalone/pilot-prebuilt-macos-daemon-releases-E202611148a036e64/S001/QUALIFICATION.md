# Qualify a macOS daemon release locally

Use a disposable macOS 15 or later Apple Silicon account or VM. Run source
tests at the candidate's exact commit, then qualify the artifact downloaded
by the build run and artifact ID. Do not test against a production install.

1. Get the bootstrap archive digest from a separately authenticated project
   announcement. Verify it with system `shasum -a 256` before extracting or
   executing anything. Extract into a new private directory.
2. Download the exact Actions candidate and the signed qualification
   manifest. Compare the inner archive SHA-256 against the build summary.
   Keep the manifest and qualification signature unchanged.
3. In the dedicated local account create a private marker:
   `(umask 077; touch "$HOME/.insrc-pilot-qualification-account")`.
   Run `./node install-daemon-bundle.mjs qualification VERSION manifest.json manifest.qualification.sig ARCHIVE`
   from the authenticated bootstrap directory. Record the verified archive
   digest, status and restart output; check that Git, npm and a compiler are
   unnecessary to install and run the bundle.
4. In a second disposable account or restored VM, create a real clone-based
   installation matching a signed predecessor entry. Populate representative
   state, rerun the installer with the legacy checkout and legacy Node paths
   appended, and verify the state, IPC and restart after cutover.
5. In a disposable copy of that environment induce a candidate readiness
   failure without editing release bytes (for example, use a preconfigured
   test fixture external to the release). Confirm the journal identifies the
   transaction, recovery restores the exact predecessor offline, and an older
   manifest remains inadmissible afterward.
   For a bundle-to-bundle update, use a newer signed manifest naming the
   installed bundle's exact commit and manifest digest as a managed
   predecessor. Run the same installer without legacy checkout arguments.
   After an interruption, rerun the installer to reconcile the recorded
   transaction before attempting a different release. The installer uses
   the bootstrap key retained under the installation's private state directory.
6. Only after all checks pass, put `manifest.json`,
   `manifest.qualification.sig` and five logs in the release-control record:
   `source-tests.log`, `fresh-install.log`, `legacy-migration.log`,
   `restart.log`, and `rollback.log`. Generate the record with
   `node scripts/record-daemon-qualification.mjs RECORD_DIR OWNER/REPO RUN_ID ARTIFACT_ID MACOS_VERSION`.
   Submit it for review on the protected release-control branch. The script
   records operator assertions and evidence digests; it does not run or
   certify the tests itself.

## Development and release lanes

Dispatch the candidate workflow against `v2` to build an unsigned development
artifact. Use it for local packaging checks; it cannot be signed or published
by the release workflows. The candidate workflow definition must first be
present on GitHub's default branch. A narrow workflow-only change can register
it on `main` before the rest of the release implementation is merged.

Keep the repository variable `INSRC_DAEMON_MAIN_RELEASE_READY` unset until
`main` contains the packaging and installer code and the protections below
have been verified. Set it to exactly `true` to enable the `main` release lane.
This switch does not affect unsigned development builds.

## Release setup

Protect `main`, and create a `daemon-release-control` branch requiring a release
CODEOWNER review, stale review dismissal, and no direct writes or bypasses.
Store each promotion's approved record under `qualification/`. Configure
`daemon-pilot-qualification` and `daemon-pilot-production` with designated
reviewers, disallow self-approval and administrator bypass, and allow exactly
one deployment rule: branch `main`. Do not allow tag rules. Verify these
settings in GitHub before enabling the lane. When the API does not expose
the administrator bypass flag, verify it in the environment settings UI.

Set a read-only `INSRC_RELEASE_POLICY_READ_TOKEN` in both signing environments.
It needs repository Variables and Actions read access, plus the read access
needed to inspect branch protection. The promotion preparation job also uses
a read-only policy credential to verify the release-control branch; it must
have no signing or release permissions.

Generate two distinct project-owned Ed25519 pairs. Set
`INSRC_QUALIFICATION_KEY` only on the qualification environment and
`INSRC_PRODUCTION_KEY` only on the production environment. Set the production
environment variable `INSRC_QUALIFICATION_PUBLIC_KEY` to the qualification
SPKI PEM. Keep encrypted offline backups under project control; verify access
and signer fingerprints before use. Key rotation for existing installations
is deferred: a new bootstrap cannot replace an installed trust anchor.
Recover a lost signer from the project's encrypted backup. If its key is
unrecoverable or suspected compromised, pause promotion until a trust
migration is implemented. Preserve installed trust and release sequences.

Build from protected `main` with `daemon-candidate.yml`. Pass the exact run ID,
successful attempt, artifact ID and commit to `daemon-qualification-sign.yml`
from `main`. Test the signed archive locally and review the qualification
record. Then dispatch `daemon-promotion.yml` from protected `main` with the
approved control commit and the same archive SHA-256. Verify both inputs in
the environment review before approving. A different attempt is ineligible
even if its archive bytes are identical.

To stop releases, remove the readiness variable, cancel queued,
approval-pending and running main release workflows, and verify they are
terminal. The workflows recheck live readiness before signing and each
publication operation, but GitHub may finish a write it already accepted.
Inspect and reconcile any tag, draft or partial asset set before re-enabling.
A rerun never silently replaces a tag or asset.
