package by.perfumer.incomingcallbridge

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.telecom.TelecomManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import by.perfumer.incomingcallbridge.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var client: SendToCrmClient

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                Toast.makeText(this, "Уведомления нужны для быстрого перевода", Toast.LENGTH_SHORT).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        client = SendToCrmClient(this)
        binding.apiBaseInput.setText(client.apiBaseUrl())
        binding.tokenInput.setText(client.token())

        requestRuntimePermissions()

        binding.saveSettingsButton.setOnClickListener {
            client.saveSettings(
                apiBaseUrl = binding.apiBaseInput.text.toString(),
                token = binding.tokenInput.text.toString(),
            )
            Toast.makeText(this, "Настройки сохранены", Toast.LENGTH_SHORT).show()
        }

        binding.openScreeningSettingsButton.setOnClickListener {
            startActivity(Intent(TelecomManager.ACTION_CHANGE_PHONE_ACCOUNTS))
        }

        binding.sendCurrentButton.setOnClickListener {
            sendCurrentCallToCrm()
        }
        binding.sendManualButton.setOnClickListener {
            sendManualNumberToCrm()
        }

        handleIntentPhone(intent)
        renderState()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntentPhone(intent)
        renderState()
    }

    override fun onResume() {
        super.onResume()
        renderState()
    }

    private fun requestRuntimePermissions() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.READ_PHONE_STATE), 1)
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun handleIntentPhone(intent: Intent?) {
        val phone = intent?.getStringExtra(NotificationHelper.EXTRA_PHONE).orEmpty()
        if (phone.isNotBlank()) {
            CallStateStore.setCurrentCall(phone)
        }
    }

    private fun renderState() {
        val current = CallStateStore.currentCall()
        binding.currentPhoneText.text = current?.phone ?: "Нет входящего номера"
        binding.historyText.text = CallStateStore.history().joinToString("\n") { entry ->
            "${entry.phone} · ${entry.receivedAt}"
        }.ifBlank { "История пуста" }
    }

    private fun sendCurrentCallToCrm() {
        val phone = CallStateStore.currentCall()?.phone
        if (phone.isNullOrBlank()) {
            Toast.makeText(this, "Нет номера для отправки", Toast.LENGTH_SHORT).show()
            return
        }

        sendPhoneToCrm(phone)
    }

    private fun sendManualNumberToCrm() {
        val rawPhone = binding.manualPhoneInput.text?.toString().orEmpty().trim()
        if (rawPhone.isBlank()) {
            Toast.makeText(this, "Введите номер", Toast.LENGTH_SHORT).show()
            return
        }

        val phone = rawPhone.replace(" ", "").replace("-", "")
        sendPhoneToCrm(phone)
    }

    private fun sendPhoneToCrm(phone: String) {
        val result = client.sendToCrm(phone, System.currentTimeMillis() / 1000)
        val message = if (result.isSuccess) {
            "Открываем заказ в CRM"
        } else {
            result.exceptionOrNull()?.message ?: "Ошибка отправки"
        }
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}
