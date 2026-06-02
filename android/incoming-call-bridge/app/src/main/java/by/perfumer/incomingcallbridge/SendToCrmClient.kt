package by.perfumer.incomingcallbridge

import android.content.Context
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class SendToCrmClient(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    fun saveSettings(apiBaseUrl: String, token: String) {
        prefs.edit()
            .putString(KEY_API_BASE, apiBaseUrl.trim().trimEnd('/'))
            .putString(KEY_TOKEN, token.trim())
            .apply()
    }

    fun apiBaseUrl(): String = prefs.getString(KEY_API_BASE, "") ?: ""

    fun token(): String = prefs.getString(KEY_TOKEN, "") ?: ""

    fun sendToCrm(phone: String, receivedAt: Long): Result<Unit> {
        val apiBase = apiBaseUrl()
        val token = token()
        if (apiBase.isBlank() || token.isBlank()) {
            return Result.failure(IllegalStateException("Укажите API URL и токен"))
        }

        val payload = JSONObject()
            .put("phone", phone)
            .put("trigger", "manual")
            .put("received_at", receivedAt)

        val request = Request.Builder()
            .url("$apiBase/api/incoming-calls/send-to-crm")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Accept", "application/json")
            .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        return try {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    Result.success(Unit)
                } else {
                    Result.failure(IllegalStateException("API error ${response.code}"))
                }
            }
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

    companion object {
        private const val PREFS_NAME = "incoming_call_bridge"
        private const val KEY_API_BASE = "api_base_url"
        private const val KEY_TOKEN = "device_token"
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
