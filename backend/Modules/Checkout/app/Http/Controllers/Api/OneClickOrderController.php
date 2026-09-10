<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Checkout\Support\OrderAccountScope;
use Modules\Communications\Services\Notifications\CheckoutTelegramNotificationService;
use Modules\Users\Models\Client;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Modules\Warehouse\Services\StockInventoryService;
use Throwable;

class OneClickOrderController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'variant_id' => ['required', 'integer', 'exists:product_variant_links,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'customer_name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:64'],
            'phone_plain_digits' => ['sometimes', 'boolean'],
            'consent_offer' => ['accepted'],
            'consent_privacy' => ['accepted'],
        ]);

        Phone::assertValidFlexible(
            $validated['phone'],
            (bool) ($validated['phone_plain_digits'] ?? false),
        );

        $customerName = trim((string) $validated['customer_name']);
        abort_if($customerName === '', 422, 'Укажите имя');

        $phone = Phone::normalize($validated['phone']);

        $variant = ProductVariantLink::query()
            ->with(['product.brand', 'definition'])
            ->findOrFail((int) $validated['variant_id']);

        abort_if(!(bool) $variant->is_active, 422, 'Выбранный вариант недоступен');

        $product = $variant->product;
        abort_if(!$product, 422, 'Товар не найден');

        if (!empty($validated['product_id']) && (int) $validated['product_id'] !== (int) $product->id) {
            abort(422, 'Вариант не принадлежит указанному товару');
        }

        $availability = $this->resolveAvailability($variant);
        abort_if(!($availability['is_available'] ?? false), 422, 'Товар временно недоступен для заказа');

        $client = $request->user() ?? Auth::guard('sanctum')->user();
        $client = $client instanceof Client ? $client : null;
        $orderClientId = $this->resolveOrderClientId($client, $phone);

        $price = round((float) ($variant->price ?? 0), 2);
        abort_if($price <= 0, 422, 'Не удалось определить цену товара');

        $availabilitySource = (string) ($availability['availability_source'] ?? 'unavailable');
        $supplierVariantOfferId = null;
        $supplierPurchasePrice = null;
        $needsSupplierOffer = in_array($availabilitySource, ['supplier_only', 'supplier_warehouse'], true)
            || $availabilitySource === 'main+supplier';

        if ($needsSupplierOffer) {
            $offer = CatalogVariantStockPresenter::preferredListingOffer($variant);
            if ($offer) {
                $supplierVariantOfferId = (int) $offer->id;
                $resolvedPurchase = CatalogVariantStockPresenter::resolveListingPurchasePrice($offer);
                $supplierPurchasePrice = $resolvedPurchase !== null
                    ? round($resolvedPurchase, 2)
                    : ($offer->purchase_price !== null ? round((float) $offer->purchase_price, 2) : null);
            }
        }

        $order = DB::transaction(function () use (
            $orderClientId,
            $customerName,
            $phone,
            $product,
            $variant,
            $price,
            $availabilitySource,
            $supplierVariantOfferId,
            $supplierPurchasePrice,
        ) {
            $order = Order::query()->create([
                'client_id' => $orderClientId,
                'customer_name' => $customerName,
                'phone' => $phone,
                'comment' => null,
                'status' => 'new',
                'items_qty' => 1,
                'subtotal' => $price,
                'total' => $price,
                'delivery_method' => null,
                'delivery_city' => null,
                'delivery_city_id' => null,
                'delivery_address' => null,
                'delivery_fee' => 0,
                'payment_method' => null,
                'shipment_date' => now()->toDateString(),
                'consent_offer' => true,
                'consent_privacy' => true,
                'consent_marketing' => false,
                'consents_accepted_at' => now(),
                'discount_card_id' => null,
                'discount_card_number' => null,
                'discount_percent_snapshot' => 0,
                'discount_amount' => 0,
            ]);

            OrderItem::query()->create([
                'order_id' => $order->id,
                'product_id' => $product->id,
                'variant_id' => $variant->id,
                'product_name' => ProductDisplayName::forProduct($product),
                'product_slug' => $product->slug,
                'brand_name' => $product->brand?->name,
                'variant_title' => $this->makeVariantDisplayTitle($variant),
                'sku' => null,
                'qty' => 1,
                'price' => $price,
                'total' => $price,
                'waiting_discount' => false,
                'availability_source' => $availabilitySource,
                'supplier_variant_offer_id' => $supplierVariantOfferId,
                'supplier_purchase_price' => $supplierPurchasePrice,
            ]);

            return $order;
        });

        try {
            DB::transaction(function () use ($order) {
                $order->load('items');
                app(StockInventoryService::class)->reserveForOrder($order);
            });
        } catch (Throwable $e) {
            report($e);
        }

        $order->load(['items', 'discountCard:id,card_number', 'orderGiftCertificates', 'giftCertificatePurchases', 'soldGiftCertificates.template']);

        try {
            app(CheckoutTelegramNotificationService::class)->notifyNewOrder($order);
        } catch (Throwable $e) {
            report($e);
        }

        return response()->json([
            'data' => new OrderResource($order),
            'message' => 'Заказ принят — менеджер свяжется с вами для уточнения деталей.',
        ], 201);
    }

    /**
     * @return array{is_available: bool, availability_source: string}
     */
    private function resolveAvailability(ProductVariantLink $variant): array
    {
        $mainWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        $supplierWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');
        $rows = WarehouseVariantStock::query()
            ->where('variant_id', $variant->id)
            ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
            ->get()
            ->keyBy('warehouse_id');
        $mainStock = $mainWarehouseId > 0 ? $rows->get($mainWarehouseId) : null;
        $supplierStock = $supplierWarehouseId > 0 ? $rows->get($supplierWarehouseId) : null;

        return CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);
    }

    private function makeVariantDisplayTitle(ProductVariantLink $variant): string
    {
        $parts = [];

        if ($variant->volume) {
            $parts[] = trim($variant->volume . ' ' . ($variant->volume_unit ?? ''));
        }

        if ($variant->concentration) {
            $parts[] = strtoupper((string) $variant->concentration);
        }

        if ($variant->edition) {
            $parts[] = (string) $variant->edition;
        }

        return !empty($parts)
            ? implode(' / ', $parts)
            : (string) ($variant->title ?? $variant->display_name ?? '');
    }

    private function resolveOrderClientId(?Client $authenticatedClient, string $normalizedPhone): ?int
    {
        if ($normalizedPhone === '') {
            return null;
        }

        $authPhone = $authenticatedClient
            ? Phone::normalize((string) $authenticatedClient->phone)
            : '';
        if ($authenticatedClient && $authPhone !== '' && $authPhone === $normalizedPhone) {
            return (int) $authenticatedClient->id;
        }

        return OrderAccountScope::resolveClientIdForPhone($normalizedPhone);
    }
}
