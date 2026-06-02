<?php

namespace Modules\Communications\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Services\CustomerContextByPhoneService;
use Modules\Communications\Events\SendToCrmEvent;
use Modules\Communications\Models\IncomingCallDevice;

class SendToCrmController extends Controller
{
    public function __invoke(Request $request, CustomerContextByPhoneService $customerContext): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:32'],
            'trigger' => ['required', 'in:manual'],
            'received_at' => ['nullable', 'integer', 'min:1'],
        ]);

        /** @var IncomingCallDevice $device */
        $device = $request->attributes->get('incoming_call_device');

        $normalizedPhone = Phone::normalize($validated['phone']);
        if ($normalizedPhone === '') {
            return response()->json([
                'message' => 'Invalid phone number.',
            ], 422);
        }

        $summary = $customerContext->resolveSummary($normalizedPhone);
        $receivedAt = (int) ($validated['received_at'] ?? now()->timestamp);

        broadcast(new SendToCrmEvent(
            managerUserId: (int) $device->manager_user_id,
            deviceId: (string) $device->id,
            deviceLabel: (string) $device->label,
            phone: $normalizedPhone,
            trigger: 'manual',
            receivedAt: $receivedAt,
            matchedUser: $summary['matched_user'],
            customerName: $summary['customer_name'],
            orders: $summary['orders'],
        ));

        $device->forceFill(['last_seen_at' => now()])->save();

        return response()->json([
            'success' => true,
        ]);
    }
}
