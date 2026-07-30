<?php

use Illuminate\Support\Facades\Route;
use Modules\Catalog\Http\Controllers\Admin\AttributeController;
use Modules\Catalog\Http\Controllers\Admin\AttributeOptionController;
use Modules\Catalog\Http\Controllers\Admin\BrandController;
use Modules\Catalog\Http\Controllers\Admin\AdminProductLinkSearchController;
use Modules\Catalog\Http\Controllers\Admin\PriceFormulaController;
use Modules\Catalog\Http\Controllers\Admin\PriceRefreshController;
use Modules\Catalog\Http\Controllers\Admin\WarehouseManualPriceReviewController;
use Modules\Catalog\Http\Controllers\Admin\ProductAdminController;
use Modules\Catalog\Http\Controllers\Admin\ProductAttributeAdminController;
use Modules\Catalog\Http\Controllers\Admin\ProductAttributeValueController;
use Modules\Catalog\Http\Controllers\Admin\ProductImageAdminController;
use Modules\Catalog\Http\Controllers\Admin\ProductVariantAdminController;
use Modules\Catalog\Http\Controllers\Api\ProductController;
use Modules\Catalog\Http\Controllers\Admin\VanilleImportController;

Route::prefix('catalog')->group(function () {
    Route::get('/bootstrap', [ProductController::class, 'bootstrap']);
    Route::get('/brands', [ProductController::class, 'brands']);
    Route::get('/brands/{slug}', [ProductController::class, 'brandBySlug']);
    Route::get('/filters', [ProductController::class, 'filters']);
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/smart-search', [ProductController::class, 'smartSearch']);
    Route::get('/products/{slug}/similar', [ProductController::class, 'similarProducts']);
    Route::get('/products/{slug}', [ProductController::class, 'show']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/import-export/vanille')->group(function () {
    Route::post('/pipeline/new-products', [VanilleImportController::class, 'pipelineNewProducts']);
    Route::post('/pipeline/refresh-all', [VanilleImportController::class, 'pipelineRefreshAll']);
    Route::post('/parse-products', [VanilleImportController::class, 'parseProducts']);
    Route::post('/parse-product-url', [VanilleImportController::class, 'parseSingleProductUrl']);
    Route::post('/single-url-media-follow-up', [VanilleImportController::class, 'singleUrlMediaFollowUp']);
    Route::post('/collect-links', [VanilleImportController::class, 'collectLinks']);
    Route::post('/parse-brands', [VanilleImportController::class, 'parseBrands']);
    Route::get('/parse-status', [VanilleImportController::class, 'vanilleParseStatus']);
    Route::get('/import-jobs', [VanilleImportController::class, 'listImportJobs']);
    Route::get('/import-jobs/{id}/logs', [VanilleImportController::class, 'listImportJobLogs']);
    Route::get('/supplier-products', [VanilleImportController::class, 'supplierProducts']);
    Route::post('/import-parsed-products', [VanilleImportController::class, 'importParsedProducts']);
    Route::post('/parse-catalog-images', [VanilleImportController::class, 'parseCatalogImages']);
    Route::post('/rewrite-descriptions', [VanilleImportController::class, 'rewriteDescriptions']);
    // Seller One / прайс (те же обработчики, что seller-one — fallback URL во фронте)
    Route::post('/supplier-price/preview', [VanilleImportController::class, 'previewSupplierPrice']);
    Route::post('/supplier-price/start', [VanilleImportController::class, 'startSellerOneParse']);
    Route::post('/supplier-price/cancel', [VanilleImportController::class, 'cancelSellerOneParse']);
    Route::get('/supplier-price/active', [VanilleImportController::class, 'sellerOneActiveStatus']);
    Route::get('/supplier-price/status/{jobId}', [VanilleImportController::class, 'sellerOneParseStatus']);
    Route::post('/supplier-price/apply', [VanilleImportController::class, 'applySupplierPrice']);
    Route::post('/supplier-price/refresh-linked/start', [VanilleImportController::class, 'startSellerOneRefreshLinkedPrices']);
    Route::get('/supplier-price/refresh-linked/status/{jobId}', [VanilleImportController::class, 'sellerOneRefreshLinkedStatus']);
    Route::get('/duplicate-variant-links', [VanilleImportController::class, 'sellerOneDuplicateVariantLinks']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/import-export/seller-one')->group(function () {
    Route::post('/supplier-price/preview', [VanilleImportController::class, 'previewSupplierPrice']);
    Route::post('/supplier-price/start', [VanilleImportController::class, 'startSellerOneParse']);
    Route::post('/supplier-price/cancel', [VanilleImportController::class, 'cancelSellerOneParse']);
    // Discovery-эндпоинт для виджета задач в шапке: возвращает текущий активный
    // Seller One parse без необходимости знать его jobId на клиенте.
    Route::get('/supplier-price/active', [VanilleImportController::class, 'sellerOneActiveStatus']);
    Route::get('/supplier-price/status/{jobId}', [VanilleImportController::class, 'sellerOneParseStatus']);
    Route::post('/supplier-price/apply', [VanilleImportController::class, 'applySupplierPrice']);
    Route::post('/supplier-price/refresh-linked/start', [VanilleImportController::class, 'startSellerOneRefreshLinkedPrices']);
    Route::get('/supplier-price/refresh-linked/status/{jobId}', [VanilleImportController::class, 'sellerOneRefreshLinkedStatus']);
    Route::get('/supplier-products', [VanilleImportController::class, 'sellerOneSupplierProducts']);
    Route::get('/duplicate-variant-links', [VanilleImportController::class, 'sellerOneDuplicateVariantLinks']);
    Route::post('/supplier-products/force-link', [VanilleImportController::class, 'forceLinkSellerOneProduct']);
    Route::post('/supplier-products/reset-link', [VanilleImportController::class, 'resetSellerOneProductLink']);
    Route::patch('/supplier-products/parsing-active', [VanilleImportController::class, 'updateSellerOneSupplierProductParsingActive']);
    Route::get('/pricing-settings', [VanilleImportController::class, 'sellerOnePricingSettings']);
    Route::put('/pricing-settings', [VanilleImportController::class, 'updateSellerOnePricingSettings']);
    Route::get('/rules', [VanilleImportController::class, 'sellerOneRules']);
    Route::post('/rules', [VanilleImportController::class, 'createSellerOneRule']);
    Route::put('/rules/{id}', [VanilleImportController::class, 'updateSellerOneRule']);
    Route::delete('/rules/{id}', [VanilleImportController::class, 'deleteSellerOneRule']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/brands')->group(function () {
    Route::get('/', [BrandController::class, 'index']);
    Route::get('/{id}', [BrandController::class, 'show']);
    Route::post('/', [BrandController::class, 'store']);
    Route::post('/sync-from-vanille-json', [BrandController::class, 'syncFromVanilleJson']);
    Route::put('/{id}', [BrandController::class, 'update']);
    Route::delete('/{id}', [BrandController::class, 'destroy']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/products')->group(function () {
    Route::get('/', [ProductAdminController::class, 'index']);
    Route::get('/link-search', [AdminProductLinkSearchController::class, 'index']);
    Route::get('/search-smart', [ProductAdminController::class, 'smartSearch']);
    Route::post('/', [ProductAdminController::class, 'store']);
    Route::post('/cache/reset', [ProductAdminController::class, 'resetApiCache']);
    Route::get('/variant-definitions', [ProductVariantAdminController::class, 'catalog']);
    Route::get('/variant-definitions/{id}', [ProductVariantAdminController::class, 'showDefinition']);
    Route::post('/variant-definitions', [ProductVariantAdminController::class, 'storeDefinition']);
    Route::put('/variant-definitions/{id}', [ProductVariantAdminController::class, 'updateDefinition']);
    Route::delete('/variant-definitions/{id}', [ProductVariantAdminController::class, 'destroyDefinition']);
    Route::get('/brands/options', [ProductAdminController::class, 'brands']);
    Route::get('/{id}', [ProductAdminController::class, 'show']);
    Route::get('/{id}/variant-suppliers', [ProductAdminController::class, 'variantSuppliers']);
    Route::put('/{id}', [ProductAdminController::class, 'update']);
    Route::post('/{id}/rewrite-description', [ProductAdminController::class, 'rewriteDescription']);
    Route::delete('/{id}', [ProductAdminController::class, 'destroy']);
    Route::post('/{id}/images', [ProductImageAdminController::class, 'upload']);
    Route::put('/{id}/images/{imageId}/usage-type', [ProductImageAdminController::class, 'updateUsageType']);
    Route::post('/{id}/images/{imageId}/watermark-decision', [ProductImageAdminController::class, 'watermarkDecision']);
    Route::put('/{id}/images/reorder', [ProductImageAdminController::class, 'reorder']);
    Route::put('/{id}/images/{imageId}/set-main', [ProductImageAdminController::class, 'setMain']);
    Route::delete('/{id}/images/{imageId}', [ProductImageAdminController::class, 'destroy']);

    Route::post('/{id}/attributes', [ProductAttributeAdminController::class, 'store']);
    Route::put('/{id}/attributes/{attributeId}', [ProductAttributeAdminController::class, 'update']);
    Route::delete('/{id}/attributes/{attributeId}', [ProductAttributeAdminController::class, 'destroy']);

    Route::post('/{id}/attribute-values', [ProductAttributeValueController::class, 'store']);
    Route::put('/{id}/attribute-values/{valueId}', [ProductAttributeValueController::class, 'update']);
    Route::delete('/{id}/attribute-values/{valueId}', [ProductAttributeValueController::class, 'destroy']);

    Route::get('/{id}/variants', [ProductVariantAdminController::class, 'index']);
    Route::post('/{id}/variants', [ProductVariantAdminController::class, 'store']);
    Route::put('/{id}/variants/{variantId}', [ProductVariantAdminController::class, 'update']);
    Route::delete('/{id}/variants/{variantId}', [ProductVariantAdminController::class, 'destroy']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/pricing')->group(function () {
    Route::get('/refresh/runs', [PriceRefreshController::class, 'index']);
    Route::get('/refresh/runs/{id}', [PriceRefreshController::class, 'show']);
    Route::get('/refresh/in-stock-preview', [PriceRefreshController::class, 'inStockPreview']);
    Route::post('/refresh/start', [PriceRefreshController::class, 'start']);
    Route::get('/refresh/active', [PriceRefreshController::class, 'active']);
    Route::get('/refresh/status/{jobId}', [PriceRefreshController::class, 'status']);
    Route::get('/price-files', [PriceRefreshController::class, 'priceFiles']);
    Route::post('/price-files/upload', [PriceRefreshController::class, 'uploadPriceFile']);
    Route::get('/sources', [PriceRefreshController::class, 'sources']);
    Route::get('/byn-rate', [PriceRefreshController::class, 'bynRate']);
    Route::put('/byn-rate', [PriceRefreshController::class, 'updateBynRate']);

    Route::get('/formulas', [PriceFormulaController::class, 'index']);
    Route::post('/formulas', [PriceFormulaController::class, 'store']);
    Route::get('/formulas/{id}', [PriceFormulaController::class, 'show']);
    Route::put('/formulas/{id}', [PriceFormulaController::class, 'update']);
    Route::delete('/formulas/{id}', [PriceFormulaController::class, 'destroy']);

    Route::get('/manual-reviews/stats', [WarehouseManualPriceReviewController::class, 'stats']);
    Route::get('/manual-reviews', [WarehouseManualPriceReviewController::class, 'index']);
    Route::post('/manual-reviews/{id}/preview-retail', [WarehouseManualPriceReviewController::class, 'previewRetail']);
    Route::patch('/manual-reviews/{id}', [WarehouseManualPriceReviewController::class, 'update']);
});

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('admin/attributes')->group(function () {
    Route::get('/', [AttributeController::class, 'index']);
    Route::get('/binding-options', [AttributeController::class, 'bindingOptions']);
    Route::post('/', [AttributeController::class, 'store']);
    Route::get('/{id}', [AttributeController::class, 'show']);
    Route::put('/{id}', [AttributeController::class, 'update']);
    Route::delete('/{id}', [AttributeController::class, 'destroy']);

    Route::post('/{attributeId}/options', [AttributeOptionController::class, 'store']);
    Route::put('/{attributeId}/options/{optionId}', [AttributeOptionController::class, 'update']);
    Route::delete('/{attributeId}/options/{optionId}', [AttributeOptionController::class, 'destroy']);
});
