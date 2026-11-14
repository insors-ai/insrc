#!/bin/bash
# Read an Actions artifact by ID; GitHub's API binds it to the exact run and SHA.
set -euo pipefail
if [[ $# != 5 || ! "$1" =~ ^[1-9][0-9]{0,19}$ || ! "$2" =~ ^[1-9][0-9]{0,2}$ || ! "$3" =~ ^[1-9][0-9]{0,19}$ || ! "$4" =~ ^[0-9a-f]{40}$ ]]; then
	echo 'usage: daemon-release-artifact.sh RUN_ID ATTEMPT ARTIFACT_ID COMMIT NEW_DIRECTORY' >&2
	exit 2
fi
: "${GH_REPO:?set GH_REPO to owner/repository}"
run=$1 attempt=$2 artifact=$3 commit=$4 destination=$5
repo_id=$(gh api "repos/$GH_REPO" --jq '.id')
[[ "$repo_id" =~ ^[1-9][0-9]{0,19}$ ]]
workflow_id=$(gh api "repos/$GH_REPO/actions/workflows/daemon-candidate.yml" --jq '.id')
[[ "$workflow_id" =~ ^[1-9][0-9]{0,19}$ ]]
gh api "repos/$GH_REPO/actions/runs/$run/attempts/$attempt" | jq -e \
	--arg run "$run" --arg attempt "$attempt" --arg repo "$repo_id" --arg sha "$commit" --arg workflow "$workflow_id" '
	(.id|tostring) == $run and (.run_attempt|tostring) == $attempt and
	(.repository.id|tostring) == $repo and (.head_repository.id|tostring) == $repo and
	(.workflow_id|tostring) == $workflow and .head_branch == "main" and .head_sha == $sha and
	.event == "workflow_dispatch" and .status == "completed" and .conclusion == "success" and
	.path == ".github/workflows/daemon-candidate.yml"' >/dev/null
gh api "repos/$GH_REPO/actions/artifacts/$artifact" | jq -e \
	--arg run "$run" --arg artifact "$artifact" --arg repo "$repo_id" --arg sha "$commit" \
	--arg name "daemon-candidate-release-$commit-$attempt" '
	(.id|tostring) == $artifact and .name == $name and
	.expired == false and ((.expires_at | fromdateiso8601) > now) and
	(.workflow_run.id|tostring) == $run and (.workflow_run.repository_id|tostring) == $repo and
	(.workflow_run.head_repository_id|tostring) == $repo and .workflow_run.head_branch == "main" and
	.workflow_run.head_sha == $sha' >/dev/null
mkdir -m 700 "$destination"
gh api "repos/$GH_REPO/actions/artifacts/$artifact/zip" > "$destination/artifact.zip"
# Extract by expected member name, never by archive-supplied filesystem paths.
/usr/bin/unzip -p "$destination/artifact.zip" candidate.json > "$destination/candidate.json"
[[ $(wc -c < "$destination/candidate.json") -le 8192 ]]
jq -e --arg sha "$commit" --arg run "$run" --arg attempt "$attempt" \
	'.branch == "main" and .lane == "release" and .commit == $sha and .runId == $run and .runAttempt == $attempt' \
	"$destination/candidate.json" >/dev/null
archive=$(node -e '
	const m = require("node:fs").readFileSync(process.argv[1], "utf8");
	const name = JSON.parse(m).archiveName;
	if (typeof name !== "string" || !/^insrc-daemon-[0-9.]+-pilot\.[0-9]+-darwin-arm64\.tar\.gz$/.test(name)) process.exit(2);
	process.stdout.write(name);
' "$destination/candidate.json")
/usr/bin/unzip -p "$destination/artifact.zip" "$archive" > "$destination/$archive"
rm "$destination/artifact.zip"
jq -n --arg repository "$repo_id" --arg commit "$commit" --arg runId "$run" \
	--arg runAttempt "$attempt" --arg artifactId "$artifact" \
	'{repository:$repository, branch:"main", lane:"release", commit:$commit, runId:$runId, runAttempt:$runAttempt, artifactId:$artifactId}' \
	> "$destination/verified-origin.json"
