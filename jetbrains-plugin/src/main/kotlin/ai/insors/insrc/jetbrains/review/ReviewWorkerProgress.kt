package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.ReviewWorkerProgressDto

internal fun ReviewWorkerProgressDto.label(): String {
    admission?.let {
        return when (it.state) {
            "failed" -> "Technical admission failure: ${it.error?.get("summary") ?: "Review preparation failed"}"
            "interrupted" -> "Review preparation interrupted"
            else -> "Preparing review"
        }
    }
    return when (status) {
        "failed" -> "Review failed"
        "interrupted" -> "Review interrupted"
        "paused" -> "Review paused"
        "invalidated" -> "Reviewed artifact changed"
        "passed", "changes_requested", "incomplete" -> "Review ${status.replace('_', ' ')}"
        else -> if (total == 0L) "Preparing review" else "Reviewing: $completed/$total"
    }
}
