#!/bin/bash
# Read an Actions artifact by ID; GitHub's API binds it to the exact run and SHA.
set -euo pipefail
if [[ $# != 4 || ! "$1" =~ ^[1-9][0-9]*$ || ! "$2" =~ ^[1-9][0-9]*$ || ! "$3" =~ ^[0-9a-f]{40}$ ]]; then
	echo 'usage: daemon-release-artifact.sh RUN_ID ARTIFACT_ID COMMIT NEW_DIRECTORY' >&2
	exit 2
fi
: "${GH_REPO:?set GH_REPO to owner/repository}"
run=$1 artifact=$2 commit=$3 destination=$4
gh api "repos/$GH_REPO/actions/runs/$run" --jq \
	".head_sha == \"$commit\" and .head_branch == \"v2\" and .event == \"workflow_dispatch\" and .conclusion == \"success\" and .path == \".github/workflows/daemon-candidate.yml\"" | /usr/bin/grep -qx true
gh api "repos/$GH_REPO/actions/artifacts/$artifact" --jq \
	".expired == false and .workflow_run.id == $run and .workflow_run.head_sha == \"$commit\"" | /usr/bin/grep -qx true
mkdir -m 700 "$destination"
gh api "repos/$GH_REPO/actions/artifacts/$artifact/zip" > "$destination/artifact.zip"
# Extract by expected member name, never by archive-supplied filesystem paths.
/usr/bin/unzip -p "$destination/artifact.zip" candidate.json > "$destination/candidate.json"
archive=$(node -e '
	const m = require("node:fs").readFileSync(process.argv[1], "utf8");
	const name = JSON.parse(m).archiveName;
	if (typeof name !== "string" || !/^insrc-daemon-[0-9.]+-pilot\.[0-9]+-darwin-arm64\.tar\.gz$/.test(name)) process.exit(2);
	process.stdout.write(name);
' "$destination/candidate.json")
/usr/bin/unzip -p "$destination/artifact.zip" "$archive" > "$destination/$archive"
rm "$destination/artifact.zip"
