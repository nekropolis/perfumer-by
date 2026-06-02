package by.perfumer.incomingcallbridge

import android.telecom.Call
import android.telecom.CallScreeningService

class CrmCallScreeningService : CallScreeningService() {
    override fun onScreenCall(callDetails: Call.Details) {
        val number = callDetails.handle?.schemeSpecificPart?.trim().orEmpty()
        if (number.isNotEmpty()) {
            CallStateStore.setCurrentCall(number)
            NotificationHelper.showIncomingCall(applicationContext, number)
        }

        respondToCall(callDetails, CallResponse.Builder().build())
    }
}
