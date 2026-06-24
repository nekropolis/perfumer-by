<?php

namespace Modules\Catalog\Services\Pricing;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Modules\Catalog\Models\SellerOneSetting;
use Modules\Catalog\Models\Supplier;
use Modules\ImportExport\Services\Vanille\Parsers\SellerOneSpreadsheetParser;

final class SupplierPriceFileStorage
{
    public function __construct(
        private readonly SellerOneSpreadsheetParser $spreadsheetParser,
    ) {
    }

    public const SETTING_PATH_PREFIX = 'supplier_price_file.';

    public function pathKey(int $supplierId): string
    {
        return self::SETTING_PATH_PREFIX . $supplierId . '.storage_path';
    }

    public function nameKey(int $supplierId): string
    {
        return self::SETTING_PATH_PREFIX . $supplierId . '.original_name';
    }

    public function uploadedAtKey(int $supplierId): string
    {
        return self::SETTING_PATH_PREFIX . $supplierId . '.uploaded_at';
    }

    /**
     * @return array{storage_path: string, original_name: string, uploaded_at: string}
     */
    public function store(UploadedFile $file, Supplier $supplier): array
    {
        $extension = strtolower((string) $file->getClientOriginalExtension());
        if (!in_array($extension, ['xls', 'xlsx'], true)) {
            throw ValidationException::withMessages([
                'file' => 'Допустимы только файлы XLS и XLSX',
            ]);
        }

        try {
            $this->spreadsheetParser->readRowsFromFile($file);
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages([
                'file' => $e->getMessage(),
            ]);
        }

        $directory = 'supplier-price-files/' . $supplier->id;
        $storagePath = $directory . '/current.' . $extension;

        Storage::disk('local')->putFileAs(
            $directory,
            $file,
            'current.' . $extension,
        );

        $originalName = (string) $file->getClientOriginalName();
        $uploadedAt = now()->toDateTimeString();

        SellerOneSetting::query()->updateOrCreate(
            ['key' => $this->pathKey($supplier->id)],
            ['value' => $storagePath],
        );
        SellerOneSetting::query()->updateOrCreate(
            ['key' => $this->nameKey($supplier->id)],
            ['value' => $originalName],
        );
        SellerOneSetting::query()->updateOrCreate(
            ['key' => $this->uploadedAtKey($supplier->id)],
            ['value' => $uploadedAt],
        );

        return [
            'storage_path' => $storagePath,
            'original_name' => $originalName,
            'uploaded_at' => $uploadedAt,
        ];
    }

    public function getAbsolutePath(int $supplierId): ?string
    {
        $storedPath = SellerOneSetting::query()
            ->where('key', $this->pathKey($supplierId))
            ->value('value');

        if (!is_string($storedPath) || trim($storedPath) === '') {
            return null;
        }

        $disk = Storage::disk('local');
        if (!$disk->exists($storedPath)) {
            return null;
        }

        return $disk->path($storedPath);
    }

    /**
     * @return array{storage_path: ?string, original_name: ?string, uploaded_at: ?string}
     */
    public function getMeta(int $supplierId): array
    {
        $keys = [
            $this->pathKey($supplierId),
            $this->nameKey($supplierId),
            $this->uploadedAtKey($supplierId),
        ];

        $stored = SellerOneSetting::query()
            ->whereIn('key', $keys)
            ->pluck('value', 'key');

        $path = trim((string) ($stored->get($this->pathKey($supplierId)) ?? ''));
        $name = trim((string) ($stored->get($this->nameKey($supplierId)) ?? ''));
        $uploadedAt = trim((string) ($stored->get($this->uploadedAtKey($supplierId)) ?? ''));

        return [
            'storage_path' => $path !== '' ? $path : null,
            'original_name' => $name !== '' ? $name : null,
            'uploaded_at' => $uploadedAt !== '' ? $uploadedAt : null,
        ];
    }

    public function isPersistentStoragePath(string $storagePath): bool
    {
        return str_starts_with($storagePath, 'supplier-price-files/');
    }

    public function hasAnyStoredPriceFile(): bool
    {
        foreach (Supplier::query()->forPricing()->where('is_active', true)->pluck('id') as $supplierId) {
            if ($this->getAbsolutePath((int) $supplierId) !== null) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<array{supplier_id: int, supplier_name: string, supplier_code: string}>
     */
    public function listStoredPricingSuppliers(): array
    {
        $result = [];
        $suppliers = Supplier::query()
            ->forPricing()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'code']);

        foreach ($suppliers as $supplier) {
            if ($this->getAbsolutePath((int) $supplier->id) === null) {
                continue;
            }
            $result[] = [
                'supplier_id' => (int) $supplier->id,
                'supplier_name' => (string) $supplier->name,
                'supplier_code' => (string) $supplier->code,
            ];
        }

        return $result;
    }
}
