package com.danger0us.securitywatch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object AlertNotificationHelper {

    private const val ALERT_CHANNEL_ID = "security_alerts"
    private const val MONITOR_CHANNEL_ID = "monitor_status"

    fun ensureChannels(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(ALERT_CHANNEL_ID, "Security alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Alerts when someone opens Accessibility or app-permission settings"
                enableVibration(true)
            }
        )
        manager.createNotificationChannel(
            NotificationChannel(MONITOR_CHANNEL_ID, "Monitoring status", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows that settings monitoring is active"
            }
        )
    }

    fun monitoringStatusNotification(context: Context): Notification {
        ensureChannels(context)
        val openApp = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(context, MONITOR_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle(context.getString(R.string.monitoring_notification_title))
            .setContentText(context.getString(R.string.monitoring_notification_text))
            .setOngoing(true)
            .setContentIntent(openApp)
            .build()
    }

    fun showAlert(context: Context, reason: String, photo: File?) {
        ensureChannels(context)
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val timestamp = SimpleDateFormat("MMM d, h:mm:ss a", Locale.getDefault()).format(Date())

        val builder = NotificationCompat.Builder(context, ALERT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(context.getString(R.string.alert_notification_title))
            .setContentText("$reason • $timestamp")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)

        val notificationId = if (photo != null) photo.name.hashCode() else System.currentTimeMillis().toInt()

        if (photo != null && photo.exists()) {
            val bitmap = BitmapFactory.decodeFile(photo.absolutePath)
            if (bitmap != null) {
                builder.setStyle(
                    NotificationCompat.BigPictureStyle()
                        .bigPicture(bitmap)
                        .setBigContentTitle(context.getString(R.string.alert_notification_title))
                        .setSummaryText("$reason • $timestamp")
                )
                builder.setLargeIcon(bitmap)
            }

            val photoUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", photo)
            val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(photoUri, "image/jpeg")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            builder.setContentIntent(
                PendingIntent.getActivity(
                    context, notificationId, viewIntent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            )
        } else {
            val openHistory = Intent(context, EventHistoryActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            builder.setContentIntent(
                PendingIntent.getActivity(context, notificationId, openHistory, PendingIntent.FLAG_IMMUTABLE)
            )
        }

        EventLogStore.addEvent(
            context,
            EventLogStore.AlertEvent(System.currentTimeMillis(), reason, photo?.absolutePath)
        )

        manager.notify(notificationId, builder.build())
    }
}
