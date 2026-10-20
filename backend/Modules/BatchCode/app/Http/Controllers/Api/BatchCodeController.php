<?php

namespace Modules\BatchCode\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Modules\BatchCode\Http\Requests\CheckBatchCodeRequest;
use Modules\BatchCode\Services\BatchCodeChecker;
use Modules\BatchCode\Services\BatchCodeRuleRepository;
use Modules\Catalog\Models\Brand;

class BatchCodeController extends Controller
{
    public function brands(BatchCodeRuleRepository $rules): JsonResponse
    {
        $supportBySlug = [];
        foreach ($rules->all() as $rule) {
            if ($rule['status'] === 'not_supported') {
                continue;
            }
            foreach ($rule['brands'] as $slug) {
                $supportBySlug[$slug] = $rule['status'];
            }
        }

        if ($supportBySlug === []) {
            return response()->json(['data' => []]);
        }

        $rows = Brand::query()
            ->whereIn('slug', array_keys($supportBySlug))
            ->orderBy('slug')
            ->get(['slug', 'name'])
            ->map(fn (Brand $brand): array => [
                'slug' => $brand->slug,
                'name' => $brand->name,
                'support' => $supportBySlug[$brand->slug],
            ])
            ->values();

        return response()->json(['data' => $rows]);
    }

    public function check(CheckBatchCodeRequest $request, BatchCodeChecker $checker): JsonResponse
    {
        $brand = Brand::query()->where('slug', $request->validated('brand_slug'))->firstOrFail();
        $payload = $checker->check($brand, (string) $request->validated('code'));

        Log::info('batch_code.check', [
            'status' => $payload['status'],
            'brand_slug' => $brand->slug,
            'rule_id' => $payload['rule_id'],
        ]);

        return response()->json(['data' => $payload]);
    }
}
