package by.perfumer.incomingcallbridge

import java.util.ArrayDeque

data class IncomingCallEntry(
    val phone: String,
    val receivedAt: Long,
)

object CallStateStore {
    private const val MAX_HISTORY = 10

    @Volatile
    private var currentCall: IncomingCallEntry? = null

    private val history = ArrayDeque<IncomingCallEntry>()

    @Synchronized
    fun setCurrentCall(phone: String, receivedAt: Long = System.currentTimeMillis() / 1000) {
        val entry = IncomingCallEntry(phone = phone, receivedAt = receivedAt)
        currentCall = entry
        history.removeAll { it.phone == phone }
        history.addFirst(entry)
        while (history.size > MAX_HISTORY) {
            history.removeLast()
        }
    }

    @Synchronized
    fun currentCall(): IncomingCallEntry? = currentCall

    @Synchronized
    fun history(): List<IncomingCallEntry> = history.toList()
}
