package by.perfumer.incomingcallbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

class SendToCrmActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != NotificationHelper.ACTION_SEND_TO_CRM) {
            return
        }

        val phone = intent.getStringExtra(NotificationHelper.EXTRA_PHONE).orEmpty()
        if (phone.isBlank()) {
            return
        }

        val client = SendToCrmClient(context)
        val result = client.sendToCrm(phone, System.currentTimeMillis() / 1000)
        val message = if (result.isSuccess) {
            "Отправлено в CRM"
        } else {
            result.exceptionOrNull()?.message ?: "Ошибка отправки"
        }
        Toast.makeText(context.applicationContext, message, Toast.LENGTH_SHORT).show()
    }
}
