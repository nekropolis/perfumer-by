<?php

namespace Tests\Unit;

use Modules\Checkout\Services\Veter\VeterTicketPayloadBuilder;
use Modules\Checkout\Support\RandomPersonNameGenerator;
use ReflectionMethod;
use Tests\TestCase;

class VeterTicketCustomerNameTest extends TestCase
{
    public function test_first_name_and_patronymic_without_last_name_stay_in_their_fields(): void
    {
        $parsed = $this->parse('Анна Ивановна');

        $this->assertSame('Анна', $parsed['first']);
        $this->assertSame('', $parsed['last']);
        $this->assertSame('Ивановна', $parsed['patronymic']);
    }

    public function test_surname_that_looks_like_a_first_name_stays_the_surname(): void
    {
        $parsed = $this->parse('Анна тест Ивановна');

        $this->assertSame('Анна', $parsed['first']);
        $this->assertSame('тест', $parsed['last']);
        $this->assertSame('Ивановна', $parsed['patronymic']);
    }

    public function test_first_and_last_name_without_patronymic_are_unchanged(): void
    {
        $parsed = $this->parse('Анна Иванова');

        $this->assertSame('Анна', $parsed['first']);
        $this->assertSame('Иванова', $parsed['last']);
        $this->assertSame('', $parsed['patronymic']);
    }

    /**
     * @return array{first: string, last: string, patronymic: string}
     */
    private function parse(string $full): array
    {
        $builder = new VeterTicketPayloadBuilder(new RandomPersonNameGenerator);
        $method = new ReflectionMethod(VeterTicketPayloadBuilder::class, 'parseCustomerName');

        return $method->invoke($builder, $full);
    }
}
