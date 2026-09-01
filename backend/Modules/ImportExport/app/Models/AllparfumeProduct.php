<?php

namespace Modules\ImportExport\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Catalog\Models\Product;

class AllparfumeProduct extends Model
{
    protected $fillable = [
        'brand_slug',
        'brand_name',
        'external_slug',
        'source_url',
        'source_url_hash',
        'title',
        'name',
        'gender_label',
        'listing_min_price',
        'listing_max_price',
        'product_id',
        'external_id',
        'match_status',
        'match_confidence',
        'match_payload',
        'last_crawled_at',
        'payload',
    ];

    protected $casts = [
        'listing_min_price' => 'decimal:2',
        'listing_max_price' => 'decimal:2',
        'external_id' => 'integer',
        'match_payload' => 'array',
        'payload' => 'array',
        'last_crawled_at' => 'datetime',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(AllparfumeVariant::class);
    }

    public function shopOffers(): HasMany
    {
        return $this->hasMany(AllparfumeShopOffer::class);
    }

    /**
     * Каталожные товары из ID-файла: product_id + payload.id_file_product_ids.
     *
     * @return list<int>
     */
    public function catalogProductIds(): array
    {
        $ids = [];
        $primary = (int) ($this->product_id ?? 0);
        if ($primary > 0) {
            $ids[] = $primary;
        }

        $extra = is_array($this->payload) ? ($this->payload['id_file_product_ids'] ?? null) : null;
        if (is_array($extra)) {
            foreach ($extra as $id) {
                $id = (int) $id;
                if ($id > 0) {
                    $ids[] = $id;
                }
            }
        }

        return array_values(array_unique($ids));
    }

    /**
     * URL витрины, как пришли в ID-файле (в т.ч. старые slug с редиректом).
     *
     * @return list<string>
     */
    public function idFilePerfumerUrls(): array
    {
        $urls = is_array($this->payload) ? ($this->payload['id_file_perfumer_urls'] ?? null) : null;
        if (! is_array($urls)) {
            return [];
        }

        $out = [];
        foreach ($urls as $url) {
            if (! is_string($url)) {
                continue;
            }
            $url = trim($url);
            if ($url !== '' && ! in_array($url, $out, true)) {
                $out[] = $url;
            }
        }

        return $out;
    }
}
