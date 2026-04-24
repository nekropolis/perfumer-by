<?php

namespace Modules\Pages\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Pages\Models\CmsBlock;

class BlockController extends Controller
{
    public function showByCode(string $code): JsonResponse
    {
        $block = CmsBlock::query()
            ->where('code', $code)
            ->where('is_active', true)
            ->firstOrFail();

        return response()->json([
            'data' => [
                'id' => (int) $block->id,
                'name' => $block->name,
                'code' => $block->code,
                'content' => $block->content,
                'updated_at' => $block->updated_at,
            ],
        ]);
    }
}
