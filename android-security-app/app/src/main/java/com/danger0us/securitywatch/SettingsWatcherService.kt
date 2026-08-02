package com.danger0us.securitywatch

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import androidx.core.content.ContextCompat

class SettingsWatcherService : AccessibilityService() {

    private var monitorBinder: MonitoringForegroundService.LocalBinder? = null
    private var lastTriggerKey: String? = null
    private var lastTriggerAt: Long = 0

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            monitorBinder = binder as MonitoringForegroundService.LocalBinder
        }

        override fun onServiceDisconnected(name: ComponentName) {
            monitorBinder = null
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        val intent = Intent(this, MonitoringForegroundService::class.java)
        ContextCompat.startForegroundService(this, intent)
        bindService(intent, connection, Context.BIND_AUTO_CREATE)
        Log.i(TAG, "Monitoring started")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val packageName = event.packageName?.toString() ?: return
        val className = event.className?.toString() ?: ""
        val titleText = event.text?.joinToString(" ") ?: ""

        val reason = SensitiveScreenDetector.match(packageName, className, titleText) ?: return

        val key = "$packageName/$className"
        val now = System.currentTimeMillis()
        if (key == lastTriggerKey && now - lastTriggerAt < MIN_RETRIGGER_INTERVAL_MS) return
        lastTriggerKey = key
        lastTriggerAt = now

        Log.i(TAG, "Sensitive screen detected: $reason ($key)")
        monitorBinder?.triggerCapture(reason)
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        try {
            unbindService(connection)
        } catch (_: IllegalArgumentException) {
            // not bound, nothing to release
        }
    }

    companion object {
        private const val TAG = "SettingsWatcherService"
        private const val MIN_RETRIGGER_INTERVAL_MS = 4000L
    }
}
