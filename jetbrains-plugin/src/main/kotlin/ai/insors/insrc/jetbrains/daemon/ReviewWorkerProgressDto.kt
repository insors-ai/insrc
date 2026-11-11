package ai.insors.insrc.jetbrains.daemon

/** Additive daemon projection. Zero means unknown inventory while admission is unverified. */
data class ReviewAdmissionDto(val validation: String, val state: String, val stage: String, val error: Map<String, Any?>?)
data class ReviewWorkerProgressDto(
    val project: String, val family: String, val reviewId: String, val attempt: Long,
    val status: String, val phase: String, val completed: Long, val total: Long,
    val observedAt: String, val freshness: String, val admission: ReviewAdmissionDto?,
    val task: Map<String, Any?>?, val executionId: String?,
) {
    companion object {
        @Suppress("UNCHECKED_CAST")
        fun from(value: Map<String, Any?>): ReviewWorkerProgressDto {
            fun text(key: String) = (value[key] as? String)?.takeIf { it.isNotEmpty() }
                ?: throw IllegalArgumentException("Invalid review progress $key")
            fun count(key: String): Long {
                val n = value[key] as? Number ?: throw IllegalArgumentException("Invalid review progress $key")
                val result = n.toLong()
                require(result >= 0 && result <= 9007199254740991L && n.toDouble() == result.toDouble()) { "Invalid review progress $key" }
                return result
            }
            val family = text("family"); require(family in setOf("code", "design"))
            val status = text("status"); require(status in setOf("pending", "running", "passed", "changes_requested", "incomplete", "failed", "interrupted", "paused", "invalidated"))
            val freshness = text("freshness"); require(freshness in setOf("live", "stale"))
            val attempt = count("attempt"); require(attempt > 0)
            val completed = count("completed"); val total = count("total"); require(completed <= total)
            require(value["admission"] == null || value["admission"] is Map<*, *>)
            val admission = (value["admission"] as? Map<String, Any?>)?.let { a ->
                require(a["validation"] == "unverified")
                val state = a["state"] as? String; require(state in setOf("pending", "validating", "failed", "interrupted"))
                ReviewAdmissionDto("unverified", state!!, a["stage"] as? String ?: throw IllegalArgumentException("Missing admission stage"), a["error"] as? Map<String, Any?>)
            }
            return ReviewWorkerProgressDto(text("project"), family, text("reviewId"), attempt, status, text("phase"), completed, total,
                text("observedAt"), freshness, admission, value["task"] as? Map<String, Any?>, value["executionId"] as? String)
        }
    }
}
