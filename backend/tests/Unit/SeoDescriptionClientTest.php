<?php

namespace Tests\Unit;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Modules\Catalog\Services\SeoDescription\SeoDescriptionClient;
use Modules\Catalog\Services\SeoDescription\SeoDescriptionException;
use Tests\TestCase;

class SeoDescriptionClientTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config()->set('seo_description.url', 'http://seo.test/api');
        config()->set('seo_description.token', 'secret-site-token');
        config()->set('seo_description.get_retries', 0);
    }

    public function test_dispatch_sends_bearer_token_and_validates_response(): void
    {
        Http::fake([
            'http://seo.test/api/generate' => Http::response([
                'job_id' => '5f2f9bde-6493-4f19-bfa0-cda4ec768f2c',
                'status' => 'pending',
            ], 202),
        ]);

        $response = app(SeoDescriptionClient::class)->dispatch([
            'product_name' => 'Dior Sauvage',
            'fields' => ['seo_title' => null],
            'site' => 'perfumer',
        ]);

        $this->assertSame('pending', $response['status']);
        Http::assertSent(function (Request $request): bool {
            return $request->url() === 'http://seo.test/api/generate'
                && $request->hasHeader('Authorization', 'Bearer secret-site-token')
                && $request->hasHeader('Accept', 'application/json')
                && $request['fields'] === ['seo_title' => null];
        });
    }

    public function test_status_accepts_process_failure_in_http_200(): void
    {
        Http::fake([
            'http://seo.test/api/generate/job-1' => Http::response([
                'job_id' => 'job-1',
                'status' => 'failed',
                'result' => null,
                'error' => 'Generation failed',
            ]),
        ]);

        $response = app(SeoDescriptionClient::class)->status('job-1');

        $this->assertSame('failed', $response['status']);
        $this->assertSame('Generation failed', $response['error']);
        Http::assertSent(fn (Request $request): bool => $request->url() === 'http://seo.test/api/generate/job-1');
    }

    public function test_exception_does_not_expose_token_or_response_body(): void
    {
        Http::fake([
            'http://seo.test/api/generate' => Http::response([
                'message' => 'secret-site-token',
            ], 403),
        ]);

        try {
            app(SeoDescriptionClient::class)->dispatch(['product_name' => 'Test']);
            $this->fail('Exception was not thrown.');
        } catch (SeoDescriptionException $e) {
            $this->assertStringNotContainsString('secret-site-token', $e->getMessage());
            $this->assertSame('SEO API dispatch request failed (HTTP 403).', $e->getMessage());
        }
    }

    public function test_not_found_status_error_is_not_retryable(): void
    {
        Http::fake([
            'http://seo.test/api/generate/missing' => Http::response([
                'message' => 'Job not found.',
            ], 404),
        ]);

        try {
            app(SeoDescriptionClient::class)->status('missing');
            $this->fail('Exception was not thrown.');
        } catch (SeoDescriptionException $e) {
            $this->assertFalse($e->retryable);
            $this->assertSame('SEO API status request failed (HTTP 404).', $e->getMessage());
        }
    }

    public function test_missing_token_has_a_clear_safe_error(): void
    {
        config()->set('seo_description.token', '');

        $this->expectException(SeoDescriptionException::class);
        $this->expectExceptionMessage('Токен SEO API не настроен.');

        app(SeoDescriptionClient::class)->dispatch(['product_name' => 'Test']);
    }
}
