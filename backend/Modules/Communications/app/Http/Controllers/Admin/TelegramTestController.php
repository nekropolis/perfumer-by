<?php

namespace Modules\Communications\Http\Controllers\Admin;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Communications\Services\Notifications\CheckoutTelegramNotificationService;

class TelegramTestController extends Controller
{
    public function send(Request $request, CheckoutTelegramNotificationService $service): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['nullable', 'string', 'max:2000'],
        ]);

        $result = $service->sendTestMessage($validated['message'] ?? null);

        return response()->json([
            'data' => array_merge($result, [
                'chat_id' => (string) config('communications.telegram.chat_id', ''),
                'timeout' => (int) config('communications.telegram.timeout', 10),
            ]),
            'message' => ($result['ok'] ?? false) ? 'Тестовое сообщение отправлено' : 'Тестовая отправка не удалась',
        ], ($result['ok'] ?? false) ? 200 : 422);
    }
}
