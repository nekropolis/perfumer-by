<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Catalog\Models\ProductAttribute;

class AttributeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ProductAttribute::query()
            ->withCount('options')
            ->orderBy('sort_order')
            ->orderBy('name');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());

            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%");
            });
        }

        if ($request->filled('type')) {
            $query->where('type', $request->string('type')->toString());
        }

        $attributes = $query->paginate(20);

        return response()->json($attributes);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(['text', 'select', 'multiselect'])],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $attribute = ProductAttribute::query()->create([
            'name' => $validated['name'],
            'type' => $validated['type'],
            'sort_order' => $validated['sort_order'] ?? 0,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json([
            'message' => 'Атрибут создана',
            'data' => $attribute->loadCount('options'),
        ], 201);
    }

    public function show(int $id): JsonResponse
    {
        $attribute = ProductAttribute::query()
            ->with(['options' => fn ($q) => $q->orderBy('sort_order')->orderBy('name')])
            ->withCount('options')
            ->findOrFail($id);

        return response()->json([
            'data' => $attribute,
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $attribute = ProductAttribute::query()->findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(['text', 'select', 'multiselect'])],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $attribute->update([
            'name' => $validated['name'],
            'type' => $validated['type'],
            'sort_order' => $validated['sort_order'] ?? $attribute->sort_order,
            'is_active' => $validated['is_active'] ?? $attribute->is_active,
        ]);

        return response()->json([
            'message' => 'Атрибут обновлен',
            'data' => $attribute->fresh()->loadCount('options'),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $attribute = ProductAttribute::query()
            ->withCount(['productValues', 'options'])
            ->findOrFail($id);

        if ($attribute->product_values_count > 0) {
            return response()->json([
                'message' => 'Нельзя удалить атрибут, он привязана к товарам',
            ], 422);
        }

        $attribute->delete();

        return response()->json([
            'message' => 'Атрибут удален',
        ]);
    }

    public function bindingOptions(): JsonResponse
    {
        $attributes = ProductAttribute::query()
            ->where('is_active', true)
            ->with([
                'activeOptions' => fn ($q) => $q->orderBy('sort_order')->orderBy('name'),
            ])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $attributes->map(function ($attribute) {
                return [
                    'id' => $attribute->id,
                    'name' => $attribute->name,
                    'type' => $attribute->type,
                    'options' => $attribute->activeOptions->map(function ($option) {
                        return [
                            'id' => $option->id,
                            'name' => $option->name,
                            'sort_order' => $option->sort_order,
                        ];
                    })->values(),
                ];
            })->values(),
        ]);
    }
}
