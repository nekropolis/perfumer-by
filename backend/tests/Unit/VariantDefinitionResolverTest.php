<?php

namespace Tests\Unit;

use Modules\Catalog\Support\VariantDefinitionResolver;
use PHPUnit\Framework\TestCase;

class VariantDefinitionResolverTest extends TestCase
{
    public function test_resolve_or_create_rejects_incompatible_flags(): void
    {
        $resolver = new VariantDefinitionResolver();

        $this->assertNull($resolver->resolveOrCreate(10.0, 'edp', true, true, false));
        $this->assertNull($resolver->resolveOrCreate(10.0, 'edp', false, true, true));
    }

    public function test_resolve_or_create_rejects_unknown_concentration(): void
    {
        $resolver = new VariantDefinitionResolver();

        $this->assertNull($resolver->resolveOrCreate(10.0, 'unknown', false, false, true));
    }

    public function test_resolve_or_create_rejects_miniature_volume_out_of_range(): void
    {
        $resolver = new VariantDefinitionResolver();

        $this->assertNull($resolver->resolveOrCreate(2.0, 'edp', false, false, true));
        $this->assertNull($resolver->resolveOrCreate(18.5, 'edp', false, false, true));
    }

    public function test_is_valid_miniature_volume_accepts_step_0_1(): void
    {
        $resolver = new VariantDefinitionResolver();

        $this->assertTrue($resolver->isValidMiniatureVolume(3.0));
        $this->assertTrue($resolver->isValidMiniatureVolume(7.3));
        $this->assertTrue($resolver->isValidMiniatureVolume(18.0));
        $this->assertFalse($resolver->isValidMiniatureVolume(2.9));
    }
}
