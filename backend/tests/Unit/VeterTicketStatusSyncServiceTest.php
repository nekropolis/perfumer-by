<?php

namespace Tests\Unit;

use Modules\Checkout\Services\Veter\VeterTicketStatusSyncService;
use Tests\TestCase;

class VeterTicketStatusSyncServiceTest extends TestCase
{
    public function test_warehouse_status_hands_off_on_transition(): void
    {
        $this->assertTrue(VeterTicketStatusSyncService::shouldApplyDeliveryHandoff(
            'assembled',
            'На складе',
            null,
        ));
        $this->assertTrue(VeterTicketStatusSyncService::shouldApplyDeliveryHandoff(
            'in_delivery',
            'На складе',
            'Обработан',
        ));
    }

    public function test_warehouse_status_does_not_repeat_while_it_stays(): void
    {
        $this->assertFalse(VeterTicketStatusSyncService::shouldApplyDeliveryHandoff(
            'in_delivery',
            'На складе',
            'На складе',
        ));
    }

    public function test_in_transit_hands_off_only_while_order_is_still_assembled(): void
    {
        $this->assertTrue(VeterTicketStatusSyncService::shouldApplyDeliveryHandoff(
            'assembled',
            'В пути',
            'На складе',
        ));
        $this->assertTrue(VeterTicketStatusSyncService::shouldApplyDeliveryHandoff(
            'assembled',
            'в пути',
            'В пути',
        ));
        $this->assertFalse(VeterTicketStatusSyncService::shouldApplyDeliveryHandoff(
            'in_delivery',
            'В пути',
            'На складе',
        ));
    }

    public function test_later_courier_statuses_do_not_hand_off(): void
    {
        $this->assertFalse(VeterTicketStatusSyncService::shouldApplyDeliveryHandoff(
            'assembled',
            'Доставлен',
            'В пути',
        ));
    }
}
