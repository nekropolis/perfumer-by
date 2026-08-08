<?php

namespace Modules\Catalog\Services\SeoDescription;

use RuntimeException;

class SeoDescriptionException extends RuntimeException
{
    public function __construct(string $message, public readonly bool $retryable = false)
    {
        parent::__construct($message);
    }
}
