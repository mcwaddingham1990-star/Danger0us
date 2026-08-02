package com.danger0us.securitywatch

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder

/**
 * Kept running (with a visible "monitoring" notification) for as long as the
 * accessibility service is active, so the process counts as foreground and
 * can reliably open the camera even while no Activity is on screen.
 */
class MonitoringForegroundService : Service() {

    private val binder = LocalBinder()

    inner class LocalBinder : Binder() {
        fun triggerCapture(reason: String) {
            CameraCaptureManager.captureFrontSelfie(applicationContext) { photoFile ->
                AlertNotificationHelper.showAlert(applicationContext, reason, photoFile)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, AlertNotificationHelper.monitoringStatusNotification(this))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, AlertNotificationHelper.monitoringStatusNotification(this))
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    companion object {
        private const val NOTIFICATION_ID = 42
    }
}
