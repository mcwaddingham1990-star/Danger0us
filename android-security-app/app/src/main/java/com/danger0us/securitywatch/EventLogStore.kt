package com.danger0us.securitywatch

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Simple local-only log of past alerts, persisted as a JSON array in app-private storage. */
object EventLogStore {

    data class AlertEvent(val timestamp: Long, val reason: String, val photoPath: String?)

    private const val LOG_FILE = "alert_log.json"
    private const val MAX_EVENTS = 200

    @Synchronized
    fun addEvent(context: Context, event: AlertEvent) {
        val events = loadEvents(context).toMutableList()
        events.add(0, event)
        while (events.size > MAX_EVENTS) events.removeAt(events.size - 1)
        saveEvents(context, events)
    }

    @Synchronized
    fun loadEvents(context: Context): List<AlertEvent> {
        val file = File(context.filesDir, LOG_FILE)
        if (!file.exists()) return emptyList()
        return try {
            val array = JSONArray(file.readText())
            (0 until array.length()).map { i ->
                val obj = array.getJSONObject(i)
                AlertEvent(
                    timestamp = obj.getLong("timestamp"),
                    reason = obj.getString("reason"),
                    photoPath = obj.optString("photoPath").takeIf { it.isNotEmpty() }
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun saveEvents(context: Context, events: List<AlertEvent>) {
        val array = JSONArray()
        events.forEach { event ->
            val obj = JSONObject()
            obj.put("timestamp", event.timestamp)
            obj.put("reason", event.reason)
            obj.put("photoPath", event.photoPath ?: "")
            array.put(obj)
        }
        File(context.filesDir, LOG_FILE).writeText(array.toString())
    }
}
