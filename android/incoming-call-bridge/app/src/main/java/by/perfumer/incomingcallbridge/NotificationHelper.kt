package by.perfumer.incomingcallbridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object NotificationHelper {
    private const val CHANNEL_ID = "incoming_calls"
    private const val NOTIFICATION_ID = 1001

    fun showIncomingCall(context: Context, phone: String) {
        createChannel(context)

        val openAppIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).putExtra(EXTRA_PHONE, phone),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val sendIntent = PendingIntent.getBroadcast(
            context,
            phone.hashCode(),
            Intent(context, SendToCrmActionReceiver::class.java)
                .setAction(ACTION_SEND_TO_CRM)
                .putExtra(EXTRA_PHONE, phone),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle("Входящий: $phone")
            .setContentText("Нажмите «Открыть в CRM», чтобы перевести звонок")
            .setContentIntent(openAppIntent)
            .setAutoCancel(true)
            .addAction(0, "Открыть в CRM", sendIntent)
            .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Входящие звонки",
            NotificationManager.IMPORTANCE_HIGH,
        )
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    const val EXTRA_PHONE = "phone"
    const val ACTION_SEND_TO_CRM = "by.perfumer.incomingcallbridge.SEND_TO_CRM"
}
