# Connection registry maintenance

Normal daemon startup opens only already-adopted registered roots. It never
adopts legacy data or creates a replacement signing key for a managed root.
Release evidence, ownership, protected registry/state inodes, credentials and
filesystem permission checks must all pass before mutations are advertised.

The explicit CLI service action `adoptConnections(root)` verifies registry
membership over IPC, identifies the old daemon by PID, birth identity and
entrypoint, and uses the existing safe daemon-stop control. The offline daemon
maintenance entrypoint independently requires the old PID gone and no daemon
control files. It operates on the registered root only. No maintenance action
runs as part of a test, build, or routine connection request.

Maintenance requires a private owner directory and an unprivileged POSIX UID.
It keeps an exact read-only preimage, creates a durable preparing marker before
key creation, signs rollback-reference metadata before copying legacy vault
values, and migrates live slots to immutable generations. A separate same-UID
process proves that the legacy writeFile recipe fails against the actual final
registry. The original fixed keys and protected preimage remain available for
explicit recovery. Metadata contains keyed value checks, never resolved secrets.

An interrupted adoption, missing signing key, invalid snapshot/checkpoint,
external replacement, changed permissions or incomplete recovery disables
management. Do not remove the marker to retry, rotate the signing key, chmod the
live registry writable, or automatically replay a missing receipt. Preserve the
preimage, signed state, preparing marker and generation journal for inspection.

Downgrade is an explicit stopped maintenance operation: stop the identified
daemon using the safe control, verify it has exited, acquire exclusive ownership,
verify the signed checkpoint, protected preimage and rollback copies, and export
current receipts before choosing a recovery generation. Restore only a reviewed
snapshot via a new synced inode while all daemons remain stopped. Never chmod a
managed live inode writable. This build deliberately provides no online or
automatic downgrade; unresolved or unsigned interrupted state requires manual
recovery review and remains disabled.
