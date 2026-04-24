<?php

namespace Modules\Loyalty\Http\Controllers\Api;

use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Models\GiftCertificateTemplate;
use Modules\Loyalty\Services\GiftCertificateIssueService;

class AdminGiftCertificateController extends Controller
{
    public function templates(): JsonResponse
    {
        $items = GiftCertificateTemplate::query()
            ->orderBy('amount')
            ->get();

        return response()->json([
            'data' => $items,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));

        $items = GiftCertificate::query()
            ->when($search !== '', fn ($q) => $q->where('code', 'like', "%{$search}%"))
            ->latest('id')
            ->paginate(20);

        return response()->json($items);
    }

    public function store(
        Request $request,
        GiftCertificateIssueService $issueService
    ): JsonResponse
    {
        $validated = $request->validate([
            'template_id' => ['nullable', 'integer', 'exists:gift_certificate_templates,id'],
            'initial_amount' => ['nullable', 'numeric', 'min:0.01'],
            'source' => ['nullable', 'string', 'max:32'],
            'expires_at' => ['nullable', 'date'],
            'issued_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'issued_phone' => ['nullable', 'string', 'max:64'],
            'comment' => ['nullable', 'string'],
            'issued_at' => ['nullable', 'date'],
            'activated_at' => ['nullable', 'date'],
            'sold_order_id' => ['nullable', 'integer', 'exists:orders,id'],
            'purchaser_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $item = $issueService->issue([
            'template_id' => $validated['template_id'] ?? null,
            'initial_amount' => isset($validated['initial_amount']) ? (float) $validated['initial_amount'] : null,
            'source' => $validated['source'] ?? GiftCertificate::SOURCE_MANUAL,
            'expires_at' => $validated['expires_at'] ?? null,
            'issued_to_user_id' => $validated['issued_to_user_id'] ?? null,
            'issued_phone' => $validated['issued_phone'] ?? null,
            'comment' => $validated['comment'] ?? null,
            'issued_at' => $validated['issued_at'] ?? null,
            'activated_at' => $validated['activated_at'] ?? null,
            'sold_order_id' => $validated['sold_order_id'] ?? null,
            'purchaser_user_id' => $validated['purchaser_user_id'] ?? null,
        ]);

        app(AuditLogService::class)->record('gift_certificate', (int) $item->id, AuditLogService::ACTION_CREATED, 'Создан подарочный сертификат');

        return response()->json(['data' => $item], 201);
    }

    public function show(int $id): JsonResponse
    {
        $item = GiftCertificate::query()->findOrFail($id);

        return response()->json([
            'data' => $item,
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $item = GiftCertificate::query()->findOrFail($id);
        $validated = $request->validate([
            'template_id' => ['nullable', 'integer', 'exists:gift_certificate_templates,id'],
            'initial_amount' => ['nullable', 'numeric', 'min:0.01'],
            'balance_amount' => ['nullable', 'numeric', 'min:0'],
            'reserved_amount' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', 'in:active,used,redeemed,void,expired'],
            'source' => ['nullable', 'string', 'max:32'],
            'expires_at' => ['nullable', 'date'],
            'issued_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'issued_phone' => ['nullable', 'string', 'max:64'],
            'comment' => ['nullable', 'string'],
            'issued_at' => ['nullable', 'date'],
            'activated_at' => ['nullable', 'date'],
            'purchaser_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'sold_order_id' => ['nullable', 'integer', 'exists:orders,id'],
        ]);

        $patch = [];
        foreach ([
            'template_id',
            'initial_amount',
            'balance_amount',
            'reserved_amount',
            'status',
            'source',
            'expires_at',
            'issued_to_user_id',
            'issued_phone',
            'comment',
            'issued_at',
            'activated_at',
            'purchaser_user_id',
            'sold_order_id',
        ] as $field) {
            if (array_key_exists($field, $validated) && $validated[$field] !== null) {
                $patch[$field] = $validated[$field];
            }
        }

        if ($patch !== []) {
            $item->update($patch);
        }

        app(AuditLogService::class)->record('gift_certificate', (int) $item->id, AuditLogService::ACTION_UPDATED, 'Обновлен подарочный сертификат');

        return response()->json(['data' => $item->fresh()]);
    }
}
