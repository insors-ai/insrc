#!/bin/bash
# Run only in the protected signing environment, after its approval.
set -euo pipefail
case "${1:-}" in
	daemon-pilot-qualification|daemon-pilot-production) environment=$1 ;;
	*) echo 'unknown daemon signing environment' >&2; exit 2 ;;
esac
if [[ "${GITHUB_REF:-}" != refs/heads/main ]]; then
	echo 'daemon release signing requires the main branch' >&2
	exit 1
fi
: "${GH_REPO:?repository is required}" "${INSRC_RELEASE_POLICY_READ_TOKEN:?read-only policy token is required}"
export GH_TOKEN="$INSRC_RELEASE_POLICY_READ_TOKEN"
api="repos/$GH_REPO"
gh api "$api/actions/variables/INSRC_DAEMON_MAIN_RELEASE_READY" | jq -e '.value == "true"' >/dev/null
gh api "$api/branches/main" | jq -e '.name == "main" and .protected == true' >/dev/null
gh api "$api/environments/$environment" | jq -e --arg name "$environment" '
	.name == $name and
	.deployment_branch_policy.custom_branch_policies == true and
	.deployment_branch_policy.protected_branches == false and
	(if has("can_admins_bypass") then .can_admins_bypass == false else true end) and
	any(.protection_rules[]; .type == "required_reviewers" and .prevent_self_review == true and (.reviewers | length > 0))
' >/dev/null
gh api "$api/environments/$environment/deployment-branch-policies?per_page=100" | jq -e '
	.total_count == 1 and (.branch_policies | length) == 1 and
	.branch_policies[0].name == "main" and .branch_policies[0].type == "branch"
' >/dev/null
