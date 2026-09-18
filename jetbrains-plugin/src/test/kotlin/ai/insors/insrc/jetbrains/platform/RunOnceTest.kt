package ai.insors.insrc.jetbrains.platform

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Unit tests for [RunOnce] — the exactly-once guard that gates the app-scoped
 * consumer registration (Story S001). Platform-free (JUnit5, no IDE fixture), so
 * the once-only + concurrency + catch-and-claim behaviour is proven directly.
 */
class RunOnceTest {

    @Test
    fun `repeated invocation runs the action exactly once`() {
        val guard = RunOnce()
        val count = AtomicInteger(0)

        val ran1 = guard.run { count.incrementAndGet() }
        val ran2 = guard.run { count.incrementAndGet() }
        val ran3 = guard.run { count.incrementAndGet() }

        assertTrue(ran1, "the first call runs the action")
        assertFalse(ran2, "the second call is a no-op")
        assertFalse(ran3, "the third call is a no-op")
        assertEquals(1, count.get(), "the action ran exactly once")
    }

    @Test
    fun `concurrent invocation has exactly one CAS winner`() {
        val guard = RunOnce()
        val count = AtomicInteger(0)
        val winners = AtomicInteger(0)
        val threads = 32
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(threads)
        try {
            repeat(threads) {
                pool.submit {
                    start.await()
                    if (guard.run { count.incrementAndGet() }) winners.incrementAndGet()
                }
            }
            start.countDown()
            pool.shutdown()
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS), "all tasks finished")
        } finally {
            pool.shutdownNow()
        }

        assertEquals(1, count.get(), "the action ran exactly once under concurrency")
        assertEquals(1, winners.get(), "exactly one caller's compareAndSet won")
    }

    @Test
    fun `a throwing action is caught, the flag stays claimed, and there is no retry`() {
        val guard = RunOnce()
        val count = AtomicInteger(0)

        val ranFirst = guard.run { count.incrementAndGet(); throw RuntimeException("boom") }
        val ranSecond = guard.run { count.incrementAndGet() }

        assertTrue(ranFirst, "the first call claimed the flag and ran despite throwing")
        assertFalse(ranSecond, "the flag stays claimed after a throwing action -> no retry")
        assertEquals(1, count.get(), "the action body executed exactly once")
    }
}
