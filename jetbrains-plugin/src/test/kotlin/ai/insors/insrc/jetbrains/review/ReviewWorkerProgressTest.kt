package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.ReviewWorkerProgressDto
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ReviewWorkerProgressTest {
    @Test fun `admission DTOs preserve unknown inventory and current review identity`() {
        val input = mapOf<String, Any?>("project" to "/repo", "family" to "code", "reviewId" to "review-1", "attempt" to 2,
            "status" to "pending", "phase" to "scope_preparation", "completed" to 0, "total" to 0, "task" to null,
            "executionId" to "pinned-execution", "observedAt" to "2026-11-11T00:00:00.000Z", "freshness" to "live",
            "admission" to mapOf("validation" to "unverified", "state" to "pending", "stage" to "scope_preparation"))
        val pending = ReviewWorkerProgressDto.from(input)
        assertEquals("Preparing review", pending.label()); assertEquals("review-1", pending.reviewId)
        assertEquals(2L, pending.attempt); assertEquals(0L, pending.total); assertNull(pending.task)
        assertEquals("pinned-execution", pending.executionId)
        val failed = ReviewWorkerProgressDto.from(input + mapOf("status" to "failed", "admission" to mapOf("validation" to "unverified", "state" to "failed", "stage" to "admission", "error" to mapOf("code" to "qualification_failed", "summary" to "Subject missing"))))
        assertEquals("Technical admission failure: Subject missing", failed.label())
        val complete = ReviewWorkerProgressDto.from(input + mapOf("admission" to null, "status" to "passed", "completed" to 1, "total" to 1))
        assertEquals("Review passed", complete.label())
        val planning = ReviewWorkerProgressDto.from(input + mapOf("admission" to null, "family" to "design", "status" to "running", "phase" to "planning"))
        assertEquals("Preparing review", planning.label())
        assertThrows(IllegalArgumentException::class.java) { ReviewWorkerProgressDto.from(input + ("total" to -1)) }
    }
    @Test fun `preparation DTO preserves nullable totals and separate cancellation states`() {
        val base = mapOf<String, Any?>("project" to "/repo", "family" to "design", "reviewId" to "review-1", "attempt" to 1,
            "status" to "pending", "phase" to "scope_preparation", "completed" to 0, "total" to 0,
            "observedAt" to "2026-11-14T00:00:00.000Z", "freshness" to "live")
        val preparation = mapOf("stage" to "fetch_sources", "logicalCompleted" to 2, "physicalCompleted" to 1,
            "cacheHits" to 1, "bytes" to 123, "total" to null, "elapsedMs" to 250)
        val input = base + ("preparation" to preparation)
        val progress = ReviewWorkerProgressDto.from(input)
        assertNull(progress.preparation!!.total)
        assertEquals("Preparing review: fetch sources (2)", progress.label())
        assertEquals("Preparing review: fetch sources (2/5)", ReviewWorkerProgressDto.from(base + ("preparation" to (preparation + ("total" to 5)))).label())
        for ((state, label) in mapOf("cancelling" to "Cancelling review", "stopped" to "Review stopped", "resource_fenced" to "Review stopped; resource clearance required")) {
            assertEquals(label, ReviewWorkerProgressDto.from(input + ("operationState" to state)).label())
        }
        assertThrows(IllegalArgumentException::class.java) { ReviewWorkerProgressDto.from(input + ("operationState" to "cancelled")) }
        assertThrows(IllegalArgumentException::class.java) { ReviewWorkerProgressDto.from(base + ("preparation" to (preparation + ("total" to 1)))) }
        assertEquals("pending", progress.status)
    }

}
