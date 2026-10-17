package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.PolicyRowsDto
import ai.insors.insrc.jetbrains.daemon.RepoFieldDto
import ai.insors.insrc.jetbrains.daemon.RepoSettingsDto
import ai.insors.insrc.jetbrains.daemon.RepoSettingsResult
import ai.insors.insrc.jetbrains.daemon.ResolvedTargetDto
import ai.insors.insrc.jetbrains.daemon.SigninDto

/** Shared fixtures for the Story s3 tracker tests: the rows the daemon defines and a loaded payload. */
internal object TrackerFixtures {
    private fun field(key: String, label: String, kind: String, type: String = "string", default: Any? = null, note: String? = null) =
        RepoFieldDto(key, label, type, if (type == "enum") listOf("github", "none") else null, default, "$label description", "Tracker", kind, note)

    val fields: List<RepoFieldDto> = listOf(
        field("type", "Tracker", "local", "enum"),
        field("owner", "Owner", "local"),
        field("repo", "Repository", "local"),
        field("ghPath", "gh program", "local", note = "saved; not used yet"),
        field("ghHost", "GitHub host", "local", default = "github.com", note = "saved; not used yet"),
        field("branchPattern", "Branch pattern", "local", note = "saved; not used yet"),
        field("signin", "Sign-in", "status"),
        field("target", "Resolved target", "status"),
        field("teamMode", "Team mode", "policy", "boolean", note = "set by the team policy"),
        field("signoffStages", "Signoff stages", "policy", note = "set by the team policy"),
    )

    fun loaded(
        repo: String,
        values: Map<String, Any?> = mapOf("type" to "github", "owner" to "acme", "repo" to "widgets", "ghHost" to "ghe.example.com"),
        signin: SigninDto = SigninDto("signed-in", "octocat", null),
        policy: PolicyRowsDto = PolicyRowsDto(true, "team", mapOf("teamMode" to true, "signoffStages" to listOf("DEF", "HLD")), null),
    ): RepoSettingsResult.Loaded = RepoSettingsResult.Loaded(
        RepoSettingsDto(
            repo = repo,
            values = values,
            resolved = ResolvedTargetDto("github", "acme", "widgets", "per-repo-config", null),
            signin = signin,
            policy = policy,
        ),
    )
}
