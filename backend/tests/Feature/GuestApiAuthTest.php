<?php

namespace Tests\Feature;

use Tests\TestCase;

class GuestApiAuthTest extends TestCase
{
    public function test_guest_api_request_without_json_accept_returns_401(): void
    {
        $response = $this->call(
            'GET',
            '/api/admin/import-export/allparfume/sync/active',
            server: ['HTTP_ACCEPT' => 'text/html'],
        );

        $response->assertUnauthorized();
        $response->assertJson(['message' => 'Unauthenticated.']);
    }
}
