<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;
use ReflectionMethod;
use Tests\TestCase;

class VanilleHttpClientTest extends TestCase
{
    public function test_build_http_sets_timeout_and_connect_timeout(): void
    {
        $client = new VanilleHttpClient();
        $method = new ReflectionMethod($client, 'buildHttp');
        $method->setAccessible(true);

        /** @var \Illuminate\Http\Client\PendingRequest $request */
        $request = $method->invoke($client, 25);
        $options = $request->getOptions();

        $this->assertSame(25, $options['timeout'] ?? null);
        $this->assertSame(25, $options['connect_timeout'] ?? null);
        $this->assertFalse($options['verify'] ?? true);
    }

    public function test_build_http_enables_retry(): void
    {
        $client = new VanilleHttpClient();
        $method = new ReflectionMethod($client, 'buildHttp');
        $method->setAccessible(true);

        /** @var \Illuminate\Http\Client\PendingRequest $request */
        $request = $method->invoke($client, 25);

        $tries = (new \ReflectionProperty($request, 'tries'))->getValue($request);
        $retryDelay = (new \ReflectionProperty($request, 'retryDelay'))->getValue($request);

        $this->assertSame(2, $tries);
        $this->assertSame(1000, $retryDelay);
    }
}
