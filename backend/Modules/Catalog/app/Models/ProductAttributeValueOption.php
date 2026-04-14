<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductAttributeValueOption extends Model
{
    protected $fillable = [
        'product_attribute_value_id',
        'product_attribute_option_id',
    ];

    public function productAttributeValue(): BelongsTo
    {
        return $this->belongsTo(ProductAttributeValue::class);
    }

    public function productAttributeOption(): BelongsTo
    {
        return $this->belongsTo(ProductAttributeOption::class);
    }
}
