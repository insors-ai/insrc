package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.ReviewWorkerProgressDto

internal fun ReviewWorkerProgressDto.label(): String {
    when (operationState) {
        "cancelling" -> return "Cancelling review"
        "stopped" -> return "Review stopped"
        "resource_fenced" -> return "Review stopped; resource clearance required"
    }
    preparation?.takeIf { status in setOf("pending", "running") }?.let {
        val totalText = it.total?.let { n -> "/$n" } ?: ""
        return "Preparing review: ${it.stage.replace('_', ' ')} (${it.logicalCompleted}$totalText)"
    }
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
