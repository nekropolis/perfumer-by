<?php

namespace Modules\Communications\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SendToCrmEvent implements ShouldBroadcastNow
{
    use Dispatchable;
    use SerializesModels;

    /**
     * @param  array{id: int, name: string|null}|null  $matchedUser
     * @param  array{completed: int, active: int, cancelled: int}  $orders
     */
    public function __construct(
        public int $managerUserId,
        public string $deviceId,
        public string $deviceLabel,
        public string $phone,
        public string $trigger,
        public int $receivedAt,
        public ?array $matchedUser,
        public ?string $customerName,
        public array $orders,
    ) {}

    /**
     * @return array<int, PrivateChannel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('manager.'.$this->managerUserId.'.incoming-calls'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'SendToCrmEvent';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'device_id' => $this->deviceId,
            'device_label' => $this->deviceLabel,
            'phone' => $this->phone,
            'trigger' => $this->trigger,
            'received_at' => $this->receivedAt,
            'matched_user' => $this->matchedUser,
            'customer_name' => $this->customerName,
            'orders' => $this->orders,
        ];
    }
}
