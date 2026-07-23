<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Modules\Checkout\Models\OrderTag;

class OrderTagController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));

        $tags = OrderTag::query()
            ->when($search !== '', function ($query) use ($search) {
                $query->where('name', 'like', "%{$search}%");
            })
            ->orderBy('name')
            ->get(['id', 'name', 'color']);

        return response()->json([
            'data' => $tags,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100', 'unique:order_tags,name'],
            'color' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        $tag = OrderTag::query()->create([
            'name' => trim($validated['name']),
            'color' => strtoupper($validated['color']),
        ]);

        return response()->json([
            'message' => 'Тег создан',
            'data' => $tag,
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tag = OrderTag::query()->findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('order_tags', 'name')->ignore($tag->id)],
            'color' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        $tag->update([
            'name' => trim($validated['name']),
            'color' => strtoupper($validated['color']),
        ]);

        return response()->json([
            'message' => 'Тег обновлён',
            'data' => $tag->fresh(),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $tag = OrderTag::query()->findOrFail($id);
        $tag->delete();

        return response()->json([
            'message' => 'Тег удалён',
        ]);
    }
}
