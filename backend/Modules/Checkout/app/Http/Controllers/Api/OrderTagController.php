<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
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
            'name' => ['required', 'string', 'max:100'],
            'color' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ], [
            'name.required' => 'Укажите название тега',
            'color.required' => 'Укажите цвет тега',
            'color.regex' => 'Цвет должен быть в формате #RRGGBB',
        ]);

        $name = trim($validated['name']);
        $this->assertUniqueTagName($name);

        $tag = OrderTag::query()->create([
            'name' => $name,
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
            'name' => ['required', 'string', 'max:100'],
            'color' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ], [
            'name.required' => 'Укажите название тега',
            'color.required' => 'Укажите цвет тега',
            'color.regex' => 'Цвет должен быть в формате #RRGGBB',
        ]);

        $name = trim($validated['name']);
        $this->assertUniqueTagName($name, $tag->id);

        $tag->update([
            'name' => $name,
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

    private function assertUniqueTagName(string $name, ?int $ignoreId = null): void
    {
        if ($name === '') {
            throw ValidationException::withMessages([
                'name' => ['Укажите название тега'],
            ]);
        }

        $query = OrderTag::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name, 'UTF-8')]);

        if ($ignoreId !== null && $ignoreId > 0) {
            $query->where('id', '!=', $ignoreId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'name' => ['Тег с таким названием уже существует'],
            ]);
        }
    }
}
