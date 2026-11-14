#!/bin/bash
# Distribute these instructions via the authenticated project announcement.
# The first argument must be the digest in that announcement, not a sidecar
# served beside the bootstrap. Require a trusted copy of this script.
set -euo pipefail
if [[ $# != 2 || ! "$1" =~ ^[0-9a-f]{64}$ || ! -f "$2" || -L "$2" ]]; then
	echo 'usage: verify-daemon-bootstrap.sh TRUSTED_SHA256 BOOTSTRAP_ARCHIVE' >&2
	exit 2
fi
actual=$(/usr/bin/shasum -a 256 < "$2")
if [[ "${actual%% *}" != "$1" ]]; then
	echo 'bootstrap SHA-256 does not match the authenticated announcement' >&2
	exit 1
fi
echo 'Bootstrap archive SHA-256 verified.'
