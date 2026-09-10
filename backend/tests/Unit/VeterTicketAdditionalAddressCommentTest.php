<?php

namespace Tests\Unit;

use Modules\Checkout\Models\Order;
use Modules\Checkout\Services\Veter\VeterTicketPayloadBuilder;
use Modules\Checkout\Support\RandomPersonNameGenerator;
use ReflectionMethod;
use Tests\TestCase;

class VeterTicketAdditionalAddressCommentTest extends TestCase
{
    public function test_additional_address_is_appended_to_courier_comments(): void
    {
        $order = new Order;
        $order->delivery_time_from = '10:00';
        $order->delivery_time_to = '18:00';
        $order->delivery_comment = 'Домофон 12';
        $order->additional_delivery_street_prefix = 'ул.';
        $order->additional_delivery_address = 'Ленина';
        $order->additional_delivery_house = '5';
        $order->additional_delivery_korpus = '1';
        $order->additional_delivery_apartment = '10';

        $comments = $this->commentsFor($order);

        $this->assertStringContainsString('10:00 – 18:00', $comments);
        $this->assertStringContainsString('Домофон 12', $comments);
        $this->assertStringContainsString('По адресу до 18:00', $comments);
        $this->assertStringContainsString('Потом - ул. Ленина, д. 5, корп. 1, кв. 10', $comments);
    }

    public function test_empty_additional_address_does_not_add_courier_note(): void
    {
        $order = new Order;
        $order->delivery_time_to = '18:00';
        $order->additional_delivery_address = '';

        $comments = $this->commentsFor($order);

        $this->assertStringNotContainsString('По адресу до', $comments);
    }

    public function test_prefix_only_additional_address_does_not_add_courier_note(): void
    {
        $order = new Order;
        $order->delivery_time_to = '18:00';
        $order->additional_delivery_street_prefix = 'ул.';
        $order->additional_delivery_address = '';

        $comments = $this->commentsFor($order);

        $this->assertStringNotContainsString('По адресу до', $comments);
        $this->assertStringNotContainsString('ул.', $comments);
    }

    private function commentsFor(Order $order): string
    {
        $builder = new VeterTicketPayloadBuilder(new RandomPersonNameGenerator);
        $method = new ReflectionMethod(VeterTicketPayloadBuilder::class, 'buildComments');

        return $method->invoke($builder, $order);
    }
}
