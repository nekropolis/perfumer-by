<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Checkout\Models\SupplierOrder;
use Modules\Checkout\Services\SupplierOrderService;
use Modules\Checkout\Services\SupplierOrderXlsxExporter;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SupplierOrderController extends Controller
{
    public function __construct(
        private readonly SupplierOrderService $service,
    ) {}

    public function draftFromReservations(): JsonResponse
    {
        $result = $this->service->draftFromReservations();
        $added = (int) ($result['added'] ?? 0);
        $ignored = count($result['ignored_order_ids'] ?? []);

        if ($added > 0 && $ignored > 0) {
            $message = "Заявка сформирована. Пропущено заказов с неполным набором позиций: {$ignored} (статус «Ожидает появления»).";
        } elseif ($added > 0) {
            $message = 'Заявка сформирована.';
        } elseif ($ignored > 0) {
            $message = "Нет позиций для заявки. Заказов с неполным набором: {$ignored} — переведены в «Ожидает появления».";
        } elseif (($result['skipped'] ?? 0) > 0) {
            $message = 'Новых позиций нет: выбранные оферы уже в заявке.';
        } else {
            $message = 'Нет позиций с выбранным офером для заявки.';
        }

        return response()->json([
            'data' => $result,
            'message' => $message,
        ]);
    }

    public function draft(): JsonResponse
    {
        $items = $this->service->draftItemsPayload();

        return response()->json([
            'data' => $items,
            'total' => count($items),
        ]);
    }

    public function updateItem(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'qty' => ['required', 'integer', 'min:1', 'max:9999'],
        ]);

        $item = $this->service->updateItemQty($id, (int) $validated['qty']);

        return response()->json([
            'data' => $this->service->mapDraftItem($item),
        ]);
    }

    public function storeDraftItem(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'supplier_product_id' => ['required', 'integer', 'min:1', 'exists:supplier_products,id'],
            'qty' => ['sometimes', 'integer', 'min:1', 'max:9999'],
        ]);

        $item = $this->service->addDraftItemFromSupplierProduct(
            (int) $validated['supplier_product_id'],
            (int) ($validated['qty'] ?? 1),
        );

        return response()->json([
            'data' => $this->service->mapDraftItem($item),
            'message' => 'Товар добавлен в заявку.',
        ], 201);
    }

    public function destroyItem(int $id): JsonResponse
    {
        $this->service->deleteDraftItem($id);

        return response()->json([
            'message' => 'Позиция удалена из заявки.',
        ]);
    }

    public function confirm(): JsonResponse
    {
        $confirmed = $this->service->confirmDrafts();

        return response()->json([
            'data' => array_map(
                fn (SupplierOrder $order) => $this->service->mapSupplierOrder($order, true),
                $confirmed,
            ),
            'message' => $confirmed === []
                ? 'Нет черновиков для формирования заказа.'
                : 'Заказы у поставщиков сформированы.',
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $page = max(1, (int) $request->input('page', 1));
        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [25, 50, 100], true)) {
            $perPage = 25;
        }

        $paginator = SupplierOrder::query()
            ->confirmed()
            ->with('supplier')
            ->orderByDesc('ordered_at')
            ->orderByDesc('id')
            ->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (SupplierOrder $order) => $this->service->mapSupplierOrder($order))
                ->values()
                ->all(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'total' => $paginator->total(),
            'per_page' => $paginator->perPage(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $order = SupplierOrder::query()
            ->confirmed()
            ->with(['supplier', 'items'])
            ->findOrFail($id);

        return response()->json([
            'data' => $this->service->mapSupplierOrder($order, true),
        ]);
    }

    public function exportXlsx(int $id, SupplierOrderXlsxExporter $exporter): StreamedResponse
    {
        $order = SupplierOrder::query()
            ->confirmed()
            ->with(['supplier', 'items'])
            ->findOrFail($id);

        if (is_string($order->number) && preg_match('/^SP-\d+$/', $order->number) === 1) {
            $order->forceFill([
                'number' => $this->service->makeSupplierOrderNumber($order),
            ])->save();
        }

        return $exporter->download($order);
    }
}
