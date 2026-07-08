<?php

namespace Tests\Unit;

use Modules\Communications\Services\Monitoring\ServerHealthMonitorService;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\TestCase;

class ServerHealthMonitorServiceTest extends TestCase
{
    private ServerHealthMonitorService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(ServerHealthMonitorService::class);
    }

    /**
     * @param  array{state: string, uptime_seconds: int|null}  $expected
     */
    #[DataProvider('supervisorStatusProvider')]
    public function test_parse_supervisor_status_line(string $line, array $expected): void
    {
        $method = new ReflectionMethod($this->service, 'parseSupervisorStatusLine');
        $method->setAccessible(true);

        $this->assertSame($expected, $method->invoke($this->service, $line));
    }

    /**
     * @return list<array{0: string, 1: array{state: string, uptime_seconds: int|null}}>
     */
    public static function supervisorStatusProvider(): array
    {
        return [
            [
                'perfumer-queue_00     RUNNING   pid 12345, uptime 2 days, 15:30:00',
                ['state' => 'RUNNING', 'uptime_seconds' => 2 * 86400 + 15 * 3600 + 30 * 60],
            ],
            [
                'perfumer-queue_00     RUNNING   pid 12345, uptime 0:05:32',
                ['state' => 'RUNNING', 'uptime_seconds' => 332],
            ],
            [
                'perfumer-queue_00     BACKOFF   Exited too quickly (process log may have details)',
                ['state' => 'BACKOFF', 'uptime_seconds' => null],
            ],
            [
                'perfumer-queue_00     FATAL     Exited too quickly',
                ['state' => 'FATAL', 'uptime_seconds' => null],
            ],
        ];
    }

    public function test_parse_uptime_to_seconds_parses_days_and_time(): void
    {
        $method = new ReflectionMethod($this->service, 'parseUptimeToSeconds');
        $method->setAccessible(true);

        $this->assertSame(2 * 86400 + 15 * 3600 + 30 * 60 + 45, $method->invoke($this->service, '2 days, 15:30:45'));
        $this->assertSame(5 * 60 + 32, $method->invoke($this->service, '0:05:32'));
        $this->assertSame(3600, $method->invoke($this->service, '1:00:00'));
        $this->assertNull($method->invoke($this->service, ''));
    }
}
