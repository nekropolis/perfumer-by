<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Modules\Catalog\Jobs\RunPriceRefreshJob;
use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\PriceRefreshRun;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Services\Pricing\SupplierPriceFileStorage;
use Modules\Warehouse\Models\Warehouse;

class PriceRefreshController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $runs = PriceRefreshRun::query()
            ->with('triggeredBy:id,name,email')
            ->orderByDesc('id')
            ->paginate(20);

        return response()->json($runs);
    }

    public function show(int $id): JsonResponse
    {
        $run = PriceRefreshRun::query()
            ->with('triggeredBy:id,name,email')
            ->findOrFail($id);

        return response()->json(['data' => $run]);
    }

    public function status(string $jobId): JsonResponse
    {
        $status = Cache::get(RunPriceRefreshJob::cacheKey($jobId));

        return response()->json(['data' => $status]);
    }

    public function active(): JsonResponse
    {
        $jobId = Cache::get(RunPriceRefreshJob::activeKey());
        if (!$jobId) {
            return response()->json(['data' => null]);
        }

        return response()->json([
            'data' => Cache::get(RunPriceRefreshJob::cacheKey((string) $jobId)),
        ]);
    }

    public function start(SupplierPriceFileStorage $priceFileStorage): JsonResponse
    {
        if (Cache::get(RunPriceRefreshJob::activeKey())) {
            return response()->json([
                'message' => 'Обновление цен уже выполняется',
            ], 409);
        }

        if (!$priceFileStorage->hasAnyStoredPriceFile()) {
            return response()->json([
                'message' => 'Сначала загрузите прайс хотя бы одного поставщика',
            ], 422);
        }

        $jobId = (string) Str::uuid();
        $run = PriceRefreshRun::query()->create([
            'status' => PriceRefreshRun::STATUS_QUEUED,
            'triggered_by' => Auth::id(),
            'job_id' => $jobId,
        ]);

        Cache::put(RunPriceRefreshJob::activeKey(), $jobId, now()->addHours(24));
        Cache::put(RunPriceRefreshJob::cacheKey($jobId), [
            'job_id' => $jobId,
            'run_id' => $run->id,
            'status' => PriceRefreshRun::STATUS_QUEUED,
            'message' => 'Задача поставлена в очередь',
            'updated_at' => now()->toDateTimeString(),
        ], now()->addHours(24));

        RunPriceRefreshJob::dispatch($run->id, $jobId);

        return response()->json([
            'message' => 'Обновление цен поставлено в очередь',
            'job_id' => $jobId,
            'run_id' => $run->id,
        ], 202);
    }

    public function uploadPriceFile(Request $request, SupplierPriceFileStorage $storage): JsonResponse
    {
        $validated = $request->validate([
            'supplier_id' => [
                'required',
                'integer',
                Rule::exists('suppliers', 'id')->whereNotIn('code', [Supplier::CODE_VANILLE]),
            ],
            'file' => ['required', 'file', 'mimes:xls,xlsx'],
        ]);

        $supplier = Supplier::query()->forPricing()->findOrFail((int) $validated['supplier_id']);
        $stored = $storage->store($request->file('file'), $supplier);

        return response()->json([
            'message' => 'Прайс загружен',
            'data' => [
                'supplier_id' => $supplier->id,
                'supplier_name' => $supplier->name,
                ...$stored,
            ],
        ]);
    }

    public function priceFiles(SupplierPriceFileStorage $storage): JsonResponse
    {
        $suppliers = Supplier::query()
            ->forPricing()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'code']);

        $data = $suppliers->map(function (Supplier $supplier) use ($storage): array {
            return [
                'supplier_id' => $supplier->id,
                'supplier_name' => $supplier->name,
                'supplier_code' => $supplier->code,
                ...$storage->getMeta((int) $supplier->id),
            ];
        })->values();

        return response()->json(['data' => $data]);
    }

    public function sources(): JsonResponse
    {
        return response()->json([
            'data' => [
                'suppliers' => Supplier::query()
                    ->forPricing()
                    ->where('is_active', true)
                    ->orderBy('name')
                    ->get(['id', 'name', 'code']),
                'warehouses' => Warehouse::query()
                    ->orderBy('name')
                    ->get(['id', 'name', 'code']),
            ],
        ]);
    }
}
