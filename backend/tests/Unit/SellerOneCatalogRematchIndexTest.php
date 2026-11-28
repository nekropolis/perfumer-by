<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Support\SellerOneCatalogRematchIndex;
use PHPUnit\Framework\TestCase;

class SellerOneCatalogRematchIndexTest extends TestCase
{
    public function test_rematch_only_when_name_is_in_catalog_and_brand_hash_is_new(): void
    {
        $this->assertTrue(SellerOneCatalogRematchIndex::shouldRematch(null, null, true, null, 'hash-a'));
        $this->assertTrue(SellerOneCatalogRematchIndex::shouldRematch(null, null, true, 'hash-a', 'hash-b'));

        $this->assertFalse(SellerOneCatalogRematchIndex::shouldRematch(null, null, true, 'hash-a', 'hash-a'));
        $this->assertFalse(SellerOneCatalogRematchIndex::shouldRematch(null, null, false, null, 'hash-b'));
        $this->assertFalse(SellerOneCatalogRematchIndex::shouldRematch(27938, null, true, null, 'hash-b'));
        $this->assertFalse(SellerOneCatalogRematchIndex::shouldRematch(null, 33082, true, null, 'hash-b'));
        $this->assertFalse(SellerOneCatalogRematchIndex::shouldRematch('0', '', false, null, null));
    }

    public function test_name_keys_keep_full_name_and_drop_known_line_suffix(): void
    {
        $this->assertSame(
            ['dahlia divin eau de parfum', 'dahlia divin'],
            SellerOneCatalogRematchIndex::nameKeys('dahlia divin eau de parfum'),
        );
        $this->assertSame(
            ['lovely prism for woman eau de parfum', 'lovely prism for woman', 'lovely prism'],
            SellerOneCatalogRematchIndex::nameKeys('lovely prism for woman eau de parfum'),
        );
        $this->assertSame(
            ['into the blue'],
            SellerOneCatalogRematchIndex::nameKeys('into the blue'),
        );
    }

    public function test_product_added_later_becomes_a_rematch_candidate(): void
    {
        $brands = [
            ['id' => 691, 'name' => 'Givenchy'],
        ];
        $before = SellerOneCatalogRematchIndex::buildFromRows($brands, []);
        $line = SellerOneCatalogRematchIndex::resolveLine(
            'Givenchy',
            'Into The Blue',
            '',
            $before,
        );

        $this->assertNotNull($line);
        $this->assertFalse(SellerOneCatalogRematchIndex::containsName($before, $line['brand_id'], $line['name']));
        $this->assertFalse(SellerOneCatalogRematchIndex::shouldRematch(
            null,
            null,
            false,
            null,
            $before['hashes'][$line['brand_id']] ?? null,
        ));

        $after = SellerOneCatalogRematchIndex::buildFromRows($brands, [
            691 => [
                ['id' => 27938, 'name' => 'Into The Blue'],
            ],
        ]);

        $this->assertTrue(SellerOneCatalogRematchIndex::containsName($after, 691, 'into the blue'));
        $this->assertNotSame($before['hashes'][691] ?? null, $after['hashes'][691]);
        $this->assertTrue(SellerOneCatalogRematchIndex::shouldRematch(
            null,
            null,
            true,
            $before['hashes'][691] ?? null,
            $after['hashes'][691],
        ));
        $this->assertFalse(SellerOneCatalogRematchIndex::shouldRematch(
            null,
            null,
            true,
            $after['hashes'][691],
            $after['hashes'][691],
        ));
    }

    public function test_title_without_parsed_brand_uses_first_token_bucket(): void
    {
        $index = SellerOneCatalogRematchIndex::buildFromRows(
            [
                ['id' => 1, 'name' => 'Acqua di Parma'],
                ['id' => 691, 'name' => 'Givenchy'],
            ],
            [
                691 => [
                    ['id' => 10, 'name' => 'Into The Blue Eau de Parfum'],
                ],
            ],
        );

        $line = SellerOneCatalogRematchIndex::resolveLine(
            '',
            '',
            'Givenchy Into The Blue (L)',
            $index,
        );

        $this->assertSame(['brand_id' => 691, 'name' => 'into the blue'], $line);
        $this->assertTrue(SellerOneCatalogRematchIndex::containsName($index, 691, 'into the blue'));
    }

    public function test_rewritten_ysl_title_hits_yves_saint_laurent_line(): void
    {
        $index = SellerOneCatalogRematchIndex::buildFromRows(
            [
                ['id' => 1797, 'name' => 'Yves Saint Laurent'],
            ],
            [
                1797 => [
                    ['id' => 8165, 'name' => 'Black Opium'],
                ],
            ],
        );

        $raw = SellerOneCatalogRematchIndex::resolveLine('', '', 'YSL Black Opium (L)', $index);
        $rewritten = SellerOneCatalogRematchIndex::resolveLine('', '', 'Yves Saint Laurent Black Opium (L)', $index);

        $this->assertNull($raw);
        $this->assertSame(['brand_id' => 1797, 'name' => 'black opium'], $rewritten);
        $this->assertTrue(SellerOneCatalogRematchIndex::containsName($index, 1797, 'black opium'));
    }
}
