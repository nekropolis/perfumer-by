<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Services\Pricing\BynRateService;
use Modules\Warehouse\Models\Warehouse;

class PriceFormulaController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = PriceFormula::query()
            ->orderBy('source_type')
            ->orderBy('source_id')
            ->orderBy('sort_order')
            ->orderBy('id');

        if ($request->filled('source_type')) {
            $query->where('source_type', $request->string('source_type')->toString());
        }

        if ($request->filled('source_id')) {
            $query->where('source_id', (int) $request->input('source_id'));
        }

        return response()->json($query->paginate(30));
    }

    public function show(int $id): JsonResponse
    {
        $formula = PriceFormula::query()->findOrFail($id);

        return response()->json(['data' => $formula]);
    }

    public function store(Request $request, BynRateService $bynRate): JsonResponse
    {
        $validated = $this->validatePayload($request, $bynRate);
        $formula = PriceFormula::query()->create($validated);

        return response()->json([
            'message' => 'Формула создана',
            'data' => $formula,
        ], 201);
    }

    public function update(Request $request, int $id, BynRateService $bynRate): JsonResponse
    {
        $formula = PriceFormula::query()->findOrFail($id);
        $validated = $this->validatePayload($request, $bynRate);
        $formula->update($validated);

        return response()->json([
            'message' => 'Формула обновлена',
            'data' => $formula->fresh(),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $formula = PriceFormula::query()->findOrFail($id);
        $formula->delete();

        return response()->json([
            'message' => 'Формула удалена',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, BynRateService $bynRate): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'source_type' => ['required', Rule::in([
                PriceFormula::SOURCE_SUPPLIER,
                PriceFormula::SOURCE_WAREHOUSE,
            ])],
            'source_id' => ['required', 'integer', 'min:1'],
            'multiplier' => ['required', 'numeric', 'min:0'],
            'rub_rate' => ['nullable', 'numeric', 'min:0'],
            'addend' => ['required', 'numeric'],
            'round_precision' => ['required', 'integer', 'min:0', 'max:4'],
            'variant_rule_mode' => ['required', Rule::in([
                PriceFormula::MODE_APPLY_TO_ALL,
                PriceFormula::MODE_APPLY_WHEN_MATCH,
                PriceFormula::MODE_SKIP_WHEN_MATCH,
            ])],
            'variant_rules' => ['nullable', 'array'],
            'variant_rules.*.field' => ['required_with:variant_rules', Rule::in([
                'is_promotion',
                'is_preorder',
                'is_tester',
                'is_vial',
            ])],
            'variant_rules.*.op' => ['nullable', Rule::in(['eq', 'neq'])],
            'variant_rules.*.value' => ['required_with:variant_rules'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $this->assertSourceExists(
            (string) $validated['source_type'],
            (int) $validated['source_id'],
        );

        $validated['rub_rate'] = $bynRate->get();
        $validated['variant_rules'] = $this->normalizeVariantRules($validated['variant_rules'] ?? null);
        $validated['is_active'] = $validated['is_active'] ?? true;
        $validated['sort_order'] = $validated['sort_order'] ?? 0;

        return $validated;
    }

    private function assertSourceExists(string $sourceType, int $sourceId): void
    {
        $exists = match ($sourceType) {
            PriceFormula::SOURCE_SUPPLIER => Supplier::query()->forPricing()->whereKey($sourceId)->exists(),
            PriceFormula::SOURCE_WAREHOUSE => Warehouse::query()->whereKey($sourceId)->exists(),
            default => false,
        };

        if (!$exists) {
            abort(422, 'Источник формулы не найден');
        }
    }

    /**
     * @param  array<int, array<string, mixed>>|null  $rules
     * @return array<int, array{field: string, op: string, value: bool|int|float|string}>|null
     */
    private function normalizeVariantRules(?array $rules): ?array
    {
        if ($rules === null || $rules === []) {
            return null;
        }

        return array_values(array_map(static function (array $rule): array {
            return [
                'field' => (string) $rule['field'],
                'op' => (string) ($rule['op'] ?? 'eq'),
                'value' => is_bool($rule['value']) ? $rule['value'] : (bool) $rule['value'],
            ];
        }, $rules));
    }
}
