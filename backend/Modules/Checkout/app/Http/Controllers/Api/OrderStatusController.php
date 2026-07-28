<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Modules\Checkout\Models\OrderStatus;

class OrderStatusController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $activeOnly = $request->boolean('active');

        $statuses = OrderStatus::query()
            ->when($activeOnly, fn ($query) => $query->active())
            ->ordered()
            ->get([
                'id',
                'code',
                'name',
                'color',
                'sort_order',
                'is_active',
                'is_system',
            ]);

        return response()->json([
            'data' => $statuses,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'color' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'code' => ['nullable', 'string', 'max:50', 'regex:/^[a-z0-9_]+$/'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['sometimes', 'boolean'],
        ], [
            'name.required' => 'Укажите название статуса',
            'color.required' => 'Укажите цвет статуса',
            'color.regex' => 'Цвет должен быть в формате #RRGGBB',
            'code.regex' => 'Код может содержать только латиницу, цифры и _',
        ]);

        $name = trim($validated['name']);
        $this->assertUniqueName($name);

        $codeInput = isset($validated['code']) ? trim((string) $validated['code']) : '';
        $code = $codeInput !== ''
            ? Str::lower($codeInput)
            : OrderStatus::makeCodeFromName($name);
        $code = $this->ensureUniqueCode($code);

        $maxSort = (int) OrderStatus::query()->max('sort_order');
        $sortOrder = array_key_exists('sort_order', $validated) && $validated['sort_order'] !== null
            ? (int) $validated['sort_order']
            : $maxSort + 10;

        $status = OrderStatus::query()->create([
            'code' => $code,
            'name' => $name,
            'color' => strtoupper($validated['color']),
            'sort_order' => $sortOrder,
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
            'is_system' => false,
        ]);

        return response()->json([
            'message' => 'Статус создан',
            'data' => $status,
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $status = OrderStatus::query()->findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'color' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['sometimes', 'boolean'],
        ], [
            'name.required' => 'Укажите название статуса',
            'color.required' => 'Укажите цвет статуса',
            'color.regex' => 'Цвет должен быть в формате #RRGGBB',
        ]);

        $name = trim($validated['name']);
        $this->assertUniqueName($name, $status->id);

        $payload = [
            'name' => $name,
            'color' => strtoupper($validated['color']),
        ];

        if (array_key_exists('sort_order', $validated) && $validated['sort_order'] !== null) {
            $payload['sort_order'] = (int) $validated['sort_order'];
        }

        if (array_key_exists('is_active', $validated)) {
            $payload['is_active'] = (bool) $validated['is_active'];
        }

        $status->update($payload);

        return response()->json([
            'message' => 'Статус обновлён',
            'data' => $status->fresh(),
        ]);
    }

    private function assertUniqueName(string $name, ?int $ignoreId = null): void
    {
        if ($name === '') {
            throw ValidationException::withMessages([
                'name' => ['Укажите название статуса'],
            ]);
        }

        $query = OrderStatus::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name, 'UTF-8')]);

        if ($ignoreId !== null && $ignoreId > 0) {
            $query->where('id', '!=', $ignoreId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'name' => ['Статус с таким названием уже существует'],
            ]);
        }
    }

    private function ensureUniqueCode(string $code): string
    {
        $base = $code !== '' ? $code : 'status';
        $candidate = $base;
        $i = 2;

        while (OrderStatus::query()->where('code', $candidate)->exists()) {
            $suffix = '_'.$i;
            $candidate = Str::limit($base, 50 - strlen($suffix), '').$suffix;
            $i++;
        }

        return $candidate;
    }
}
