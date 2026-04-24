<?php

namespace Modules\Pages\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Modules\ImportExport\Support\VanilleHelper;
use Modules\Pages\Models\CmsBlock;

class BlockAdminController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = CmsBlock::query()->orderByDesc('id');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        return response()->json($query->paginate(20));
    }

    public function show(int $id): JsonResponse
    {
        $block = CmsBlock::query()->findOrFail($id);

        return response()->json([
            'data' => $block,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request);
        $code = VanilleHelper::slugify((string) $validated['code']);

        if ($code === '') {
            return response()->json(['message' => 'Код обязателен'], 422);
        }

        $block = CmsBlock::query()->create([
            'name' => trim((string) $validated['name']),
            'code' => $code,
            'content' => VanilleHelper::normalizeNullableString($validated['content'] ?? null),
            'is_active' => (bool) ($validated['is_active'] ?? true),
        ]);

        $this->auditLogService->record(
            AuditLogService::ENTITY_CMS_PAGE,
            (int) $block->id,
            AuditLogService::ACTION_CREATED,
            'CMS-блок создан',
            [
                'name' => $block->name,
                'code' => $block->code,
            ],
        );

        return response()->json([
            'message' => 'Блок создан',
            'data' => $block,
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $block = CmsBlock::query()->findOrFail($id);
        $validated = $this->validatePayload($request, $block->id);
        $code = VanilleHelper::slugify((string) $validated['code']);

        if ($code === '') {
            return response()->json(['message' => 'Код обязателен'], 422);
        }

        $block->update([
            'name' => trim((string) $validated['name']),
            'code' => $code,
            'content' => VanilleHelper::normalizeNullableString($validated['content'] ?? null),
            'is_active' => (bool) ($validated['is_active'] ?? $block->is_active),
        ]);

        $this->auditLogService->record(
            AuditLogService::ENTITY_CMS_PAGE,
            (int) $block->id,
            AuditLogService::ACTION_UPDATED,
            'CMS-блок обновлен',
            [
                'name' => $block->name,
                'code' => $block->code,
            ],
        );

        return response()->json([
            'message' => 'Блок обновлен',
            'data' => $block->fresh(),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $block = CmsBlock::query()->findOrFail($id);
        $name = $block->name;
        $code = $block->code;
        $entityId = (int) $block->id;
        $block->delete();

        $this->auditLogService->record(
            AuditLogService::ENTITY_CMS_PAGE,
            $entityId,
            AuditLogService::ACTION_DELETED,
            'CMS-блок удален',
            [
                'name' => $name,
                'code' => $code,
            ],
        );

        return response()->json([
            'message' => 'Блок удален',
        ]);
    }

    public function uploadContentImage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $path = $validated['image']->store('cms/blocks', 'public');
        $url = Storage::url($path);
        $absolute = preg_match('#^https?://#i', $url) ? $url : rtrim((string) config('app.url'), '/') . $url;

        $pictureHtml = sprintf(
            '<picture><img src="%s" alt="" loading="lazy" decoding="async" /></picture>',
            e($absolute)
        );

        return response()->json([
            'message' => 'Изображение загружено',
            'data' => [
                'url' => $absolute,
                'path' => $path,
                'picture_html' => $pictureHtml,
            ],
        ], 201);
    }

    private function validatePayload(Request $request, ?int $ignoreId = null): array
    {
        $codeRules = ['required', 'string', 'max:255'];
        $codeRules[] = $ignoreId
            ? Rule::unique('cms_blocks', 'code')->ignore($ignoreId)
            : 'unique:cms_blocks,code';

        return $request->validate([
            'is_active' => ['nullable', 'boolean'],
            'name' => ['required', 'string', 'max:255'],
            'code' => $codeRules,
            'content' => ['nullable', 'string'],
        ]);
    }
}
