<?php

namespace Tests\Unit;

use Modules\Checkout\Support\RandomPersonNameGenerator;
use PHPUnit\Framework\TestCase;

class RandomPersonNameGeneratorTest extends TestCase
{
    private RandomPersonNameGenerator $names;

    protected function setUp(): void
    {
        parent::setUp();
        $this->names = new RandomPersonNameGenerator;
    }

    public function test_female_first_name_gets_feminine_last_name(): void
    {
        $seed = 1;
        $male = $this->names->randomLastName($seed, 'Иван');
        $female = $this->names->randomLastName($seed, 'Ольга');

        $this->assertNotSame($male, $female);
        if (str_ends_with($male, 'ский')) {
            $this->assertSame(mb_substr($male, 0, -4).'ская', $female);
        } else {
            $this->assertSame($male.'а', $female);
        }
    }

    public function test_male_first_name_keeps_masculine_last_name(): void
    {
        $seed = 42;
        $withMale = $this->names->randomLastName($seed, 'Иван');
        $empty = $this->names->randomLastName($seed, '');

        $this->assertSame($empty, $withMale);
        $this->assertFalse(str_ends_with($withMale, 'а'));
        $this->assertFalse(str_ends_with($withMale, 'ая'));
    }

    public function test_empty_first_name_keeps_masculine_last_name(): void
    {
        $last = $this->names->randomLastName(7, '');

        $this->assertFalse(str_ends_with($last, 'а'));
        $this->assertFalse(str_ends_with($last, 'ая'));
    }

    public function test_skiy_surname_becomes_skaya_for_female(): void
    {
        $seed = $this->findSeedForLastName('Михайловский');
        $this->assertNotNull($seed, 'Could not find seed for Михайловский');

        $male = $this->names->randomLastName($seed, 'Иван');
        $female = $this->names->randomLastName($seed, 'Ольга');

        $this->assertSame('Михайловский', $male);
        $this->assertSame('Михайловская', $female);
    }

    public function test_same_seed_same_stem_across_genders(): void
    {
        $seed = 100;
        $male = $this->names->randomLastName($seed, 'Пётр');
        $female = $this->names->randomLastName($seed, 'Анна');

        if (str_ends_with($male, 'ский')) {
            $this->assertSame(mb_substr($male, 0, -4).'ская', $female);
        } else {
            $this->assertSame($male.'а', $female);
        }
    }

    public function test_female_patronymic_still_selected_by_first_name(): void
    {
        $seed = 5;
        $male = $this->names->randomPatronymic($seed, 'Иван');
        $female = $this->names->randomPatronymic($seed, 'Ольга');

        $this->assertTrue(str_ends_with($male, 'ич'));
        $this->assertTrue(str_ends_with($female, 'на'));
    }

    private function findSeedForLastName(string $expected): ?int
    {
        for ($seed = 0; $seed < 5000; $seed++) {
            if ($this->names->randomLastName($seed, '') === $expected) {
                return $seed;
            }
        }

        return null;
    }
}
