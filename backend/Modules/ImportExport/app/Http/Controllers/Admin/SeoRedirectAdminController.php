<?php

namespace Modules\ImportExport\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\ImportExport\Support\SeoRedirectCache;

class SeoRedirectAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DB::table('seo_redirects');

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search): void {
                $q->where('from_path', 'like', "%{$search}%")
                    ->orWhere('to_path', 'like', "%{$search}%")
                    ->orWhere('note', 'like', "%{$search}%");
            });
        }

        if ($request->filled('is_active')) {
            $value = (string) $request->input('is_active');
            if ($value === '1' || $value === '0') {
                $query->where('is_active', $value === '1');
            }
        }

        if ($request->filled('http_code')) {
            $code = (int) $request->input('http_code');
            if (in_array($code, [301, 302, 410], true)) {
                $query->where('http_code', $code);
            }
        }

        $items = $query
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 25));

        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_path' => ['required', 'string', 'max:500', 'unique:seo_redirects,from_path'],
            'to_path' => ['nullable', 'string', 'max:500'],
            'http_code' => ['required', 'integer', Rule::in([301, 302, 410])],
            'is_active' => ['nullable', 'boolean'],
            'source' => ['nullable', 'string', 'max:64'],
            'legacy_entity_type' => ['nullable', 'string', 'max:32'],
            'legacy_entity_id' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string'],
        ]);

        [$fromPath, $toPath] = $this->normalizePaths($validated['from_path'], $validated['to_path'] ?? null);
        $this->assertRedirectConsistency($fromPath, $toPath, (int) $validated['http_code']);

        $id = DB::table('seo_redirects')->insertGetId([
            'from_path' => $fromPath,
            'to_path' => $toPath,
            'http_code' => (int) $validated['http_code'],
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'source' => $validated['source'] ?? 'manual',
            'legacy_entity_type' => $validated['legacy_entity_type'] ?? null,
            'legacy_entity_id' => $validated['legacy_entity_id'] ?? null,
            'note' => $validated['note'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        SeoRedirectCache::flush();

        return response()->json([
            'message' => 'Редирект создан',
            'data' => DB::table('seo_redirects')->where('id', $id)->first(),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $existing = DB::table('seo_redirects')->where('id', $id)->first();
        abort_unless($existing, 404, 'Redirect not found');

        $validated = $request->validate([
            'from_path' => ['required', 'string', 'max:500', Rule::unique('seo_redirects', 'from_path')->ignore($id)],
            'to_path' => ['nullable', 'string', 'max:500'],
            'http_code' => ['required', 'integer', Rule::in([301, 302, 410])],
            'is_active' => ['nullable', 'boolean'],
            'source' => ['nullable', 'string', 'max:64'],
            'legacy_entity_type' => ['nullable', 'string', 'max:32'],
            'legacy_entity_id' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string'],
        ]);

        [$fromPath, $toPath] = $this->normalizePaths($validated['from_path'], $validated['to_path'] ?? null);
        $this->assertRedirectConsistency($fromPath, $toPath, (int) $validated['http_code']);

        DB::table('seo_redirects')
            ->where('id', $id)
            ->update([
                'from_path' => $fromPath,
                'to_path' => $toPath,
                'http_code' => (int) $validated['http_code'],
                'is_active' => (bool) ($validated['is_active'] ?? false),
                'source' => $validated['source'] ?? 'manual',
                'legacy_entity_type' => $validated['legacy_entity_type'] ?? null,
                'legacy_entity_id' => $validated['legacy_entity_id'] ?? null,
                'note' => $validated['note'] ?? null,
                'updated_at' => now(),
            ]);

        SeoRedirectCache::flush();

        return response()->json([
            'message' => 'Редирект обновлён',
            'data' => DB::table('seo_redirects')->where('id', $id)->first(),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $deleted = DB::table('seo_redirects')->where('id', $id)->delete();
        if (! $deleted) {
            return response()->json(['message' => 'Редирект не найден'], 404);
        }

        SeoRedirectCache::flush();

        return response()->json(['message' => 'Редирект удалён']);
    }

    /**
     * @return array{0: string, 1: string|null}
     */
    private function normalizePaths(string $fromPath, ?string $toPath): array
    {
        $normalize = static function (?string $path): ?string {
            if ($path === null) {
                return null;
            }
            $trimmed = trim($path);
            if ($trimmed === '') {
                return null;
            }
            return str_starts_with($trimmed, '/') ? $trimmed : '/'.$trimmed;
        };

        return [
            $normalize($fromPath) ?? '/',
            $normalize($toPath),
        ];
    }

    private function assertRedirectConsistency(string $fromPath, ?string $toPath, int $httpCode): void
    {
        if ($httpCode === 410) {
            return;
        }

        if ($toPath === null) {
            abort(response()->json(['message' => 'to_path обязателен для 301/302'], 422));
        }

        if ($fromPath === $toPath) {
            abort(response()->json(['message' => 'from_path и to_path не могут совпадать'], 422));
        }
    }
}
