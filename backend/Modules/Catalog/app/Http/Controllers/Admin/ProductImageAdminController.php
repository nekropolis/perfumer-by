<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Services\ProductImageAdminService;

class ProductImageAdminController extends Controller
{
    public function __construct(
        private readonly ProductImageAdminService $service
    ) {
    }

    public function upload(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);
        $validated = $request->validate([
            'images' => ['required', 'array', 'min:1', 'max:20'],
            'images.*' => ['required', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        return response()->json([
            'message' => 'Картинки загружены',
            'data' => $this->service->upload($product, $validated['images']),
        ], 201);
    }

    public function reorder(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);
        $validated = $request->validate([
            'image_ids' => ['required', 'array', 'min:1'],
            'image_ids.*' => ['required', 'integer'],
        ]);

        return response()->json([
            'message' => 'Порядок картинок обновлён',
            'data' => $this->service->reorder($product, $validated['image_ids']),
        ]);
    }

    public function setMain(int $id, int $imageId): JsonResponse
    {
        $product = Product::query()->findOrFail($id);

        return response()->json([
            'message' => 'Главная картинка обновлена',
            'data' => $this->service->setMain($product, $imageId),
        ]);
    }

    public function destroy(int $id, int $imageId): JsonResponse
    {
        $product = Product::query()->findOrFail($id);

        return response()->json([
            'message' => 'Картинка удалена',
            'data' => $this->service->delete($product, $imageId),
        ]);
    }
}
