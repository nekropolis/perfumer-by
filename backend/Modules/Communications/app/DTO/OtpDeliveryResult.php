<?php

namespace Modules\Communications\DTO;

class OtpDeliveryResult
{
    public function __construct(
        public readonly bool $sent,
        public readonly string $channel,
        public readonly string $status,
        public readonly ?string $providerMessageId = null,
        public readonly ?string $error = null,
        public readonly bool $fallbackUsed = false,
    ) {
    }
}
